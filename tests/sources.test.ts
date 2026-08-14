// source 构建层：真实上游被 mock 掉之后，脚本对上游异常的反应——降级、丢弃、回退、契约拒收。
// 断言的是分支走向和拒收理由，不是渲染出来的中文句子；纯计算在 pure.test.ts，账本不变量在 ledgers.test.ts。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildForeignTechPodcastSource } from "../scripts/foreign_tech_podcast_source.ts";
import { buildGitHubTrendingDailySource } from "../scripts/github_trending_daily_source.ts";
import { buildMdblistWeeklySource } from "../scripts/mdblist_weekly_source.ts";
import { appendMdblistRecommendations } from "../scripts/mdblist_weekly_ledger.ts";
import { buildXyzRankTopEpisodesSource } from "../scripts/xyzrank_top_episodes_source.ts";
import { REDDIT_CATEGORIES } from "../scripts/reddit_top20_compose.ts";
import {
  type RedditSourcePolicy,
  fetchRedditSourceFromApi,
  parseRedditSourceApiResponse,
  redditSubredditStatsLogLines,
} from "../scripts/reddit_source_api.ts";
import { parseRedditPostDetailResponse } from "../scripts/reddit_life_wechat_source.ts";
import { fixture, tempDir, tempFile, withMocks } from "./helpers/mocks.ts";

// ------------------------------------------------------------ GitHub Trending

test("GitHub trending source overwrites an existing daily archive", async () => {
  const repo = tempDir("github-trending-archive");
  const dataDir = path.join(repo, "data/github-trending");
  fs.mkdirSync(dataDir, { recursive: true });
  const archiveFile = path.join(dataDir, "2099-01-06.json");
  fs.writeFileSync(archiveFile, JSON.stringify({ stale: true, repos: [] }, null, 2));

  const source = await withMocks(
    {
      fetch: async input => {
        const url = String(input);
        if (url.includes("github.com/trending")) return new Response(fixture("html/github-trending-daily.html"), { status: 200 });
        if (url.includes("api.github.com/repos/")) {
          return Response.json({ content: Buffer.from("README content for generated archive").toString("base64"), encoding: "base64" });
        }
        return new Response("", { status: 404 });
      },
    },
    () => buildGitHubTrendingDailySource("2099-01-06", { dataDir, limit: 1 }),
  );

  const payload = JSON.parse(fs.readFileSync(archiveFile, "utf8")) as { stale?: boolean; date?: string; repos?: unknown[] };
  assert.equal(payload.stale, undefined);
  assert.equal(payload.date, "2099-01-06");
  assert.equal(payload.repos?.length, 1);
  assert.match(source, /结构化数据归档/);
});

// ------------------------------------------------------------------- Podcasts

const USABLE_TRANSCRIPT =
  "This transcript discusses AI engineering review gates, rollback paths, observability, release safety, ownership queues, security boundaries, and production incident response in enough detail to support a useful technical podcast note.";

function curatedEpisodesFile(episodes: unknown[]): string {
  const file = tempFile("podcast-curated", "episodes.json");
  fs.writeFileSync(file, JSON.stringify({ episodes }, null, 2));
  return file;
}

function curatedEpisode(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    archiveDate: "2026-06-23",
    show: "Curated Show",
    source: "Curated Transcript",
    date: "2026-06-23",
    description: "Curated episode with transcript.",
    ...overrides,
  };
}

test("foreign tech podcast source trims oversized transcripts for prompt stability", async () => {
  const transcript = `HEAD_SENTINEL ${"engineering signal ".repeat(2200)} TAIL_SENTINEL`;
  const source = await withMocks(
    {
      env: {
        PODCAST_DISABLE_RSS: "true",
        PODCAST_MIN_EPISODES: "1",
        PODCAST_MAX_EPISODES: "1",
        PODCAST_AUDIO_TRANSCRIBE: "false",
        PODCAST_TEST_EPISODES_FILE: curatedEpisodesFile([
          curatedEpisode({ title: "Operating AI Platforms Under Load", show: "Latent Space", guest: "Platform Lead", link: "https://example.com/podcast/platform-load", transcript }),
        ]),
        PODCAST_MIN_TRANSCRIPT_CHARS: "120",
        PODCAST_PROMPT_TRANSCRIPT_CHARS: "4000",
      },
    },
    () => buildForeignTechPodcastSource("2026-06-23"),
  );
  // Head and tail both survive the clip so the model still sees where the episode starts and ends.
  assert.match(source, /HEAD_SENTINEL/);
  assert.match(source, /TAIL_SENTINEL/);
  assert.match(source, /\[transcript clipped for prompt\]/);
  assert.ok(source.length < transcript.length);
});

// Every one of these is "an episode that cannot produce usable evidence must be dropped, and the
// run continues on whatever is left" — the differences are only in how the episode goes bad.
const UNUSABLE_EPISODE_CASES = [
  {
    name: "blocked audio download",
    extraEpisodes: [curatedEpisode({ title: "Blocked Audio Episode", show: "Blocked Show", source: "Blocked Feed", link: "https://example.com/podcast/blocked", audioUrl: "https://example.com/audio/blocked.mp3" })],
    env: { PODCAST_AUDIO_TRANSCRIBE: "true", PODCAST_MAX_EPISODES: "2" },
    fetch: async () => new Response("forbidden", { status: 403 }),
    dropped: /Blocked Audio Episode/,
  },
  {
    name: "audio download past the per-episode timeout",
    extraEpisodes: [curatedEpisode({ title: "Never Ending Audio Episode", show: "Slow Show", source: "Slow Feed", link: "https://example.com/podcast/slow", audioUrl: "https://example.com/audio/slow.mp3" })],
    env: { PODCAST_AUDIO_TRANSCRIBE: "true", PODCAST_MAX_EPISODES: "2", PODCAST_AUDIO_DOWNLOAD_TIMEOUT_MS: "10" },
    fetch: (async (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("audio download missing abort signal"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            const error = new Error("This operation was aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      })) as (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
    dropped: /Never Ending Audio Episode/,
  },
] as const;

test("foreign tech podcast source drops episodes without usable transcript evidence", async () => {
  for (const testCase of UNUSABLE_EPISODE_CASES) {
    const source = await withMocks(
      {
        fetch: testCase.fetch,
        env: {
          PODCAST_DISABLE_RSS: "true",
          PODCAST_MIN_EPISODES: "1",
          PODCAST_MIN_TRANSCRIPT_CHARS: "120",
          PODCAST_TEST_EPISODES_FILE: curatedEpisodesFile([
            curatedEpisode({ title: "Reliable Agent Review Loops", link: "https://example.com/podcast/review-loops", transcript: USABLE_TRANSCRIPT }),
            ...testCase.extraEpisodes,
          ]),
          ...testCase.env,
        },
      },
      () => buildForeignTechPodcastSource("2026-06-23"),
    );
    assert.match(source, /Reliable Agent Review Loops/, testCase.name);
    assert.doesNotMatch(source, testCase.dropped, testCase.name);
  }

  // Metadata-only episode: nothing usable at all, so the task fails instead of publishing a stub.
  await withMocks(
    {
      env: {
        PODCAST_DISABLE_RSS: "true",
        PODCAST_MIN_EPISODES: "1",
        PODCAST_MAX_EPISODES: "1",
        PODCAST_AUDIO_TRANSCRIBE: "false",
        PODCAST_TEST_EPISODES_FILE: curatedEpisodesFile([
          curatedEpisode({
            title: "Building the Infrastructure for ASI | Ganesh Krishnan | Ep. 219",
            show: "Localization Fireside Chat",
            source: "YouTube",
            guest: "Ganesh Krishnan",
            link: "https://www.youtube.com/watch?v=H8M47RYi024",
            description: "Only title, guest, link, thumbnail, and a short curated boundary note are available. No transcript or original show notes are stored.",
          }),
        ]),
      },
    },
    () => assert.rejects(() => buildForeignTechPodcastSource("2026-06-23"), /found only 0 usable episodes/),
  );
});

test("daily podcasts fetch skips episodes already in the summarized ledger", async () => {
  const ledgerFile = tempFile("podcast-ledger", "summarized.json");
  const duplicateTitle = "The Co-Founders of Claude AI Tell Oprah About the Impact Artificial Intelligence Has on Your Life";
  fs.writeFileSync(
    ledgerFile,
    `${JSON.stringify({
      version: 1,
      episodes: [
        {
          title: duplicateTitle,
          show: "The Oprah Podcast",
          link: "https://podcasts.apple.com/us/podcast/the-co-founders-of-claude-ai-tell-oprah-about/id1782960381?i=1000768533274&utm_source=copy&uo=4",
          date: "2026-05-19",
          archivedAt: "2026-06-22",
        },
      ],
    })}\n`,
  );

  const source = await withMocks(
    {
      env: {
        PODCAST_DISABLE_RSS: "true",
        PODCAST_MIN_EPISODES: "3",
        PODCAST_MAX_EPISODES: "3",
        PODCAST_AUDIO_TRANSCRIBE: "false",
        PODCAST_SUMMARIZED_LEDGER_FILE: ledgerFile,
        PODCAST_MIN_TRANSCRIPT_CHARS: "120",
        PODCAST_TEST_EPISODES_FILE: curatedEpisodesFile([
          // Same episode as the ledger entry, but with different tracking params on the link.
          curatedEpisode({
            title: duplicateTitle,
            show: "The Oprah Podcast",
            source: "Apple Podcasts",
            date: "2026-05-19",
            link: "https://podcasts.apple.com/us/podcast/the-co-founders-of-claude-ai-tell-oprah-about/id1782960381?i=1000768533274&uo=4",
            transcript: USABLE_TRANSCRIPT,
          }),
          ...["How Anthropic Uses Claude Fable 5 With Mike Krieger", "Most of the Web Will Never Get APIs for AI Agents | Dhruv Batra", "Building Reliable AI Developer Platforms"].map((title, index) =>
            curatedEpisode({ title, link: `https://example.com/podcast/${index}`, transcript: USABLE_TRANSCRIPT }),
          ),
        ]),
      },
    },
    () => buildForeignTechPodcastSource("2026-06-23"),
  );

  assert.doesNotMatch(source, /The Oprah Podcast/);
  assert.doesNotMatch(source, /The Co-Founders of Claude AI Tell Oprah/);
  assert.match(source, /How Anthropic Uses Claude Fable 5 With Mike Krieger/);
  assert.equal((source.match(/^### \d+\./gm) || []).length, 3);
});

test("XYZ Rank top episodes source extracts Xiaoyuzhou audio links", async () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    rank: index + 1,
    title: `热门单集 ${index + 1}`,
    podcastName: `中文播客 ${index + 1}`,
    link: `https://www.xiaoyuzhoufm.com/episode/test-${index + 1}`,
    duration: 60 + index,
    playCount: 1000 + index,
    commentCount: 100 + index,
    primaryGenreName: "社会与文化",
    postTime: "2099-01-05T00:00:00.000Z",
    logoURL: "https://image.xyzcdn.net/demo.png",
  }));
  const source = await withMocks(
    {
      fetch: async input => {
        const url = String(input);
        if (url.includes("xyzrank.com/api/episodes")) return Response.json({ items });
        const match = url.match(/test-(\d+)/);
        if (match) {
          return new Response(
            `<html><head><meta property="og:audio" content="https://media.xyzcdn.net/test/audio-${match[1]}.m4a"/><script name="schema:podcast-show" type="application/ld+json">{"description":"这一期节目讨论沟通边界和关系协商。"}</script></head></html>`,
          );
        }
        return new Response("not found", { status: 404 });
      },
    },
    () => buildXyzRankTopEpisodesSource("2099-01-06", 5),
  );
  assert.match(source, /XYZ Rank 热门播客单集候选源/);
  assert.equal((source.match(/^##\s+\d+\.\s+/gm) || []).length, 5);
  assert.match(source, /- 音频：https:\/\/media\.xyzcdn\.net\/test\/audio-1\.m4a/);
  assert.match(source, /- 节目：中文播客 5/);
});

test("XYZ Rank top episodes source falls back to reader links when API is blocked", async () => {
  const source = await withMocks(
    {
      fetch: async input => {
        const url = String(input);
        if (url.includes("xyzrank.com/api/episodes")) return new Response("blocked", { status: 403 });
        if (url.includes("r.jina.ai")) {
          return new Response(
            [
              "Title: 中文播客榜",
              "",
              "Markdown Content:",
              "1[![Image 1](https://image.example.com/one.jpg)](https://www.xiaoyuzhoufm.com/episode/fallback-1)123 4 0.1%5.0%42′1天前 科技",
              "2[![Image 2](https://image.example.com/two.jpg)](https://www.xiaoyuzhoufm.com/episode/fallback-2)99 3 0.1%4.0%38′2天前 商务",
            ].join("\n"),
          );
        }
        const match = url.match(/fallback-(\d+)/);
        if (match) {
          return new Response(
            `<html><head><meta property="og:audio" content="https://media.xyzcdn.net/fallback/audio-${match[1]}.m4a"/><script name="schema:podcast-show" type="application/ld+json">{"name":"兜底单集 ${match[1]}","datePublished":"2099-01-05T00:00:00.000Z","timeRequired":"PT42M","description":"兜底详情页描述","associatedMedia":{"contentUrl":"https://media.xyzcdn.net/fallback/jsonld-${match[1]}.m4a"},"partOfSeries":{"name":"兜底节目 ${match[1]}"}}</script></head></html>`,
          );
        }
        return new Response("not found", { status: 404 });
      },
    },
    () => buildXyzRankTopEpisodesSource("2099-01-06", 2),
  );
  assert.equal((source.match(/^##\s+\d+\.\s+/gm) || []).length, 2);
  assert.match(source, /## 1\. 兜底单集 1/);
  assert.match(source, /- 节目：兜底节目 2/);
  // JSON-LD `associatedMedia.contentUrl` wins over the og:audio tag.
  assert.match(source, /- 音频：https:\/\/media\.xyzcdn\.net\/fallback\/jsonld-1\.m4a/);
  assert.match(source, /- 日期：2099-01-05/);
});

test("mdblist source builder applies the previous-month window and locally enforces IMDb >= 6 candidates", async () => {
  const ledgerFile = tempFile("mdblist-source", "recommended.json");
  appendMdblistRecommendations(
    [
      { key: "movie:1", mediaType: "movie", tmdbId: 1, title: "Seen Movie" },
      { key: "show:11:season:1", mediaType: "show", tmdbId: 11, seasonNumber: 1, title: "Seen Show" },
    ],
    { archivedAt: "2099-01-02", postPath: "previous.md" },
    ledgerFile,
  );

  // tmdb id -> detail payload. Rejection reason is encoded in the payload itself:
  // 2/15 are outside the release window, 3/12 are below IMDb 6, 13 has no IMDb rating, 14 has no aired episodes.
  const DETAILS: Record<string, unknown> = {
    "movie/1": { released: "2098-12-09", ratings: [{ source: "imdb", value: 8 }], genres: [] },
    "movie/2": { released: "2098-12-02", ratings: [{ source: "imdb", value: 8 }], genres: [] },
    "movie/3": { released: "2098-12-09", ratings: [{ source: "imdb", value: 5.9 }], genres: [] },
    "movie/4": { released: "2098-12-03", ratings: [{ source: "imdb", value: 6 }], genres: [] },
    "show/11": { released: "2098-12-09", ratings: [{ source: "imdb", value: 8 }], seasons: [{ season_number: 1, episodes: [{ votes: 5, rating: 8 }] }] },
    "show/12": { released: "2098-12-09", ratings: [{ source: "imdb", value: 5.9 }], seasons: [{ season_number: 1, episodes: [{ votes: 5, rating: 8 }] }] },
    "show/13": { released: "2098-12-09", ratings: [], seasons: [{ season_number: 1, episodes: [{ votes: 5, rating: 8 }] }] },
    "show/14": { released: "2098-12-09", ratings: [{ source: "imdb", value: 8 }], seasons: [{ season_number: 1, episodes: [{ votes: 0, rating: null }] }] },
    "show/15": { released: "2098-12-02", ratings: [{ source: "imdb", value: 8 }], seasons: [{ season_number: 2, episodes: [{ votes: 2, rating: 7 }] }] },
    "show/16": { released: "2098-12-09", ratings: [{ source: "imdb", value: 6 }], seasons: [{ season_number: 2, episodes: [{ votes: 2, rating: 7 }] }] },
  };

  const source = await withMocks(
    {
      env: { MDBLIST_API_KEY: "test-key" },
      fetch: async input => {
        const url = new URL(String(input));
        const listMatch = url.pathname.match(/\/lists\/(87667|88434)\/items/);
        if (listMatch) {
          const dateFiltered = url.searchParams.has("released_from");
          if (dateFiltered) {
            assert.equal(url.searchParams.get("released_from"), "2098-12-03");
            assert.equal(url.searchParams.get("released_to"), "2098-12-09");
          }
          const payload =
            listMatch[1] === "87667"
              ? {
                  movies: [
                    { title: "Seen Movie", ids: { tmdb: 1 } },
                    ...(dateFiltered ? [] : [{ title: "Old Movie", ids: { tmdb: 2 } }]),
                    { title: "Low Rated Movie", ids: { tmdb: 3 } },
                    { title: "Fresh Movie", ids: { tmdb: 4 } },
                  ],
                }
              : {
                  shows: [
                    { title: "Seen Show", ids: { tmdb: 11 } },
                    { title: "Low Rated Show", ids: { tmdb: 12 } },
                    { title: "Missing IMDb Show", ids: { tmdb: 13 } },
                    { title: "Future Show", ids: { tmdb: 14 } },
                    ...(dateFiltered ? [] : [{ title: "Old Show", ids: { tmdb: 15 } }]),
                    { title: "Fresh Show", ids: { tmdb: 16 } },
                  ],
                };
          return new Response(JSON.stringify(payload), { status: 200 });
        }
        const detailMatch = url.pathname.match(/\/tmdb\/(movie|show)\/(\d+)$/);
        const detail = detailMatch ? DETAILS[`${detailMatch[1]}/${detailMatch[2]}`] : undefined;
        return new Response(JSON.stringify(detail || { title: "Unexpected", description: "Unexpected media lookup.", ratings: [], genres: [] }), { status: 200 });
      },
    },
    () => buildMdblistWeeklySource("2099-01-09", 2, { candidatesToFetch: 6, ledgerFile }),
  );

  assert.match(source, /## 1\. Fresh Movie/);
  assert.match(source, /- TMDB ID：4/);
  assert.match(source, /## 1\. Fresh Show/);
  assert.match(source, /- TMDB ID：16/);
  assert.match(source, /- 推荐季度：2/);
  assert.doesNotMatch(source, /## \d+\. (?:Seen Movie|Seen Show|Old Movie|Low Rated Movie|Low Rated Show|Missing IMDb Show|Future Show|Old Show)/);
});

// --------------------------------------------------------------------- Reddit

const REDDIT_POLICY_RESPONSE = {
  detail_comment_limit: 100,
  direct_reply_limit: 10,
  listing_limit: 50,
  listing_period: "day",
  listing_sort: "top",
  max_comment_chars: 800,
  max_detail_candidates: 30,
  max_post_body_chars: 4000,
  min_score: 20,
  requires_top_level_comment: true,
  top_level_comment_limit: 50,
  version: "reddit-source-policy.v1",
} as const;

const REDDIT_POLICY = {
  version: "reddit-source-policy.v1",
  minScore: 20,
  listingLimit: 50,
  maxDetailCandidates: 30,
} satisfies RedditSourcePolicy;

function redditSourceItem(
  rank: number,
  { subreddit = "AskReddit", points = 101 - rank }: { subreddit?: string; points?: number } = {},
): string {
  return [
    `${rank}. [r/${subreddit}] Fixture post ${rank}`,
    `- ⭐ ${points} points · ${rank} 评论`,
    `- 来源：r/${subreddit}`,
    "- 发布时间：2099-01-02T07:00:00Z",
    `- 帖子链接：https://www.reddit.com/r/${subreddit}/comments/fixture${rank}/`,
    "- 正文类型：作者正文",
    "- 正文截断：否",
    "- 正文：Fixture body",
    "- 顶层高赞回答（按赞数排序，共 1 条）：",
    "  1. [100 赞] This is a sufficiently detailed fixture comment for the source contract.",
    "    - 回复 [20 赞] This direct reply corrects or supports the parent comment.",
    "- 高赞直接回复：共 1 条，已附在对应顶层评论下。",
    "",
  ].join("\n");
}

function redditStats(finalBySubreddit: Record<string, number>) {
  return REDDIT_CATEGORIES.flatMap(category =>
    category.subreddits.map(subreddit => {
      const final = finalBySubreddit[subreddit] || 0;
      return { subreddit, listing: final, score_pass: final, min_score: 20, shortlisted: final, detail_ok: final, final, error_code: null };
    }),
  );
}

function redditPayload(source: string, itemCount: number, finalBySubreddit: Record<string, number>) {
  return {
    contract_version: "reddit-top20-source.v7",
    archive_date: "2099-01-02",
    fetched_at: "2099-01-02T08:00:00Z",
    item_count: itemCount,
    source_sha256: createHash("sha256").update(source, "utf8").digest("hex"),
    source,
    policy: REDDIT_POLICY_RESPONSE,
    policy_sha256: createHash("sha256").update(JSON.stringify(REDDIT_POLICY_RESPONSE), "utf8").digest("hex"),
    subreddit_stats: redditStats(finalBySubreddit),
  };
}

test("Reddit source API contract accepts intact v7 server-policy sources", () => {
  const source = `${[1, 2].map(rank => redditSourceItem(rank)).join("\n")}\n===ARCHIVE_PAYLOAD===\n${JSON.stringify({ items: [] })}\n`;
  const payload = redditPayload(source, 2, { AskReddit: 2 });

  assert.equal(parseRedditSourceApiResponse(payload, "2099-01-02"), source);
  assert.match(redditSubredditStatsLogLines(payload.subreddit_stats, REDDIT_POLICY).find(line => line.includes("r/AskReddit")) || "", /category=life.*listing=2.*min_score=20.*final=2/);
  // fetched_at may drift past the archive date without invalidating the payload.
  assert.equal(parseRedditSourceApiResponse({ ...payload, fetched_at: "2099-01-03T08:00:00Z" }, "2099-01-02"), source);

  for (const [name, mutate, expected] of [
    ["older contract version", (p: typeof payload) => ({ ...p, contract_version: "reddit-top20-source.v6" }), /unsupported contract/],
    ["newer contract version", (p: typeof payload) => ({ ...p, contract_version: "reddit-top20-source.v8" }), /unsupported contract/],
    ["tampered source body", (p: typeof payload) => ({ ...p, source_sha256: "0".repeat(64) }), /source_sha256 does not match/],
    ["tampered policy", (p: typeof payload) => ({ ...p, policy_sha256: "0".repeat(64) }), /policy_sha256 does not match/],
    ["wrong archive date", (p: typeof payload) => ({ ...p, archive_date: "2099-01-01" }), /does not match requested date/],
    [
      "unrequested subreddit",
      (p: typeof payload) => {
        const unexpected = p.source.replaceAll("r/AskReddit", "r/explainlikeimfive");
        return { ...p, source: unexpected, source_sha256: createHash("sha256").update(unexpected, "utf8").digest("hex") };
      },
      /unsupported category\/subreddit mapping/,
    ],
    [
      "stats that undercount the source items",
      (p: typeof payload) => ({ ...p, subreddit_stats: p.subreddit_stats.map(stat => (stat.subreddit === "AskReddit" ? { ...stat, final: 1, detail_ok: 1 } : stat)) }),
      /final count does not match source items/,
    ],
  ] as const) {
    assert.throws(() => parseRedditSourceApiResponse(mutate(payload), "2099-01-02"), expected, name);
  }

  // Subreddits are uncapped below the service's declared listing limit.
  const overLimitSource = `${Array.from({ length: 41 }, (_, index) =>
    [`${index + 1}. [r/AskReddit] Fixture post ${index + 1}`, "- 来源：r/AskReddit", "- 发布时间：2099-01-02T07:00:00Z"].join("\n"),
  ).join("\n\n")}\n\n===ARCHIVE_PAYLOAD===\n{"items": []}\n`;
  assert.equal(parseRedditSourceApiResponse(redditPayload(overLimitSource, 41, { AskReddit: 41 }), "2099-01-02"), overLimitSource);
});

test("Reddit source fetch sends one subreddit-list request to the v7 service", async () => {
  const source = `${redditSourceItem(1, { subreddit: "IAmA", points: 20 })}\n===ARCHIVE_PAYLOAD===\n${JSON.stringify({ items: [] })}\n`;
  const payload = redditPayload(source, 1, { IAmA: 1 });
  const requests: { url: string; method: string; body?: string }[] = [];

  const fetched = await withMocks(
    {
      env: { REDDIT_SOURCE_API_URL: "https://source.example/", REDDIT_SOURCE_API_TOKEN: "test-token", REDDIT_SOURCE_POLL_INTERVAL_MS: "1" },
      fetch: async (input, init) => {
        const url = String(input);
        requests.push({ url, method: init?.method || "GET", body: typeof init?.body === "string" ? init.body : undefined });
        const submitting = url.endsWith("/jobs");
        const job = { id: "reddit_test", archive_date: "2099-01-02", state: submitting ? "running" : "ready", result: submitting ? null : payload };
        return new Response(JSON.stringify(job), { status: submitting ? 202 : 200 });
      },
    },
    () => fetchRedditSourceFromApi("2099-01-02"),
  );

  assert.equal(fetched, source);
  assert.deepEqual(JSON.parse(requests.find(request => request.body)?.body || "{}"), {
    archive_date: "2099-01-02",
    subreddits: REDDIT_CATEGORIES.flatMap(category => category.subreddits),
  });
  // 要证的是「提交一次 + 轮询一次」，不是服务端的路由字符串长什么样。
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[1].method, "GET");
  assert.ok(requests[1].url.startsWith(requests[0].url + "/"), requests[1].url);
});

test("Reddit post-detail source rejects orphan replies and policy-limit violations", () => {
  const policy = { version: "reddit-source-policy.v2", top_level_comment_limit: 40, direct_reply_limit: 10, max_comment_depth: 2, detail_comment_limit: 500, max_post_body_chars: 8000, max_comment_chars: 1200, max_comment_chars_per_post: 40000, requires_top_level_comment: true };
  const source = "detail evidence";
  const post = {
    post_id: "abcde", status: "ok", requested_url: "https://www.reddit.com/r/AskReddit/comments/abcde/", subreddit: "AskReddit", title: "A question", body: "A body", score: 12, num_comments: 2, published_at: "2099-01-02T00:00:00Z", permalink: "https://www.reddit.com/r/AskReddit/comments/abcde/",
    top_comments: [{ id: "t1", parent_id: null, score: 4, text: "A detailed parent comment", truncated: false }],
    replies: [{ id: "r1", parent_id: "t1", score: 2, text: "A direct reply", truncated: false }],
    stats: { top_level_seen: 1, top_level_selected: 1, replies_seen: 1, replies_selected: 1, filtered_unavailable: 0, filtered_bot: 0, filtered_too_short: 0, filtered_duplicate: 0, dropped_beyond_depth: 0, dropped_orphan: 0, dropped_by_limit: 0, dropped_by_budget: 0, truncated_comments: 0, body_truncated: false, comment_chars_used: 40 },
  };
  const payload = {
    contract_version: "reddit-post-detail-source.v1", archive_date: "2099-01-02", fetched_at: "2099-01-02T01:00:00Z", post_count: 1, ok_count: 1, source, source_sha256: createHash("sha256").update(source, "utf8").digest("hex"), posts: [post], policy, policy_sha256: createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.keys(policy).sort().map(key => [key, policy[key as keyof typeof policy]]))), "utf8").digest("hex"),
  };
  assert.equal(parseRedditPostDetailResponse(payload, "2099-01-02", ["abcde"])[0].replies.length, 1);
  const orphan = { ...payload, posts: [{ ...post, replies: [{ ...post.replies[0], parent_id: "missing" }] }] };
  assert.throws(() => parseRedditPostDetailResponse(orphan, "2099-01-02", ["abcde"]), /parent relationship/);
  const tooMany = { ...payload, posts: [{ ...post, replies: Array.from({ length: 11 }, (_, index) => ({ ...post.replies[0], id: `r${index}` })), stats: { ...post.stats, replies_selected: 11 } }] };
  assert.throws(() => parseRedditPostDetailResponse(tooMany, "2099-01-02", ["abcde"]), /exceeded comment policy limits/);
});

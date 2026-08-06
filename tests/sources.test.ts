import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildPayload, classify, HN_CANDIDATE_COUNT, HN_MIN_ORIGINAL_EVIDENCE_COUNT, HN_SELECTION_COUNT, selectTopCommented } from "../scripts/hn_top10_source.ts";
import { buildGitHubTrendingDailySource, parseGitHubTrendingHtml, sanitizeReadmeText } from "../scripts/github_trending_daily_source.ts";
import { FEEDS, buildForeignTechPodcastSource } from "../scripts/foreign_tech_podcast_source.ts";
import { normalizePodcastUrl } from "../scripts/foreign_tech_podcast_dedupe.ts";
import { appendSummarizedEpisode, isEpisodeSummarized, loadSummarizedFingerprints } from "../scripts/podcast_ledger.ts";
import { buildXyzRankTopEpisodesSource } from "../scripts/xyzrank_top_episodes_source.ts";
import { dedupeItems, eventFamilyKey } from "../scripts/daily_digest_source.ts";
import { appendMdblistRecommendations, loadMdblistRecommendationKeys, parseMdblistRecommendationsFromSource } from "../scripts/mdblist_weekly_ledger.ts";
import { buildMdblistWeeklySource, latestStartedSeasonNumber, selectUnrecommendedMdblistCandidates } from "../scripts/mdblist_weekly_source.ts";
import { REDDIT_CATEGORIES } from "../scripts/reddit_top20_compose.ts";
import {
  type ResultItem,
  type RedditSourcePolicy,
  fetchRedditSourceFromApi,
  parseRedditSourceApiResponse,
  redditSubredditStatsLogLines,
  settleDailyPodcastArticleResults,
} from "../scripts/generate_scheduled_post.ts";
import { fixture, tempDir, tempFile, withMocks } from "./helpers/mocks.ts";

const GITHUB_TRENDING_HTML_FIXTURE = `<!doctype html><html><body>
  <article class="Box-row">
    <h2><a href="/acme/agent-lab"> acme / agent-lab </a></h2>
    <p>Local AI agent workbench for developers</p>
    <span itemprop="programmingLanguage">TypeScript</span>
    <a href="/acme/agent-lab/stargazers">12,345</a>
    <a href="/acme/agent-lab/forks">678</a>
    <span class="d-inline-block float-sm-right">321 stars today</span>
  </article>
</body></html>`;

// ---------------------------------------------------------------- Hacker News

test("blog source evidence keeps long text sentinels and strips template delimiters", () => {
  const originalTail = `Original evidence ${"x".repeat(2300)} ORIGINAL_TAIL_SENTINEL`;
  const commentTail = `Comment evidence ${"y".repeat(1900)} COMMENT_TAIL_SENTINEL`;
  const payload = buildPayload(
    { id: 123, title: "Developers don't understand CORS", url: "https://example.com/cors", descendants: 88, score: 185, text: "fallback self text" },
    1,
    { originalExcerpt: originalTail, commentExcerpt: commentTail },
  );
  assert.match(payload.original_excerpt, /ORIGINAL_TAIL_SENTINEL/);
  assert.match(payload.hn_comment_excerpt, /COMMENT_TAIL_SENTINEL/);

  // Long READMEs keep their tail, and `{{...}}` is neutralized so it cannot look like a prompt template.
  assert.match(sanitizeReadmeText(`# Heading\n\n${"readme ".repeat(400)} README_TAIL_SENTINEL`), /README TAIL SENTINEL/);
  const withDelimiters = sanitizeReadmeText("Run docker inspect trek --format '{{json .Mounts}}' before updating.");
  assert.match(withDelimiters, /json \.Mounts/);
  assert.doesNotMatch(withDelimiters, /\{\{[^}]+\}\}/);
});

test("HN selects the 10 most-commented active stories from 30 candidates", () => {
  assert.equal(HN_CANDIDATE_COUNT, 30);
  assert.equal(HN_SELECTION_COUNT, 10);
  assert.equal(HN_MIN_ORIGINAL_EVIDENCE_COUNT, 6);
  const candidates = Array.from({ length: HN_CANDIDATE_COUNT }, (_, index) => ({ id: index + 1, title: `Story ${index + 1}`, descendants: index + 1, dead: false }));
  candidates[29].dead = true;
  const selected = selectTopCommented(candidates);
  assert.equal(selected.length, HN_SELECTION_COUNT);
  assert.deepEqual(
    selected.map(item => item.id),
    Array.from({ length: 10 }, (_, index) => 29 - index),
  );
});

test("HN source payload carries original and comment evidence", () => {
  const payload = buildPayload(
    {
      id: 123,
      title: "Developers don't understand CORS",
      url: "https://example.com/cors",
      descendants: 88,
      score: 185,
      text: "An explainer about why CORS exists and what browsers actually enforce.",
    },
    1,
    {
      originalExcerpt: "The original article explains how browsers enforce CORS through preflight requests, credentials, and origin checks.",
      commentExcerpt: "Commenters discuss reverse proxies, CDN caches, and local development pitfalls.",
    },
  );
  assert.equal(payload.topic, "开发工具 / 编程语言");
  assert.equal(classify("A new open model benchmark"), "AI / 模型");
  assert.match(payload.original_excerpt, /browsers enforce CORS/);
  assert.match(payload.hn_comment_excerpt, /reverse proxies/);
});

// ------------------------------------------------------------ GitHub Trending

test("GitHub Trending parser extracts repository metadata", () => {
  const repos = parseGitHubTrendingHtml(GITHUB_TRENDING_HTML_FIXTURE, 10);
  assert.equal(repos.length, 1);
  assert.deepEqual(
    { fullName: repos[0].fullName, language: repos[0].language, stars: repos[0].stars, forks: repos[0].forks, todayStars: repos[0].todayStars, url: repos[0].url },
    { fullName: "acme/agent-lab", language: "TypeScript", stars: 12_345, forks: 678, todayStars: 321, url: "https://github.com/acme/agent-lab" },
  );
});

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
        if (url.includes("github.com/trending")) return new Response(GITHUB_TRENDING_HTML_FIXTURE, { status: 200 });
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

// -------------------------------------------------------------- Daily digests

test("daily digest source dedupes post-quantum executive order coverage", () => {
  const ars = {
    title: "White House drastically shortens deadline for dropping quantum-vulnerable crypto",
    url: "https://example.com/ars-post-quantum",
    source: "Ars Technica",
    category: "business" as const,
    publishedAt: "2099-01-06T00:00:00Z",
    summary: "Executive order bumps up deadline to move off quantum-vulnerable cryptography.",
  };
  const cloudflare = {
    title: "The post-quantum EO is an important milestone. Now it’s time to get to work",
    url: "https://example.com/cloudflare-post-quantum",
    source: "Cloudflare Blog",
    category: "infra" as const,
    publishedAt: "2099-01-06T00:10:00Z",
    summary: "Cloudflare responds to the post-quantum executive order and migration deadline.",
  };
  assert.equal(eventFamilyKey(ars), "post-quantum-executive-order");
  assert.equal(eventFamilyKey(cloudflare), "post-quantum-executive-order");
  assert.equal(dedupeItems([ars, cloudflare]).length, 1);
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

function podcastResult(overrides: Partial<ResultItem>): ResultItem {
  return {
    task: "daily-podcasts",
    path: "",
    title: "每日播客笔记｜2099-01-02",
    created: false,
    skipped: false,
    updated_at_bjt: "",
    commit: "",
    push: "",
    tags: ["播客", "定时文章"],
    ...overrides,
  };
}

test("foreign tech podcast source includes technical interview feeds", () => {
  const feeds = new Map(FEEDS.map(feed => [feed.show, feed.url]));
  assert.deepEqual(
    [
      feeds.get("Software Engineering Daily"),
      feeds.get("Software Engineering Radio"),
      feeds.get("Oxide and Friends"),
      feeds.get("The InfoQ Podcast"),
      feeds.get("Changelog Interviews"),
      feeds.get("The Data Engineering Show"),
      feeds.get("The Cognitive Revolution"),
    ],
    [
      "https://softwareengineeringdaily.com/feed/podcast/",
      "https://rss.libsyn.com/shows/21070/destinations/23379.xml",
      "https://feeds.transistor.fm/oxide-and-friends",
      "https://feeds.soundcloud.com/users/soundcloud:users:215740450/sounds.rss",
      "https://changelog.com/podcast/feed",
      "https://feeds.fame.so/the-data-engineering-show",
      "https://feeds.megaphone.fm/RINTP3108857801",
    ],
  );
  // Non-technical / interview-light shows stay out of the feed list.
  for (const show of ["Dwarkesh Podcast", "Training Data", "Gradient Dissent"]) assert.equal(feeds.has(show), false);
});

test("daily podcasts skip single episode failures but fail below the article minimum", () => {
  const failed = { failed: true, error: "audio download HTTP 403" };

  // One good article covers the minimum, so the failed one degrades to a skip.
  const partial = settleDailyPodcastArticleResults(
    [
      podcastResult({ path: "src/content/posts/zh-cn/每日播客-2099-01-02-01-good.md", created: true }),
      podcastResult({ path: "src/content/posts/zh-cn/每日播客-2099-01-02-02-blocked.md", ...failed }),
    ],
    "2099-01-02",
    1,
  );
  assert.equal(
    partial.some(result => result.failed),
    false,
  );
  assert.equal(partial[1].skipped, true);
  assert.equal(partial[1].path, "");
  assert.match(partial[1].skip_reason || "", /audio download HTTP 403/);
  assert.match(partial[1].skip_reason || "", /每日播客-2099-01-02-02-blocked\.md/);

  // Nothing usable left: the task must fail loudly rather than publish an empty day.
  const empty = settleDailyPodcastArticleResults([podcastResult({ path: "src/content/posts/zh-cn/每日播客-2099-01-02-01-blocked.md", ...failed })], "2099-01-02", 1);
  assert.equal(empty[0].skipped, true);
  const failures = empty.filter(result => result.failed);
  assert.equal(failures.length, 1);
  assert.match(failures[0].error || "", /found only 0 usable episodes; need 1/);
});

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

test("podcast fingerprints ignore tracking parameters and upsert by episode identity", () => {
  assert.equal(normalizePodcastUrl("https://example.com/podcast/dev-platforms?utm_medium=social&uo=4&b=2&a=1#section"), "https://example.com/podcast/dev-platforms?a=1&b=2");

  const ledgerFile = tempFile("podcast-ledger-unit", "summarized.json");
  const episode = { title: "Building Reliable AI Developer Platforms", show: "Latent Space", link: "https://example.com/podcast/dev-platforms?utm_medium=social", date: "2099-01-02" };
  appendSummarizedEpisode(episode, { archivedAt: "2099-01-02", postPath: "src/content/posts/zh-cn/每日播客-2099-01-02-01-latent-space.md" }, ledgerFile);
  // Re-running the same episode (force regeneration) upserts instead of appending a second row.
  appendSummarizedEpisode(episode, { archivedAt: "2099-01-03", postPath: "src/content/posts/zh-cn/每日播客-2099-01-03-01-latent-space.md" }, ledgerFile);

  const parsed = JSON.parse(fs.readFileSync(ledgerFile, "utf8")) as { episodes: { postPath?: string; archivedAt?: string }[] };
  assert.equal(parsed.episodes.length, 1);
  assert.equal(parsed.episodes[0].archivedAt, "2099-01-03");
  assert.match(parsed.episodes[0].postPath || "", /2099-01-03-01-latent-space/);
  // A tracking-param variant of the same link still resolves to the stored fingerprint.
  const variant = { title: "Building Reliable AI Developer Platforms", show: "Latent Space", link: "https://example.com/podcast/dev-platforms?uo=4" };
  assert.equal(isEpisodeSummarized(loadSummarizedFingerprints(ledgerFile), variant), true);
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

// -------------------------------------------------------------------- mdblist

test("mdblist candidate selection skips recommended identities, low ratings, and unstarted seasons", () => {
  const startedSeason = (season: number, imdb: number | null = 6) => ({
    ratings: imdb === null ? [] : [{ source: "imdb", value: imdb }],
    seasons: [{ season_number: season, episodes: [{ votes: 1, rating: 8 }] }],
  });

  // Season identity is the latest season that actually has aired episodes.
  assert.equal(
    latestStartedSeasonNumber([
      { season_number: 0, episodes: [{ votes: 100, rating: 8 }] },
      { season_number: 1, episodes: [{ votes: 50, rating: 7.5 }] },
      { season_number: 2, episodes: [{ votes: 10, rating: null }] },
      { season_number: 3, episodes: [{ votes: 0, rating: null }] },
    ]),
    2,
  );
  assert.equal(latestStartedSeasonNumber([{ season_number: 1, episodes: [{ votes: 0, rating: null }] }]), null);

  const candidates = [
    { item: { title: "Already recommended", ids: { tmdb: 101 } }, info: startedSeason(2) },
    { item: { title: "Boundary rated", ids: { tmdb: 102 } }, info: startedSeason(1, 6) },
    { item: { title: "Missing IMDb", ids: { tmdb: 103 } }, info: startedSeason(1, null) },
    { item: { title: "Future season only", ids: { tmdb: 104 } }, info: { ratings: [{ source: "imdb", value: 8 }], seasons: [{ season_number: 1, episodes: [{ votes: 0, rating: null }] }] } },
    { item: { title: "Fresh first", ids: { tmdb: 105 } }, info: startedSeason(1, 6) },
    { item: { title: "Fresh second", ids: { tmdb: 106 } }, info: startedSeason(4, 8) },
  ];
  const selected = selectUnrecommendedMdblistCandidates(candidates, "show", new Set(["show:101:season:2"]), 2);
  assert.deepEqual(
    selected.map(entry => ({ title: entry.item.title, key: entry.recommendation.key })),
    [
      { title: "Boundary rated", key: "show:102:season:1" },
      { title: "Fresh first", key: "show:105:season:1" },
    ],
  );
});

test("mdblist ledger persists successful selections and replaces same-post reruns", () => {
  const file = tempFile("mdblist-ledger", "recommended.json");
  const post = { archivedAt: "2099-01-09", postPath: "src/content/posts/zh-cn/每周影视推荐-2099-01-09.md" };
  appendMdblistRecommendations(
    [
      { key: "movie:10", mediaType: "movie", tmdbId: 10, title: "Movie A" },
      { key: "show:20:season:2", mediaType: "show", tmdbId: 20, seasonNumber: 2, title: "Show A" },
    ],
    post,
    file,
  );
  assert.deepEqual(loadMdblistRecommendationKeys(file), new Set(["movie:10", "show:20:season:2"]));

  // Re-running the same post replaces its rows rather than accumulating duplicates.
  appendMdblistRecommendations([{ key: "show:21:season:1", mediaType: "show", tmdbId: 21, seasonNumber: 1, title: "Show B" }], post, file);
  assert.deepEqual(loadMdblistRecommendationKeys(file), new Set(["show:21:season:1"]));
});

test("mdblist source evidence exposes the TMDB identities selected for the ledger", () => {
  const selections = parseMdblistRecommendationsFromSource(fixture("blog-sources/mdblist-weekly.md"));
  assert.equal(selections.length, 6);
  assert.deepEqual(selections[0], { key: "movie:1339713", mediaType: "movie", tmdbId: 1339713, title: "Obsession" });
  assert.deepEqual(selections[3], { key: "show:94997:season:3", mediaType: "show", tmdbId: 94997, seasonNumber: 3, title: "House of the Dragon" });
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

  assert.match(source, /上映日期：2098-12-03 至 2098-12-09（上月同期 7 个自然日）/);
  assert.match(source, /IMDb >= 6\.0/);
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
  assert.deepEqual(requests.map(request => request.url), [
    "https://source.example/v3/reddit/top20-source/jobs",
    "https://source.example/v3/reddit/top20-source/jobs/reddit_test",
  ]);
});

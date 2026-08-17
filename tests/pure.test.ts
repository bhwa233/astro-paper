// 纯函数层：不碰网络、不碰文件系统的计算与判定。
// 这里是具体数值的家——排序名次、去重判定、季度识别、日期窗口。
import assert from "node:assert/strict";
import test from "node:test";

import { dedupeItems, eventFamilyKey } from "../scripts/daily_digest_source.ts";
import { type ResultItem, settleDailyPodcastArticleResults } from "../scripts/generate_scheduled_post.ts";
import { buildPayload, classify, HN_CANDIDATE_COUNT, HN_SELECTION_COUNT, selectTopCommented } from "../scripts/hn_top10_source.ts";
import { parseGitHubTrendingHtml, sanitizeReadmeText } from "../scripts/github_trending_daily_source.ts";
import { latestStartedSeasonNumber, previousMonthReleaseWindow, selectUnrecommendedMdblistCandidates } from "../scripts/mdblist_weekly_source.ts";
import { fixture } from "./helpers/mocks.ts";
import {
  countDroppableStories,
  dropTrailingStories,
  parseRedditLifeCandidates,
  parseRedditLifeDescription,
  renderRedditLifeWechatMarkdown,
} from "../scripts/reddit_life_wechat_compose.ts";

function podcastResult(overrides: Partial<ResultItem>): ResultItem {
  return {
    task: "daily-podcasts",
    path: "",
    title: "每日播客笔记",
    created: false,
    skipped: false,
    updated_at_bjt: "",
    commit: "",
    push: "",
    tags: ["播客", "定时文章"],
    ...overrides,
  };
}

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
  const repos = parseGitHubTrendingHtml(fixture("html/github-trending-daily.html"), 10);
  assert.equal(repos.length, 1);
  assert.deepEqual(
    { fullName: repos[0].fullName, language: repos[0].language, stars: repos[0].stars, forks: repos[0].forks, todayStars: repos[0].todayStars, url: repos[0].url },
    { fullName: "acme/agent-lab", language: "TypeScript", stars: 12_345, forks: 678, todayStars: 321, url: "https://github.com/acme/agent-lab" },
  );
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

// 上月同期窗口是真实日期算术：跨年、月末钳位、7 天闭区间，任何一处写反都会让整周选片落在错误区间，
// 而 source builder 那条用例只用一个普通日期走通链路，看不出这些边界。
test("mdblist previous-month window clamps month ends and crosses year boundaries", () => {
  assert.deepEqual(previousMonthReleaseWindow("2099-01-09"), { from: "2098-12-03", to: "2098-12-09" });
  // 12 月 31 日往前一个月落在 11 月 31 日——不存在，钳到 11 月 30 日。
  assert.deepEqual(previousMonthReleaseWindow("2099-12-31"), { from: "2099-11-24", to: "2099-11-30" });
  // 3 月 30 日 → 2 月 30 日不存在；平年钳到 2/28，闰年钳到 2/29。
  assert.deepEqual(previousMonthReleaseWindow("2099-03-30"), { from: "2099-02-22", to: "2099-02-28" });
  assert.deepEqual(previousMonthReleaseWindow("2096-03-30"), { from: "2096-02-23", to: "2096-02-29" });
  // 窗口跨月首：1 月 3 日往前一个月是 12 月 3 日，起点回到 11 月。
  assert.deepEqual(previousMonthReleaseWindow("2099-01-03"), { from: "2098-11-27", to: "2098-12-03" });
  assert.throws(() => previousMonthReleaseWindow("2099-02-30"), /invalid MDBList archive date/);
});

test("Reddit life handoff uses only the first three ordered posts and carries each story list", () => {
  const block = (rank: number, subreddit = "AskReddit") =>
    [
      `## ${rank}. 问题 ${rank}`,
      `- **热度**：${100 - rank} points · ${rank * 10} 评论`,
      `- **来源**：[r/${subreddit}](https://www.reddit.com/r/${subreddit}/)`,
      `- **帖子**：https://www.reddit.com/r/${subreddit}/comments/post${rank}/`,
      "",
      `1. 第 ${rank} 帖的第一个故事。`,
      "",
      `2. 第 ${rank} 帖的第二个故事。`,
    ].join("\n");
  const candidates = parseRedditLifeCandidates([1, 2, 3, 4].map(rank => block(rank)).join("\n\n"));
  assert.deepEqual(
    candidates.map(item => item.postId),
    ["post1", "post2", "post3"],
  );
  // 正文原样搬运：微信稿不重写上游的故事，只做选帖和长度收口。
  assert.equal(candidates[0].body, "1. 第 1 帖的第一个故事。\n\n2. 第 1 帖的第二个故事。");
  assert.throws(() => parseRedditLifeCandidates(`${block(1)}\n\n${block(3)}`), /handoff contract/);
  assert.throws(() => parseRedditLifeCandidates(block(1, "investing")), /unsupported subreddit/);
  // 事实行齐全但没有故事列表，说明上游契约已经变了，必须显式失败而不是产出空稿。
  assert.throws(() => parseRedditLifeCandidates(block(1).split("\n").slice(0, 4).join("\n")), /has no story list/);

  const article = ["---", 'title: "Reddit 每日精选｜人生与社会"', 'description: "帖子问的是第一个问题。"', "---", "", block(1)].join("\n");
  assert.equal(parseRedditLifeDescription(article), "帖子问的是第一个问题。");
  assert.throws(() => parseRedditLifeDescription(block(1)), /missing its frontmatter description/);
});

// 2026-08-17: life summaries changed from Markdown lists to escaped `1\\.` paragraphs.
// The old parser could not find any story and blocked the WeChat draft workflow.
test("Reddit life WeChat article keeps plain-numbered upstream stories and drops trailing ones to fit", () => {
  const candidate = {
    rank: 1,
    postId: "post1",
    title: "问题 1",
    subreddit: "AskReddit",
    points: "99 points · 10 评论",
    numComments: 10,
    permalink: "https://www.reddit.com/r/AskReddit/comments/post1/",
    body: ["1\\. 第一个故事。", "", "2\\. 第二个故事。", "", "3\\. 第三个故事。"].join("\n"),
  };
  const markdown = renderRedditLifeWechatMarkdown(candidate, "帖子问的是第一个问题。", "2099-01-02");

  assert.match(markdown, /^title: "Reddit 热帖精选｜问题 1"$/m);
  assert.match(markdown, /^ {2}sourceURL: "https:\/\/www\.reddit\.com\/r\/AskReddit\/comments\/post1\/"$/m);
  assert.match(markdown, /^description: "帖子问的是第一个问题。"$/m);
  assert.match(markdown, /^更多每日精选：https:\/\/blog\.bhwa233\.com\/$/m);
  // 上游正文原样搬运，正文里不出现任何标题。
  assert.match(markdown, /^1\\\. 第一个故事。$/m);
  assert.doesNotMatch(markdown, /^#{1,6}\s/m);
  // 不是 Markdown 列表；每条都是带普通编号的独立段落。
  assert.match(markdown, /^1\\\. 第一个故事。\n\n2\\\. 第二个故事。\n\n3\\\. 第三个故事。$/m);
  assert.match(dropTrailingStories(markdown, 1), /^1\\\. 第一个故事。\n\n2\\\. 第二个故事。$/m);
  assert.equal(countDroppableStories(markdown), 3);
  assert.equal(dropTrailingStories(markdown, 0), markdown);

  const droppedOne = dropTrailingStories(markdown, 1);
  assert.doesNotMatch(droppedOne, /第三个故事/);
  assert.match(droppedOne, /第二个故事/);
  // frontmatter 和页脚是稿子的骨架，任何截断都不能动它们。
  assert.match(droppedOne, /^---\nauthor:/);
  assert.match(droppedOne, /更多每日精选：/);
  // 编号从 1 递增，从末尾删不会留下断号。
  assert.doesNotMatch(droppedOne, /^3\\\. /m);

  assert.throws(() => dropTrailingStories(markdown, 3), /fewer than 3 droppable stories/);
  assert.throws(() => renderRedditLifeWechatMarkdown(candidate, "", "2099-01-02"), /needs a description/);
});

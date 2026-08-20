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
  redditLifeWechatFooter,
  redditLifeWechatTitle,
  renderRedditLifeWechatMarkdown,
} from "../scripts/reddit_life_wechat_compose.ts";
import {
  REDDIT_TRENDING_MIN_COMMENTS,
  discussionDensity,
  parseRedditTrendingCandidates,
  parseRedditTrendingSelection,
  renderRedditTrendingCandidates,
  selectRedditTrendingCandidates,
} from "../scripts/reddit_trending_source.ts";
import { type RedditTrendingBoard, type RedditTrendingItem } from "../scripts/reddit_trending_api.ts";
import { WEIBO_TRENDING_LIMIT, parseWeiboTrendingSummary } from "../scripts/weibo_trending_source.ts";
import {
  parseWeiboTrendingArticle,
  renderWeiboTrendingWechatMarkdown,
  weiboTrendingWechatBody,
  weiboTrendingWechatDescription,
  weiboTrendingWechatFooter,
  WEIBO_TRENDING_WECHAT_DESCRIPTION_LIMIT,
  WEIBO_TRENDING_WECHAT_ITEM_LIMIT,
  type WeiboTrendingWechatItem,
} from "../scripts/weibo_trending_wechat_compose.ts";

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
  assert.equal(payload.topic, "开发工具 / 编程语言");
  assert.equal(classify("A new open model benchmark"), "AI / 模型");

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
  const second = { ...candidate, rank: 2, postId: "post2", title: "问题 2", permalink: "https://www.reddit.com/r/AskReddit/comments/post2/", body: ["1\\. 第四个故事。", "", "2\\. 第五个故事。"].join("\n") };
  const ARTICLE_URL = "https://blog.bhwa233.com/posts/reddit-2099-01-02-life/";
  const footer = redditLifeWechatFooter({
    rest: [
      { rank: 3, title: "第三个话题" },
      { rank: 4, title: "第四个话题" },
    ],
    total: 4,
    articleUrl: ARTICLE_URL,
  });
  const render = (overrides = {}) =>
    renderRedditLifeWechatMarkdown({ candidates: [candidate, second], headline: "话题一、话题二", description: "这期讲了两件事。", archiveDate: "2099-01-02", issue: 42, footer, articleUrl: ARTICLE_URL, ...overrides });
  const markdown = render();

  // 标题由模型给的话题串加品牌与期号拼成，不再由某一帖独占。
  assert.match(markdown, /^title: "话题一、话题二｜Reddit 热帖精选 #42"$/m);
  // 封面渲染失败时不写 ogImage，astro-wechat 才能回落到配置里的 defaultCover；
  // 写了却没有对应文件反而会让它解析资源时直接报错。
  assert.doesNotMatch(markdown, /^ogImage:/m);
  assert.match(render({ coverFile: "cover.png" }), /^ogImage: "cover\.png"$/m);
  // sourceURL 既是微信「阅读原文」的落点，也是 astro-wechat 的同步身份；指博客文章而非 Reddit 原帖。
  assert.match(markdown, /^ {2}sourceURL: "https:\/\/blog\.bhwa233\.com\/posts\/reddit-2099-01-02-life\/"$/m);
  assert.match(markdown, /^description: "这期讲了两件事。"$/m);
  // 二维码卡片内不能出现空行：markdown-it 的 html_block 遇空行就结束，后半段会退化成
  // 转义过的普通段落，读者看到的是一堆尖括号。这个约束从卡片本身看不出来，容易在编辑时踩到。
  assert.doesNotMatch(markdown.slice(markdown.indexOf("<section")), /\n\s*\n/);
  // 剩余热帖清单沿用上游编号，读者扫码过去能按号对上。
  assert.match(markdown, /^3\\\. 第三个话题$/m);
  assert.match(markdown, /^4\\\. 第四个话题$/m);
  assert.match(markdown, /长按识别二维码，在博客看全部 4 个热帖/);
  assert.match(markdown, /https:\/\/blog\.bhwa233\.com\/posts\/reddit-2099-01-02-life\//);
  // 帖间用整行加粗分隔，编号在每帖内部重新从 1 开始；不能出现 Markdown 标题。
  assert.match(markdown, /^\*\*问题 1\*\*\n\n1\\\. 第一个故事。/m);
  assert.match(markdown, /^\*\*问题 2\*\*\n\n1\\\. 第四个故事。/m);
  assert.doesNotMatch(markdown, /^#{1,6}\s/m);

  // 每帖只保留前 N 条回答：三帖全量会撞上微信 20000 字符的 HTML 上限。
  const capped = render({ replyLimit: 1 });
  assert.match(capped, /^\*\*问题 1\*\*\n\n1\\\. 第一个故事。\n\n\*\*问题 2\*\*$/m);
  assert.doesNotMatch(capped, /第二个故事/);

  assert.equal(countDroppableStories(markdown), 5);
  assert.equal(dropTrailingStories(markdown, 0), markdown);

  // 删到某帖一条不剩时，它的标题也要跟着走，否则留下一个后面没有内容的空标题。
  const droppedTwo = dropTrailingStories(markdown, 2);
  assert.doesNotMatch(droppedTwo, /第四个故事|第五个故事/);
  assert.doesNotMatch(droppedTwo, /\*\*问题 2\*\*/);
  assert.match(droppedTwo, /\*\*问题 1\*\*/);
  // frontmatter 和页脚是稿子的骨架，任何截断都不能动它们。
  assert.match(droppedTwo, /^---\nauthor:/);
  assert.match(droppedTwo, /<section /);

  // 清单和二维码卡片都在页脚里，撞长度上限时该删的是回答，导流入口必须活下来。
  assert.match(droppedTwo, /^3\\\. 第三个话题$/m);
  assert.match(droppedTwo, /<section /);

  assert.throws(() => dropTrailingStories(markdown, 5), /fewer than 5 droppable stories/);
  assert.throws(() => render({ description: "" }), /needs a description/);
});

// 品牌与期号在标题末尾，正好落在微信 64 字符上限最先砍掉的位置，因此截断只许吃帖子标题那段。
test("Reddit life WeChat title keeps the brand suffix intact and truncates only the headline", () => {
  assert.equal(redditLifeWechatTitle("问题 1", 42), "问题 1｜Reddit 热帖精选 #42");
  // 后缀占 16 字符，标题预算是 48；正好用满不截断。
  const suffix = "｜Reddit 热帖精选 #42";
  assert.equal(suffix.length, 16);
  const exact = "题".repeat(48);
  assert.equal(redditLifeWechatTitle(exact, 42), `${exact}${suffix}`);
  assert.equal(redditLifeWechatTitle(exact, 42).length, 64);

  const overlong = redditLifeWechatTitle("题".repeat(60), 42);
  assert.equal(overlong.length, 64);
  assert.ok(overlong.endsWith(suffix));
  assert.equal(overlong, `${"题".repeat(47)}…${suffix}`);

  // 按码点切，代理对不能被截成半个字符。
  const emoji = redditLifeWechatTitle("😀".repeat(60), 42);
  assert.equal([...emoji].length, 64);
  assert.ok(emoji.endsWith(`…${suffix}`));
  assert.ok(!emoji.includes("�"));

  assert.equal(redditLifeWechatTitle("  问题 1  ", 7), "问题 1｜Reddit 热帖精选 #7");
  assert.throws(() => redditLifeWechatTitle("问题 1", 0), /invalid Reddit life WeChat issue number/);
  assert.throws(() => redditLifeWechatTitle("问题 1", 1.5), /invalid Reddit life WeChat issue number/);
  assert.throws(() => redditLifeWechatTitle("   ", 42), /needs a title/);
});

// 编码交给 qrcode-generator，这里守的是自己写的那半截：SVG 栅格化必须逐格还原模块矩阵。
// 错一格或静区被涂黑，图看着像二维码但扫不出来。
test("QR rasterization reproduces the module matrix and keeps the quiet zone clear", async () => {
  const { renderQrPng } = await import("../scripts/qr_code.ts");
  const qrcode = (await import("qrcode-generator")).default;
  const sharp = (await import("sharp")).default;

  const text = "https://blog.bhwa233.com/";
  const size = 240;
  const margin = 4;
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const scale = size / (modules + margin * 2);

  const { data, info } = await sharp(await renderQrPng(text, { size, marginModules: margin }))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminanceAt = (x: number, y: number) => data[(y * info.width + x) * info.channels];

  assert.equal(info.width, size);
  assert.equal(info.height, size);
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      const x = Math.floor((column + margin + 0.5) * scale);
      const y = Math.floor((row + margin + 0.5) * scale);
      assert.equal(luminanceAt(x, y) < 128, qr.isDark(row, column), `module ${row},${column} does not match the matrix`);
    }
  }
  for (let y = 0; y < Math.floor(margin * scale) - 1; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      assert.ok(luminanceAt(x, y) >= 128, `quiet zone is not blank at ${x},${y}`);
    }
  }

  await assert.rejects(() => renderQrPng("  "), /needs a non-empty payload/);
  await assert.rejects(() => renderQrPng(text, { size: 0 }), /invalid QR size/);
  await assert.rejects(() => renderQrPng(text, { marginModules: -1 }), /invalid QR margin/);
});

// ------------------------------------------------------- Reddit 全站热搜选题

function trendingItem(overrides: Partial<RedditTrendingItem> & { rank: number }): RedditTrendingItem {
  const id = overrides.id || `post${overrides.rank}`;
  const subreddit = overrides.subreddit || `sub${overrides.rank}`;
  const permalink = `/r/${subreddit}/comments/${id}/a_title/`;
  return {
    id,
    subreddit,
    title: `Title ${overrides.rank}`,
    score: 10_000,
    numComments: 1_000,
    permalink,
    url: `https://www.reddit.com${permalink}`,
    publishedAt: "2026-08-19T00:03:55Z",
    ...overrides,
  };
}

function trendingBoard(items: RedditTrendingItem[]): RedditTrendingBoard {
  return { subreddit: "popular", sort: "top", timeWindow: "day", limit: 100, fetchedAt: "2026-08-19T02:39:08.952147Z", items };
}

test("reddit trending density filter separates discussion posts from image karma", () => {
  // 2026-08-19 实测的真实量级：纯图帖 0.003 上下，吵起来的帖子 0.2 上下。
  assert.ok(discussionDensity({ score: 23_056, numComments: 80 }) < 0.01);
  assert.ok(discussionDensity({ score: 20_170, numComments: 5_394 }) > 0.2);

  const items = [
    trendingItem({ rank: 1, score: 43_105, numComments: 400 }), // meme：分数极高、讨论极少，密度垫底
    trendingItem({ rank: 2, score: 20_170, numComments: 5_394 }), // 密度最高
    trendingItem({ rank: 3, score: 26_140, numComments: 4_504 }),
    // 密度高达 0.5，但评论总数不到门槛：小体量的争吵不值得占一个选题位。
    trendingItem({ rank: 4, score: 500, numComments: REDDIT_TRENDING_MIN_COMMENTS - 1 }),
  ];
  const candidates = selectRedditTrendingCandidates(items);
  assert.deepEqual(candidates.map(candidate => candidate.rank), [2, 3, 1]);
  // 绝对门槛先于密度排序生效：比值再高，评论太少也进不来。
  assert.ok(discussionDensity(items[3]) > discussionDensity(items[1]));
  assert.ok(!candidates.some(candidate => candidate.rank === 4));
  assert.equal(selectRedditTrendingCandidates(items, { limit: 2 }).length, 2);
});

test("reddit trending candidate source round-trips through its parser", () => {
  const items = [
    trendingItem({ rank: 2, subreddit: "nextfuckinglevel", title: "How did people travel these seas 500 years ago", score: 26_140, numComments: 4_504 }),
    trendingItem({ rank: 7, subreddit: "interestingasfuck", title: "Chinese humanoid robot named Superman", score: 22_938, numComments: 3_446 }),
  ];
  const candidates = selectRedditTrendingCandidates(items);
  const source = renderRedditTrendingCandidates("2026-08-19", trendingBoard(items), candidates);
  const parsed = parseRedditTrendingCandidates(source);
  // 头部说明段不是候选块，不能被当成第 1 条解析进来。
  assert.equal(parsed.length, 2);
  // 深挖作业按 url 提交、按 id 回填，事实字段必须逐字还原；密度只写了三位小数，按精度比。
  assert.deepEqual(
    parsed.map(({ density: _density, ...facts }) => facts),
    candidates.map(({ density: _density, ...facts }) => facts),
  );
  parsed.forEach((candidate, index) => assert.ok(Math.abs(candidate.density - candidates[index].density) < 0.0005));
});

test("reddit trending selection rejects picks the candidate list cannot back", () => {
  const ok = parseRedditTrendingSelection(
    JSON.stringify({ selected: [{ rank: 2, reason: "讨论航海史与导航技术，与当日新闻无关" }], rejected: [{ rank: 1, reason: "政客当日表态" }] }),
    5,
  );
  assert.deepEqual(ok, [{ rank: 2, reason: "讨论航海史与导航技术，与当日新闻无关" }]);

  // 选不出题是允许的结果：宁缺毋滥由提示词要求，这里只保证空数组能通过解析。
  assert.deepEqual(parseRedditTrendingSelection(JSON.stringify({ selected: [] }), 5), []);

  assert.throws(() => parseRedditTrendingSelection(JSON.stringify({ selected: [{ rank: 9, reason: "越界" }] }), 5), /not in the list/);
  assert.throws(
    () => parseRedditTrendingSelection(JSON.stringify({ selected: [{ rank: 1, reason: "甲" }, { rank: 1, reason: "乙" }] }), 5),
    /picked candidate 1 twice/,
  );
  assert.throws(() => parseRedditTrendingSelection(JSON.stringify({ selected: [{ rank: 1, reason: "English only" }] }), 5), /needs a Chinese reason/);
  // 服务端 posts 字段的上限是 10，超了要在提交深挖作业之前就挡住。
  const eleven = Array.from({ length: 11 }, (_, index) => ({ rank: index + 1, reason: "长尾话题" }));
  assert.throws(() => parseRedditTrendingSelection(JSON.stringify({ selected: eleven }), 25), /at most 10/);
});

// ------------------------------------------------------- 微博全站热搜选题

test("weibo trending keeps the configured non-ad topic limit in upstream order", () => {
  const payload = [
    { title: "推广位", category: "广告", url: "https://m.weibo.cn/search?ad", hot: 999_999, ads: true },
    ...Array.from({ length: WEIBO_TRENDING_LIMIT + 2 }, (_, index) => ({
      title: `话题 ${index + 1}`,
      category: "社会",
      url: `https://m.weibo.cn/search?topic=${index + 1}`,
      hot: index + 1,
      ads: false,
    })),
  ];
  const items = parseWeiboTrendingSummary(payload);
  assert.equal(items.length, WEIBO_TRENDING_LIMIT);
  assert.deepEqual(items.map(item => item.rank), Array.from({ length: WEIBO_TRENDING_LIMIT }, (_, index) => index + 1));
  assert.equal(items[0].title, "话题 1");
  assert.equal(items.at(-1)?.title, `话题 ${WEIBO_TRENDING_LIMIT}`);
  assert.throws(() => parseWeiboTrendingSummary([{ title: "缺少链接", hot: 1, ads: false }]), /missing its title or topic URL/);
});

// ------------------------------------------------------- 微博热搜微信稿

function weiboWechatItem(rank: number, title = `话题 ${rank}`): WeiboTrendingWechatItem {
  return { rank, title, summary: `这是第 ${rank} 条摘要。` };
}

test("Weibo trending WeChat parser enforces the handoff and body keeps only the first 30 summaries", () => {
  const article = Array.from({ length: 43 }, (_, index) => {
    const rank = index + 1;
    return [`## ${rank}. 话题 ${rank}`, "", `- **话题**：[在微博查看](https://m.weibo.cn/search?q=${rank})`, `- **摘要**：这是第 ${rank} 条摘要。`].join("\n");
  }).join("\n\n");
  const items = parseWeiboTrendingArticle(article);
  assert.equal(items.length, 43);
  assert.deepEqual(items[0], weiboWechatItem(1));

  const body = weiboTrendingWechatBody(items);
  assert.equal([...body.matchAll(/^## (\d+)\./gm)].length, WEIBO_TRENDING_WECHAT_ITEM_LIMIT);
  assert.deepEqual(
    [...body.matchAll(/^## (\d+)\./gm)].map(match => Number(match[1])),
    Array.from({ length: WEIBO_TRENDING_WECHAT_ITEM_LIMIT }, (_, index) => index + 1),
  );
  assert.doesNotMatch(body, /\*\*话题\*\*|m\.weibo\.cn/);
  assert.doesNotMatch(body, /^## 31\./m);

  assert.throws(() => parseWeiboTrendingArticle(article.replace("## 2. 话题 2", "## 3. 话题 2")), /non-contiguous rank/);
  assert.throws(() => parseWeiboTrendingArticle(article.replace("- **摘要**：这是第 1 条摘要。", "- **摘要**：")), /empty summary/);
});

test("Weibo trending WeChat description falls back by title count and truncates by code point", () => {
  assert.equal(weiboTrendingWechatDescription([weiboWechatItem(1, "甲"), weiboWechatItem(2, "乙"), weiboWechatItem(3, "丙")]), "甲、乙、丙……等 3 个话题。");

  const fallbackToTwo = [weiboWechatItem(1, "甲".repeat(40)), weiboWechatItem(2, "乙".repeat(40)), weiboWechatItem(3, "丙".repeat(40))];
  assert.match(weiboTrendingWechatDescription(fallbackToTwo), new RegExp(`^${"甲".repeat(40)}、${"乙".repeat(40)}……`));
  assert.doesNotMatch(weiboTrendingWechatDescription(fallbackToTwo), /丙/);

  const fallbackToOne = [weiboWechatItem(1, "甲".repeat(55)), weiboWechatItem(2, "乙".repeat(55)), weiboWechatItem(3, "丙")];
  assert.equal(weiboTrendingWechatDescription(fallbackToOne), `${"甲".repeat(55)}……等 3 个话题。`);

  const truncated = weiboTrendingWechatDescription([weiboWechatItem(1, "😀".repeat(130))]);
  assert.equal([...truncated].length, WEIBO_TRENDING_WECHAT_DESCRIPTION_LIMIT);
  assert.ok(truncated.endsWith("…"));
  assert.ok(!truncated.includes("�"));
});

test("Weibo trending WeChat renderer carries synchronization metadata and optional cover", () => {
  const items = [weiboWechatItem(1, "甲"), weiboWechatItem(2, "乙")];
  const articleUrl = "https://blog.bhwa233.com/posts/%E5%BE%AE%E5%8D%9A%E7%83%AD%E6%90%9C-2099-01-02/";
  const render = (coverFile = "") =>
    renderWeiboTrendingWechatMarkdown({
      items,
      archiveDate: "2099-01-02",
      description: weiboTrendingWechatDescription(items),
      footer: weiboTrendingWechatFooter(),
      articleUrl,
      coverFile,
    });
  const markdown = render();
  assert.match(markdown, /^title: "每日微博热搜总结｜2099-01-02"$/m);
  assert.match(markdown, /^wechat:\n {2}enabled: true\n {2}sourceURL: "https:\/\/blog\.bhwa233\.com\/posts\//m);
  assert.doesNotMatch(markdown, /^ogImage:/m);
  assert.match(render("cover.png"), /^ogImage: "cover\.png"$/m);
  assert.match(markdown, /<img src="qr\.png"/);
  assert.doesNotMatch(markdown.slice(markdown.indexOf("<section")), /\n\s*\n/);
});

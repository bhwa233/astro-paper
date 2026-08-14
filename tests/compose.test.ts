import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { archivePost } from "../scripts/astro_paper_archive.ts";
import { normalizeMarkdownBlock } from "../scripts/markdown_text.ts";
import { composeHnBody, hnMarkdownFromModelJson, parseHnModelJson, parseSourceFacts } from "../scripts/hn_compose.ts";
import { parseGitHubTrendingFacts, parseGitHubTrendingModelJson } from "../scripts/github_trending_compose.ts";
import { mdblistMarkdownFromModelJson } from "../scripts/mdblist_compose.ts";
import { dailyDigestMarkdownFromModelJson } from "../scripts/daily_digest_compose.ts";
import { economistWeeklyMarkdown, parseEconomistArticleSummaries } from "../scripts/economist_weekly_compose.ts";
import { magazineConfig, parseMagazineEpub } from "../scripts/magazine.ts";
import { parseRedditItemOutcome, parseRedditItemSummary, redditMarkdownFromItemSummaries, redditTop20Description } from "../scripts/reddit_top20_compose.ts";
import { parseMagazineItemSummary, partitionRedditItemOutcomes } from "../scripts/generate_scheduled_post.ts";
import { verifyPostContract } from "../scripts/verify_blog_generation.ts";
import { composeFixtureBody } from "./helpers/compose-fixture.ts";
import { epubFixture } from "./helpers/epub.ts";
import { fixture, tempDir } from "./helpers/mocks.ts";
import { parseRedditLifeArticle, parseRedditThreadSummary, renderRedditLifeWechatMarkdown } from "../scripts/reddit_life_wechat_compose.ts";

// ------------------------------------------------------------------ Magazines

test("magazine EPUB parsers keep every valid article and drop non-article pages", () => {
  for (const testCase of [
    {
      name: "economist",
      tasks: ["economist-weekly"],
      articleCount: 12,
      tail: /ARTICLE_1_TAIL_SENTINEL/,
      // Repeated titles must NOT collapse, and long bodies must NOT be truncated.
      extra: (articles: { text: string; originalTitle: string; rank: number }[]) => {
        assert.ok(articles[0].text.length > 12_000);
        assert.equal(articles[0].originalTitle, "Repeated title");
        assert.deepEqual(Object.keys(articles[0]).sort(), ["originalTitle", "rank", "text"]);
      },
    },
    {
      name: "new-yorker",
      tasks: ["new-yorker-weekly"],
      articleCount: 5,
      tail: /NY_1_TAIL/,
      // The TOC page (no .article) and the short poem (below minArticleChars) are filtered out.
      extra: (articles: { originalTitle: string }[]) => assert.equal(articles[0].originalTitle, "Story 1"),
    },
    {
      name: "calibre",
      tasks: ["atlantic-monthly", "wired-monthly"],
      articleCount: 4,
      tail: /CAL_1_TAIL/,
      extra: (articles: { text: string; originalTitle: string }[]) => {
        assert.doesNotMatch(articles[0].text, /Next/); // navbar stripped
        assert.equal(articles[0].originalTitle, "Feature 1");
      },
    },
  ] as const) {
    for (const task of testCase.tasks) {
      const issue = parseMagazineEpub(epubFixture(testCase.name, testCase.articleCount), magazineConfig(task));
      assert.equal(issue.articles.length, testCase.articleCount, `${task} article count`);
      assert.deepEqual(
        issue.articles.map(article => article.rank),
        Array.from({ length: testCase.articleCount }, (_, index) => index + 1),
        `${task} ranks`,
      );
      assert.match(issue.articles[0].text, testCase.tail, task);
      testCase.extra(issue.articles);
    }
  }
});

test("magazine item summary keeps Markdown structure and rejects headings", () => {
  const base = { rank: 1, title_zh: "制度压力", one_sentence_summary: "短摘要。", core_point: "核心观点。" };
  const item = parseMagazineItemSummary(JSON.stringify({ ...base, content_summary: "第一段总结。\n\n- **要点一**：细节。\n- 要点二：细节。" }), 1);
  assert.equal(item.titleZh, "制度压力");
  assert.match(item.contentSummary, /\n\n- \*\*要点一\*\*/);
  // Headings inside a summary would break the article's own heading hierarchy on archive.
  assert.throws(() => parseMagazineItemSummary(JSON.stringify({ ...base, content_summary: "## 小标题\n\n正文。" }), 1), /must not use Markdown headings/);
});

test("Economist compose aggregates per-article summaries with no issue-level sections", () => {
  const source = fixture("blog-sources/economist-weekly.md");
  const summaries = parseEconomistArticleSummaries(source);
  const { markdown, description } = economistWeeklyMarkdown(source);
  assert.equal(summaries.length, 3);
  assert.doesNotMatch(markdown, /本期主题脉络|阅读路线|全部文章/);
  assert.match(markdown, /^## 脆弱和平的压力测试$/m);
  assert.match(markdown, /^### 内容总结$/m);
  // content_summary Markdown structure survives the carrier round-trip.
  assert.match(markdown, /- \*\*国内政治\*\*：/);
  assert.doesNotMatch(markdown, /^- 原文：/m);
  assert.doesNotMatch(markdown, /原题：|栏目：|作者：|A fragile peace faces a hard test/);
  assert.equal(description, summaries[0].oneSentenceSummary.slice(0, 30));
  assert.ok(description.length > 0 && description.length <= 30);
});

// ----------------------------------------------------- Facts come from source

test("HN compose parses source facts from markdown blocks", () => {
  const facts = parseSourceFacts(fixture("blog-sources/hn-top10.md"));
  assert.equal(facts.length, 1);
  assert.deepEqual(facts[0], {
    rank: 1,
    points: "320 points · 64 评论",
    topic: "开发工具 / 编程语言",
    url: "https://example.com/automation-contracts",
    hn_link: "https://news.ycombinator.com/item?id=2099010201",
  });
});

test("HN compose takes facts from source, not from the model", () => {
  const source = fixture("blog-sources/hn-top10.md");
  // The model JSON only carries semantic fields. Even when it smuggles in a URL, it must not reach the post.
  const modelJson = JSON.stringify({
    items: [
      {
        rank: 1,
        title_zh: "开发者终于开始测试自动化契约",
        content_summary: "文章讨论了为什么自动化系统不能只检查任务是否启动，而要检查最终产物、文件路径和可复现构建结果，并强调每一层都要留下可复盘证据。",
        comment_summary: "评论区补充了 fixture 测试、离线回放和失败路径观测的重要性，强调外部接口不可用时仍应能验证归档层。",
        url: "https://evil.example.com/hallucinated",
      },
    ],
  });
  const markdown = hnMarkdownFromModelJson(modelJson, source);
  assert.match(markdown, /^1\. 🔥 开发者终于开始测试自动化契约$/m);
  assert.match(markdown, /- 原文：https:\/\/example\.com\/automation-contracts/);
  assert.match(markdown, /- ⭐ 320 points · 64 评论/);
  assert.doesNotMatch(markdown, /evil\.example\.com/);

  const repo = tempDir("hn-json");
  const article = archivePost({ task: "hn-top10", date: "2099-01-02", repo, body: markdown, force: true });
  const published = fs.readFileSync(path.join(repo, article.path), "utf8");
  assert.match(published, /^## 1\. 开发者终于开始测试自动化契约/m);
  assert.match(published, /https:\/\/example\.com\/automation-contracts/);
  assert.doesNotMatch(published, /evil\.example\.com/);

  // Fenced ```json output still parses, and the facts are re-attached from source.
  const fenced = "```json\n" + JSON.stringify({ items: [{ rank: 1, title_zh: "中文标题", content_summary: "内容够长的中文总结用来通过校验规则", comment_summary: "评论够长的中文总结用来通过校验规则" }] }) + "\n```";
  const parsed = parseHnModelJson(fenced, 1);
  assert.equal(parsed[0].title_zh, "中文标题");
  assert.ok(composeHnBody(parsed, [{ rank: 1, points: "1 points · 0 评论", topic: "x", url: "https://e.com", hn_link: "https://h.com" }]).includes("- 原文：https://e.com"));
});

test("HN compose permits compact proper-name/model titles but rejects English prose", () => {
  const summary = "这是一段足够长的中文总结，用于验证产品和模型名称的标题例外不会放宽英文正文标题的要求。";
  const titles = ["Pixel Watch 5", "DeepSeek V4 Pro 0813", "Grok 4.6", "Qwen3.8-2.4T"];
  const items = parseHnModelJson(
    JSON.stringify({ items: titles.map((title_zh, index) => ({ rank: index + 1, title_zh, content_summary: summary, comment_summary: summary })) }),
    titles.length,
  );
  assert.deepEqual(items.map(item => item.title_zh), titles);

  assert.throws(
    () => parseHnModelJson(JSON.stringify({ items: [{ rank: 1, title_zh: "A new framework for building APIs", content_summary: summary, comment_summary: summary }] }), 1),
    /title should use a Chinese title/,
  );
});

test("GitHub trending compose takes stars and links from source, not the model", () => {
  const facts = parseGitHubTrendingFacts(fixture("blog-sources/github-trending-daily.md"));
  assert.equal(facts.length, 5);
  assert.deepEqual(facts[0], { rank: 1, repo: "acme/agent-lab", url: "https://github.com/acme/agent-lab", stars: "12.4k", forks: "620", today_stars: "820" });
  const markdown = composeFixtureBody("github-trending-daily");
  assert.match(markdown, /^## 1\. \[acme\/agent-lab\]\(https:\/\/github\.com\/acme\/agent-lab\)/m);
  assert.match(markdown, /^- Stars：12\.4k/m);
});

test("mdblist compose takes poster and IMDb rating from source", () => {
  const markdown = composeFixtureBody("mdblist-weekly");
  assert.match(markdown, /^## 电影推荐$/m);
  assert.match(markdown, /^## 剧集推荐$/m);
  assert.match(markdown, /### 痴迷（Obsession）/);
  assert.match(markdown, /!\[痴迷\]\(https:\/\/image\.tmdb\.org\/t\/p\/w1920_and_h800_multi_faces\/r013C8Me2bZ0pUi0OWJRh0h7MzT\.jpg\)/);
  assert.match(markdown, /- IMDb 评分：8\.1/);
});

test("NYT books compose uses compact paragraphs for WeChat", () => {
  const markdown = composeFixtureBody("nyt-books-weekly");
  assert.match(markdown, /^非虚构\n\n### 脚下的电网/m);
  assert.match(markdown, /\n\n小说\n\n### 盐渍档案/m);
  assert.doesNotMatch(markdown, /^## (小说|非虚构)$/m);
  assert.match(markdown, /^作者：Mara Okonjo\\\n类型：悬疑小说\\\n内容简介：\\\n/m);
  assert.match(markdown, /^荣誉：\\\n/m);
  assert.match(markdown, /^书评：\\\n/m);
  assert.doesNotMatch(markdown, /^#### (基本信息|内容简介|荣誉|书评)$/m);
  assert.doesNotMatch(markdown, /^- (作者|类型)：/m);
});

// 2026-08-14 事故：composeSection 去掉分节的 ## 之后，nyt-books 正文最高层级只剩 ###，
// 而发布流水线的 verifyPostContract 硬要求 /^## /，下一次周日发布会在文章写盘之后炸在 verify 步骤。
// compose 层的断言全绿也拦不住，因为断裂发生在 compose → archive → verify 的跨模块契约上。
test("NYT books post satisfies the publish-time content contract", () => {
  const repo = tempDir("nyt-books-verify");
  const article = archivePost({ task: "nyt-books-weekly", date: "2099-01-04", repo, body: composeFixtureBody("nyt-books-weekly"), force: true });
  verifyPostContract(repo, article.path, "nyt-books-weekly");
});

test("mdblist compose requires every selected candidate exactly once", () => {
  const source = fixture("blog-sources/mdblist-weekly.md");
  const raw = JSON.parse(fixture("blog-ai-responses/mdblist-weekly.json"));
  assert.throws(() => mdblistMarkdownFromModelJson(JSON.stringify({ ...raw, movies: raw.movies.slice(0, -1) }), source), /电影推荐 model count does not match source count/);
  assert.throws(
    () => mdblistMarkdownFromModelJson(JSON.stringify({ ...raw, series: raw.series.map((item: { rank: number }, index: number) => ({ ...item, rank: index ? 1 : item.rank })) }), source),
    /剧集推荐 model contains duplicate ranks/,
  );
});

// A malformed or under-filled model response must fail loudly at compose time — every task's
// parser enforces the same three guarantees, so they share one table.
test("model JSON parsers reject malformed and incomplete output", () => {
  for (const [name, parse, cases] of [
    [
      "hn",
      (raw: string, count: number) => parseHnModelJson(raw, count),
      [
        ["not json", 1, /not valid JSON/],
        [JSON.stringify({ items: [] }), 1, /non-empty items array/],
        [JSON.stringify({ items: [{ rank: 1, title_zh: "x", content_summary: "a", comment_summary: "b" }] }), 2, /does not match source count/],
      ],
    ],
    [
      "github-trending",
      (raw: string, count: number) => parseGitHubTrendingModelJson(raw, count),
      [
        ["not json", 5, /not valid JSON/],
        [JSON.stringify({ items: [{ rank: 1, project_summary: "a", tech_stack: "TS", use_case: "b" }] }), 5, /does not match source count/],
        [JSON.stringify({ items: [{ rank: 1, project_summary: "够长的中文项目总结用于通过校验", tech_stack: "未明确", use_case: "够长的中文使用场景用于通过校验" }] }), 1, /empty tech_stack/],
      ],
    ],
  ] as const) {
    for (const [raw, count, expected] of cases) {
      assert.throws(() => parse(raw, count), expected, `${name}: ${String(expected)}`);
    }
  }
});

// ---------------------------------------------------------------- Daily digest

test("daily digest compose retains canonical source URL spelling after matching and reconciliation", () => {
  const exactSourceUrl = "https://www.cisa.gov/News-Events/News/Exact-Case-Sensitive-Path";
  const reconciledSourceUrl = "https://www.cisa.gov/News-Events/News/Alert-Targeting";
  const arsSourceUrl = "https://arstechnica.com/tech-policy/2026/07/ai-firms-want-more-data-centers-trumps-epa-may-give-neighbors-less-say/";
  const wiredSourceUrl = "https://www.wired.com/story/eu-fines-google-billion-prioritizing-own-services-in-search/";
  const source = [exactSourceUrl, reconciledSourceUrl, arsSourceUrl, wiredSourceUrl].map(url => `- 链接：${url}`).join("\n");

  // Each of these is a plausible model corruption of a real source URL: wrong case + doubled slug,
  // punctuation drift, and an inserted connector word.
  const corruptedUrl = "https://www.cisa.gov/news-events/news/alert-alert-targeting";
  const arsPunctuationCorruption = "https://arstechnica.com/tech-policy/2026/07/ai-firms-want-more-data-centers;trump's-epa-may-give-neighbors-less-say";
  const wiredConnectorCorruption = "https://www.wired.com/story/eu-fines-google-billion-prioritizing-its-own-services-in-search/";
  const body = "这是一段足够长的中文正文用于通过低信号与长度校验，说明事件影响与风险。";
  const items = [
    { title_zh: "精确匹配保留来源 URL 大小写", source_url: exactSourceUrl, body_markdown: body },
    { title_zh: "美国政府更新关键基础设施 PLC 威胁预警", source_url: corruptedUrl, body_markdown: body },
    { title_zh: "美国拟弱化部分数据中心项目的公众参与门槛", source_url: arsPunctuationCorruption, body_markdown: body },
    { title_zh: "欧盟因 Google 搜索自我优待处以十亿美元罚款", source_url: wiredConnectorCorruption, body_markdown: body },
  ];

  const markdown = dailyDigestMarkdownFromModelJson(JSON.stringify({ overview: "今天的主线是关键基础设施的网络安全风险。", sections: [{ title: "安全", items }] }), source);
  for (const url of [exactSourceUrl, reconciledSourceUrl, arsSourceUrl, wiredSourceUrl]) assert.ok(markdown.includes(`](${url})`), url);
  for (const url of [corruptedUrl, arsPunctuationCorruption, wiredConnectorCorruption]) assert.equal(markdown.includes(url), false, url);
});

test("daily digest compose rejects external, ambiguous, and duplicate source links", () => {
  const source = fixture("blog-sources/tech-daily.md");
  const overview = "今天的主线是工程平台与供应链在发布治理上收敛。";
  const good = { title_zh: "中文标题", source_url: "https://example.com/postgresql-19-beta", body_markdown: "这是一段足够长的中文正文用于通过低信号与长度校验，说明事件影响与风险。" };
  const compose = (items: unknown[], pool = source) => () => dailyDigestMarkdownFromModelJson(JSON.stringify({ overview, sections: [{ title: "平台工程", items }] }), pool);

  assert.doesNotThrow(compose([good]));
  // A fabricated link is not in the source pool.
  assert.throws(compose([{ ...good, source_url: "https://evil.example.com/x" }]), /outside the source pool/);
  // A corrupted link that two source slugs both explain cannot be safely reconciled.
  assert.throws(
    compose([{ ...good, source_url: "https://example.com/news/aaaa" }], ["- 链接：https://example.com/news/aa", "- 链接：https://example.com/news/aaa"].join("\n")),
    /outside the source pool/,
  );
  // Same, one relaxation level down: a narrow relaxed match still hitting two sources is a guess.
  assert.throws(
    compose([{ ...good, source_url: "https://example.com/news/example.its-article" }], ["- 链接：https://example.com/news/example-article", "- 链接：https://example.com/news/example.its.article"].join("\n")),
    /outside the source pool/,
  );
  // The same source cannot back two items.
  assert.throws(compose([good, { ...good, title_zh: "另一个标题" }]), /reuses source link/);
});

// --------------------------------------------------------------------- Reddit

const REDDIT_LONG_SUMMARY = `${"讨论集中在长期计划上：先明确资金用途与时间，再根据风险承受能力选择简单、分散且费用透明的组合，通过定期投入减少情绪化决策。".repeat(5)}也有人提醒应急资金和高利率债务需要优先处理。`;

test("Reddit item summaries keep Markdown structure and reject thin or heading-laden output", () => {
  const summaryOne = [
    "帖子问的是哪些小习惯真正改善了一天的节奏，回答集中在可执行的细节上。",
    "",
    "**前一晚先定好第一件事**",
    "",
    "- 多数回答提到，睡前写下第二天最先处理的一件事，早上就不必在琐碎判断上消耗注意力。",
    "- 也有人强调只写一件，写成清单反而会在早晨制造新的挑选负担，失去这个习惯本来的意义。",
    "",
    "少数回答持保留态度，提到轮班工作或需要照顾孩子的人很难有稳定的前置时间，把这类做法说成人人可用反而带来挫败感；也有人认为固定顺序本身比具体写在哪里更重要。",
    "",
    "另一簇回答把不看手机的十五分钟散步当作下班后的分界线，认为身体先离开工位，注意力才跟着切换；也有人用洗澡、遛狗或换一身衣服充当同样的信号。共同点是这段时间必须没有信息输入，一旦掏出手机，缓冲就立刻失效。",
  ].join("\n");
  const source = [
    "1. 🔴 今日 Reddit 热门帖子 Top 2",
    "",
    "1. [r/AskReddit] Original question one",
    "- ⭐ 300 points · 120 评论",
    "- 来源：r/AskReddit",
    "- 帖子链接：https://www.reddit.com/r/AskReddit/comments/one/",
    "- 中文标题：第一个问题",
    `- 综合摘要：${JSON.stringify(summaryOne)}`,
    "",
    "2. [r/investing] Original question two",
    "- ⭐ 200 points · 140 评论",
    "- 来源：r/investing",
    "- 帖子链接：https://www.reddit.com/r/investing/comments/two/",
    "- 中文标题：第二个问题",
    `- 综合摘要：${JSON.stringify(REDDIT_LONG_SUMMARY)}`,
  ].join("\n");

  const markdown = redditMarkdownFromItemSummaries(source);
  // The summary is its own body block: paragraphs, bold, and lists all survive assembly.
  assert.match(markdown, /^1\. 🔴 第一个问题$/m);
  assert.match(markdown, /^- 帖子：https:\/\/www\.reddit\.com\/r\/AskReddit\/comments\/one\/$/m);
  assert.match(markdown, /^\*\*前一晚先定好第一件事\*\*$/m);
  assert.match(markdown, /^- 多数回答提到，睡前写下第二天/m);
  assert.doesNotMatch(markdown, /Original question/);
  assert.equal(redditTop20Description([{ rank: 1, title_zh: "第一个问题", summary: summaryOne }]), "帖子问的是哪些小习惯真正改善了一天的节奏，回答集中在可执行的细节上。");

  for (const [name, payload, expected] of [
    ["rank mismatch", { rank: 2, title_zh: "错误排名", summary: summaryOne }, /rank mismatch/],
    ["thin summary", { rank: 1, title_zh: "太短", summary: "这是一段中文总结。" }, /summary is too short/],
    ["heading in summary", { rank: 1, title_zh: "带标题", summary: `## 小标题\n\n${summaryOne}` }, /must not use Markdown headings/],
  ] as const) {
    assert.throws(() => parseRedditItemSummary(JSON.stringify(payload), 1), expected, name);
  }
});

test("normalizeMarkdownBlock moves trailing punctuation out of emphasis so CJK bold closes", () => {
  // CommonMark right-flanking: a closing ** glued to punctuation and immediately
  // followed by a non-space char cannot close, leaving literal asterisks. The
  // normalizer relocates the punctuation past the markers to fix it.
  assert.equal(normalizeMarkdownBlock("**幻想生物占据主流。**最高赞选择龙"), "**幻想生物占据主流**。最高赞选择龙");
  assert.equal(normalizeMarkdownBlock("**hello.**world"), "**hello**.world");
  assert.equal(normalizeMarkdownBlock("**要点？！**继续"), "**要点**？！继续");
  assert.equal(normalizeMarkdownBlock("**a。**b 和 **c！**d"), "**a**。b 和 **c**！d");
  // Already-correct or unaffected forms are left untouched.
  assert.equal(normalizeMarkdownBlock("**要点。** 有人形容"), "**要点。** 有人形容");
  assert.equal(normalizeMarkdownBlock("**要点**，后文"), "**要点**，后文");
  assert.equal(normalizeMarkdownBlock("以句号结尾 **要点。**"), "以句号结尾 **要点。**");
  assert.equal(normalizeMarkdownBlock("行内代码 `a。**b` 保留"), "行内代码 `a。**b` 保留");
});

test("Reddit life article keeps facts deterministic and rejects a reply detached from its parent", () => {
  const candidate = { rank: 1, postId: "abcde", title: "原问题", subreddit: "AskReddit", points: "100 points · 20 评论", numComments: 20, permalink: "https://www.reddit.com/r/AskReddit/comments/abcde/" };
  const evidence = {
    postId: "abcde", status: "ok" as const, subreddit: "AskReddit", title: "Original", body: "Body", score: 101, numComments: 22, publishedAt: "2099-01-02T00:00:00Z", permalink: "/r/AskReddit/comments/abcde/",
    topComments: [], replies: [], fetchedAt: "2099-01-02T01:00:00Z", sourceSha256: "a".repeat(64), policySha256: "b".repeat(64), policy: { topLevelCommentLimit: 40, directReplyLimit: 10, maxCommentDepth: 2 as const, maxCommentChars: 1200, maxCommentCharsPerPost: 40000 },
  };
  const article = parseRedditLifeArticle(JSON.stringify({ title_zh: "一个自然的中文问题", description: "一条中文摘要", intro: "讨论从一个具体问题开始，并形成了多个可比较的答案。", mainstream: "多数回答给出了明确的经历、做法和适用条件，而不是抽象口号。", replies: "直接回复补充了反例，也指出原回答需要满足的前提。", minority: "少数观点认为不同生活条件下不能照搬同一个结论。" }));
  const markdown = renderRedditLifeWechatMarkdown(candidate, evidence, article, "2099-01-02");
  assert.match(markdown, /redditPostId: "abcde"/);
  assert.match(markdown, /sourceURL: "https:\/\/www\.reddit\.com\/r\/AskReddit\/comments\/abcde\/"/);
  assert.match(markdown, /redditScore: 101/);
  assert.throws(() => parseRedditThreadSummary(JSON.stringify({ parent_id: "other", claims: "这是足够具体的中文主张，描述了一个实际经历和判断。", reply_relation: "支持" }), "parent"), /parent mismatch/);
});

test("Reddit item outcome drops excluded-topic posts and keeps ranks contiguous", () => {
  assert.equal(parseRedditItemOutcome(JSON.stringify({ rank: 3, skip: true }), 3), null);
  assert.deepEqual(parseRedditItemOutcome(JSON.stringify({ rank: 3, title_zh: "第三个问题", summary: REDDIT_LONG_SUMMARY }), 3), {
    rank: 3,
    title_zh: "第三个问题",
    summary: REDDIT_LONG_SUMMARY,
  });
  // A skip must also match its rank, or the wrong post is dropped with nothing downstream noticing.
  assert.throws(() => parseRedditItemOutcome(JSON.stringify({ rank: 2, skip: true }), 3), /rank mismatch/);

  // After drops, the assembler sees a renumbered source; a gap means the contract was broken.
  const block = (rank: number, slug: string, title: string) =>
    [
      `${rank}. [r/AskReddit] Kept ${slug}`,
      `- ⭐ ${400 - rank * 100} points · ${130 - rank * 10} 评论`,
      "- 来源：r/AskReddit",
      `- 帖子链接：https://www.reddit.com/r/AskReddit/comments/${slug}/`,
      `- 中文标题：${title}`,
      `- 综合摘要：${JSON.stringify(REDDIT_LONG_SUMMARY)}`,
    ].join("\n");
  const gapped = [block(1, "one", "第一个问题"), "", block(3, "three", "第三个问题")].join("\n");
  assert.throws(() => redditMarkdownFromItemSummaries(gapped), /item 2 has invalid rank/);
  assert.doesNotThrow(() => redditMarkdownFromItemSummaries(gapped.replace(/^3\. /m, "2. ")));
});

test("Reddit keeps valid summaries when another post exhausts its retries", () => {
  const outcomes = partitionRedditItemOutcomes([
    { block: "1. [r/investing] Kept", rank: 1, summary: { rank: 1, title_zh: "保留的帖子", summary: REDDIT_LONG_SUMMARY } },
    { block: "2. [r/investing] Failed", rank: 2, summary: null, error: "Reddit item 2 has empty or low-signal summary" },
    { block: "3. [r/investing] Excluded", rank: 3, summary: null },
  ]);
  assert.deepEqual(
    outcomes.kept.map(item => item.rank),
    [1],
  );
  assert.deepEqual(outcomes.excluded, [3]);
  assert.deepEqual(outcomes.failed, [{ rank: 2, error: "Reddit item 2 has empty or low-signal summary" }]);
});

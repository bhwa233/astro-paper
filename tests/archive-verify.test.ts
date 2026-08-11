import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { archivePost } from "../scripts/astro_paper_archive.ts";
import { bjtArchiveInstant } from "../scripts/blog_common.ts";
import { economistWeeklyMarkdown } from "../scripts/economist_weekly_compose.ts";
import { redditCategoryArticlesFromItemSummaries, redditMarkdownFromItemSummaries } from "../scripts/reddit_top20_compose.ts";
import { verifyResultJson } from "../scripts/verify_blog_generation.ts";
import { contentDateForTask } from "../scripts/generate_scheduled_post.ts";
import { composeFixtureBody } from "./helpers/compose-fixture.ts";
import { fixture, fixturePath, tempDir } from "./helpers/mocks.ts";

function writeResultJson(repo: string, date: string, results: unknown[]): string {
  const resultJson = path.join(repo, "result.json");
  fs.writeFileSync(resultJson, JSON.stringify({ date, results }));
  return resultJson;
}

test("BJT archive dates use UTC instants for Beijing midnight", () => {
  assert.equal(bjtArchiveInstant("2026-06-22"), "2026-06-21T16:00:00Z");
  assert.equal(bjtArchiveInstant("2099-01-02"), "2099-01-01T16:00:00Z");
});

test("archive and verifier accept generated HN, podcast notes, and retained digests", () => {
  const repo = tempDir("archive");
  const hnBody = `1. 🔥 开发者并不真正理解 CORS
- ⭐ 185 points · 88 评论
- 主题：开发工具 / 编程语言
- 原文：https://example.com/cors
- HN 讨论：https://news.ycombinator.com/item?id=123
- 内容总结：文章解释了浏览器同源策略与 CORS 预检机制之间的关系，并指出很多后端开发者把跨域报错误解成服务端权限问题。作者用请求头、凭证模式和常见配置误区串起了 CORS 的真实执行路径。
- 评论总结：评论区主要补充了反向代理、CDN 和本地开发场景下最容易踩坑的缓存与凭证问题，也有人强调把通配配置当万能解法会埋下安全隐患。
  `;
  const hn = archivePost({ task: "hn-top10", date: "2099-01-02", repo, body: hnBody, force: true });

  // Product/design vocabulary in a podcast note must not trip the market-report advisory filter.
  const podcastBody = `${fixture("blog-ai-responses/daily-podcasts.md")}

这期还谈到产品布局和值得关注的设计工作流，这些是产品访谈里的正常语义，不应被市场日报的投顾口吻过滤误伤。
`;
  const podcast = archivePost({ task: "daily-podcasts", date: "2099-01-02", repo, body: podcastBody, force: true });
  const applePodcast = archivePost({ task: "apple-top-podcasts", date: "2099-01-02", repo, body: podcastBody, force: true, fileNameSuffix: "01-latent-space" });

  const xyzRankTopEpisode = archivePost({
    task: "xyzrank-top-episodes",
    date: "2099-01-06",
    repo,
    body: fixture("blog-ai-responses/xyzrank-top-episodes.md"),
    force: true,
    fileNameSuffix: "01-jokes-aside",
  });
  const techDaily = archivePost({ task: "tech-daily", date: "2099-01-06", repo, body: composeFixtureBody("tech-daily"), force: true });
  assert.equal(techDaily.title, "技术日报");
  assert.match(fs.readFileSync(path.join(repo, techDaily.path), "utf8"), /^wechat:\n  enabled: true$/m);

  const artifactsDir = path.join(repo, "blog-generation-artifacts", "xyzrank-top-episodes");
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.copyFileSync(fixturePath("blog-sources/xyzrank-top-episodes.md"), path.join(artifactsDir, "source.fixture.md"));
  const xyzRankWithSource = { ...xyzRankTopEpisode, generation: { source_artifact: "blog-generation-artifacts/xyzrank-top-episodes/source.fixture.md" } };

  const resultJson = writeResultJson(repo, "2099-01-06", [hn, podcast, applePodcast, xyzRankWithSource, techDaily]);
  assert.equal(verifyResultJson(repo, resultJson), 5);
});

test("podcast archive promotes h3-only model output into accepted section headings", () => {
  const repo = tempDir("podcast-h3");
  const body = `DESCRIPTION: 模型把顶层标题写成三级标题

### 中文标题：一次格式下沉的播客输出

### 基本信息

- 节目：Format Drift Podcast
- 日期：2099-01-02
- 来源：Format Drift
- 链接：https://example.com/podcast/format-drift

### 长文笔记

#### 第一部分

${"这是一段用于覆盖模型把播客顶层标题写成三级标题时的归档兼容逻辑。它保留内容质量校验，只把标题层级提升一级，避免可用文章因为 Markdown 层级偏差被跳过。".repeat(24)}
`;
  const result = archivePost({ task: "apple-top-podcasts", date: "2099-01-02", repo, body, force: true, fileNameSuffix: "01-format-drift" });
  const article = fs.readFileSync(path.join(repo, result.path), "utf8");
  assert.equal(result.title, "Format Drift Podcast：中文标题：一次格式下沉的播客输出");
  assert.match(article, /^## 中文标题：一次格式下沉的播客输出$/m);
  assert.match(article, /^### 第一部分$/m);
});

test("Economist archive accepts more than ten complete articles", () => {
  const fixtureSource = fixture("blog-sources/economist-weekly.md");
  const header = fixtureSource.slice(0, fixtureSource.search(/^##\s+\d+\./m)).trimEnd();
  const source = [
    header,
    "",
    ...Array.from({ length: 12 }, (_, index) => {
      const rank = index + 1;
      return [
        `## ${rank}. 文章`,
        "",
        `- 中文标题：第${rank}篇中文标题`,
        `- 一句话摘要：第${rank}篇文章的一句话中文摘要。`,
        `- 核心观点：第${rank}篇文章的核心中文观点。`,
        `- 内容总结：${JSON.stringify(`第${rank}篇文章的完整中文内容总结：\n\n- **要点**：合理说明文章采用的示例。`)}`,
        "",
      ].join("\n");
    }),
  ].join("\n");

  // Weekly issues archive under the issue date parsed from source, not the run date.
  const issueDate = contentDateForTask("economist-weekly", "2099-01-09", source);
  assert.equal(issueDate, "2099-01-02");
  assert.equal(contentDateForTask("hn-top10", "2099-01-09", source), "2099-01-09");

  const repo = tempDir("economist-all");
  const result = archivePost({ task: "economist-weekly", date: issueDate, repo, body: economistWeeklyMarkdown(source).markdown, force: true });
  const article = fs.readFileSync(path.join(repo, result.path), "utf8");
  assert.equal(result.path, "src/content/posts/zh-cn/经济学人-2099-01-02.md");
  assert.equal(result.title, "经济学人本期导读");
  assert.match(article, /pubDatetime: 2099-01-01T16:00:00Z/);
  assert.equal((article.match(/^##\s+第\d+篇中文标题$/gm) || []).length, 12);
  assert.match(article, /- \*\*要点\*\*：/);
  assert.doesNotMatch(article, /原题：|栏目：|作者：/);
});

test("archive and verifier accept generated GitHub trending daily", () => {
  const repo = tempDir("github-trending");
  const result = archivePost({ task: "github-trending-daily", date: "2099-01-06", repo, body: composeFixtureBody("github-trending-daily"), force: true });
  assert.equal(verifyResultJson(repo, writeResultJson(repo, "2099-01-06", [result])), 1);
});

// A row that produced no article is not a verification failure — it has nothing to verify.
test("result verifier skips rows with no published article", () => {
  for (const [name, row] of [
    ["zero-item digest", { task: "tech-daily", path: "", skipped: true, skip_reason: "no high-quality daily items" }],
    ["task-level failure", { task: "tech-daily", path: "", failed: true, error: "validator rejected low-signal language" }],
  ] as const) {
    const repo = tempDir("verifier-skip");
    assert.equal(verifyResultJson(repo, writeResultJson(repo, "2099-01-06", [row])), 0, name);
  }
});

test("HN source verifier accepts legitimate double-brace examples from source articles", () => {
  const repo = tempDir("hn-source-braces");
  const body = `1. 🔥 Pandoc Lua 过滤器
- ⭐ 57 points · 1 评论
- 主题：技术 / 观察
- 原文：https://pandoc.org/lua-filters.html
- HN 讨论：https://news.ycombinator.com/item?id=48773079
- 内容总结：Pandoc Lua 过滤器允许用户直接操作文档 AST，并用内置 Lua 解释器减少传统 JSON filter 的序列化开销。文章展示了如何匹配元素、替换节点以及编写宏替换逻辑。
- 评论总结：评论主要讨论 Pandoc 功能边界和过滤器文档兼容性，也有人提到 Lua 过滤器在复杂文档转换中的实用价值。
`;
  const result = archivePost({ task: "hn-top10", date: "2099-01-02", repo, body, force: true });

  // `{{helloworld}}` is real content quoted from the source article, not a leaked prompt template.
  const sourcePath = path.join(repo, "hn-source.md");
  fs.writeFileSync(
    sourcePath,
    `## 1. Pandoc Lua 过滤器

- 原文：https://pandoc.org/lua-filters.html
- HN 讨论：https://news.ycombinator.com/item?id=48773079
- 原文正文：The filter converts the string {{helloworld}} into emphasized text.
`,
  );
  const resultJson = writeResultJson(repo, "2099-01-02", [
    { ...result, generation: { ai_model: "mock", source_artifact: sourcePath, prompt_artifact: "", ai_response_artifact: "", mocked_ai: true } },
  ]);
  assert.equal(verifyResultJson(repo, resultJson), 1);
});

test("Reddit archive formatting keeps summary lists out of the fact bullets", () => {
  const repo = tempDir("reddit-archive");
  const result = archivePost({ task: "reddit-top20", date: "2099-01-02", repo, body: redditMarkdownFromItemSummaries(fixture("blog-sources/reddit-top20.md")), force: true });
  const markdown = fs.readFileSync(path.join(repo, result.path), "utf8");

  assert.match(markdown, /^## 1\. 哪个小习惯让你的每天变得更好？$/m);
  assert.match(markdown, /^- \*\*热度\*\*：4821 points · 916 评论$/m);
  assert.match(markdown, /^- \*\*来源\*\*：\[r\/AskReddit\]\(https:\/\/www\.reddit\.com\/r\/AskReddit\/\)$/m);
  // "- " list items inside a summary must not be swallowed as fact fields, and a numbered list
  // inside the summary must not start a new post block.
  assert.match(markdown, /^- 也有人强调只写一件/m);
  assert.match(markdown, /^1\. 写清投资目标和预计使用资金的时间/m);
  assert.equal((markdown.match(/^## \d+\. /gm) || []).length, 3);
});

test("Reddit categorized articles split one source into independently ranked files", () => {
  const categoryFreeSource = fixture("blog-sources/reddit-top20.md").replace(/^- 栏目：.*\n/gm, "");
  const articles = redditCategoryArticlesFromItemSummaries(categoryFreeSource);
  assert.deepEqual(
    articles.map(article => [article.category, article.itemCount]),
    [
      ["life", 1],
      ["markets", 1],
      ["ama", 1],
    ],
  );
  // Each category restarts at rank 1.
  assert.match(articles[0].markdown, /^1\. 🔴 哪个小习惯让你的每天变得更好？$/m);
  assert.match(articles[1].markdown, /^1\. 🔴 新手应该怎样建立长期投资计划？$/m);
  assert.match(articles[2].markdown, /^1\. 🔴 我做了十五年紧急调度员，欢迎提问$/m);
  assert.doesNotMatch(articles[0].markdown, /^2\. 🔴/m);

  const repo = tempDir("reddit-categories");
  const results = articles.map(article =>
    archivePost({
      task: "reddit-top20",
      date: "2099-01-02",
      repo,
      body: article.markdown,
      force: true,
      fileNameSuffix: article.fileNameSuffix,
      titleSuffix: article.title,
      description: article.description,
    }),
  );
  assert.deepEqual(
    results.map(result => path.basename(result.path)),
    ["reddit-2099-01-02-life.md", "reddit-2099-01-02-markets.md", "reddit-2099-01-02-ama.md"],
  );
  assert.match(fs.readFileSync(path.join(repo, results[0].path), "utf8"), /title: "Reddit 每日精选｜人生与社会"/);
  assert.match(fs.readFileSync(path.join(repo, results[1].path), "utf8"), /title: "Reddit 每日精选｜市场与价值投资"/);
  assert.match(fs.readFileSync(path.join(repo, results[2].path), "utf8"), /title: "Reddit 每日精选｜人物与问答"/);
});

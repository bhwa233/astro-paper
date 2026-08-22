import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  fetchNewsletterFeed,
  parseNewsletterFeed,
} from "../scripts/substack_feed.ts";
import {
  prepareArticle,
  restoreTranslation,
} from "../scripts/substack_content.ts";
import { substackPostQualityViolations } from "../scripts/substack_quality.ts";
import {
  NEWSLETTER_PUBLICATIONS,
  orderPublicationsByPriority,
} from "../scripts/substack_publications.ts";
import { normalizeCanonicalUrl } from "../scripts/generate_substack_translations.ts";
import {
  readSubstackLedger,
  upsertSubstackIssue,
} from "../scripts/substack_ledger.ts";
import { restrictedFetchText } from "../scripts/restricted_fetch.ts";
import { validateRemoteImage } from "../scripts/substack_image.ts";
import { archiveSubstackTranslation } from "../scripts/substack_archive.ts";
import { parseHtml } from "../scripts/html_dom.ts";
import { htmlNodeToMarkdown } from "../scripts/html_to_markdown.ts";
import { tempDir, withMocks } from "./helpers/mocks.ts";

// 正文长度下限现在是全局常量，装不下短小的构造样本，所以正文用 BODY_FILLER 撑到阈值以上。
const BODY_FILLER =
  "The remainder of this article continues for several paragraphs of ordinary prose. ".repeat(
    30
  );

const publication = {
  ...NEWSLETTER_PUBLICATIONS["curiosity-chronicle"],
  removeSelectors: [".subscribe"],
  extractionAudit: { minTextRatio: 0.9 },
  translationLengthRatio: {
    warnMin: 0.1,
    warnMax: 2,
    failMin: 0.05,
    failMax: 3,
  },
};

test("HTML conversion disambiguates an exclamation mark followed by a link", () => {
  // Production feed compatibility incident 2026-08-21: Noahpinion emitted a
  // footnote immediately after "!", which Markdown parsed as an image.
  const document = parseHtml(
    '<body><p>A claim!<a href="https://example.com/#footnote-1">1</a></p></body>',
    "https://example.com/"
  );
  const markdown = htmlNodeToMarkdown(document.body);
  assert.match(markdown, /A claim! \[1\]\(https:\/\/example\.com\/#footnote-1\)/);
});

test("HTML conversion drops emphasis wrappers inside headings", () => {
  // 公众号主题给 strong 上的品牌色会盖掉标题的反白色，`## **标题**` 会渲染成
  // 深蓝字压深蓝底。标题自带粗体，转换阶段就把这层强调拆掉。
  const document = parseHtml(
    "<body><h2><strong>人生的引力</strong></h2></body>",
    "https://example.com/"
  );
  assert.match(htmlNodeToMarkdown(document.body), /^## 人生的引力$/m);
});

test("newsletter publications are ordered by editorial priority", () => {
  const ordered = orderPublicationsByPriority([
    { ...publication, key: "low-priority", priority: "low" },
    { ...publication, key: "high-priority", priority: "high" },
    { ...publication, key: "medium-priority", priority: "medium" },
  ]);
  assert.deepEqual(
    ordered.map(item => item.priority),
    ["high", "medium", "low"]
  );
});

test("newsletter feed contract reads namespaced full content instead of the summary", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Example</title><generator>Substack</generator><item><title>Full post</title><link>https://sahilbloom.substack.com/p/full-post</link><guid isPermaLink="true">post-1</guid><pubDate>Wed, 19 Aug 2026 12:00:00 GMT</pubDate><dc:creator>Writer</dc:creator><description>short summary</description><content:encoded><![CDATA[<h2>Full body</h2><p>${"long text ".repeat(50)}</p>]]></content:encoded></item></channel></rss>`;
  const parsed = parseNewsletterFeed(xml, publication);
  assert.equal(parsed.generator, "Substack");
  assert.equal(parsed.items[0].description, "short summary");
  assert.match(parsed.items[0].contentHtml, /Full body/);
  assert.ok(
    parsed.items[0].contentHtml.length > parsed.items[0].description.length * 10
  );
});

test("newsletter fetch requires the authenticated source proxy", async () => {
  // Production incident 2026-08-21: GitHub Actions was blocked from both the
  // Substack RSS and public API, so every feed read must leave through the
  // authenticated source service instead of attempting a direct request.
  await withMocks(
    {
      env: {
        SUBSTACK_FETCH_PROXY_URL: undefined,
        SUBSTACK_FETCH_PROXY_TOKEN: undefined,
      },
      fetch: async () => {
        throw new Error("fetch must not run without proxy configuration");
      },
    },
    () =>
      assert.rejects(
        () => fetchNewsletterFeed(publication),
        /SUBSTACK_FETCH_PROXY_URL is required/
      )
  );

  await withMocks(
    {
      env: {
        SUBSTACK_FETCH_PROXY_URL: "https://source.example/api",
        SUBSTACK_FETCH_PROXY_TOKEN: undefined,
      },
      fetch: async () => {
        throw new Error("fetch must not run without proxy token");
      },
    },
    () =>
      assert.rejects(
        () => fetchNewsletterFeed(publication),
        /SUBSTACK_FETCH_PROXY_TOKEN is required/
      )
  );

  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Example</title><generator>Substack</generator><item><title>Full post</title><link>https://sahilbloom.substack.com/p/full-post</link><guid>post-1</guid><pubDate>Wed, 19 Aug 2026 12:00:00 GMT</pubDate><content:encoded><![CDATA[<p>Full proxy body</p>]]></content:encoded></item></channel></rss>`;
  const calls: Array<{ url: string; authorization: string }> = [];
  await withMocks(
    {
      env: {
        SUBSTACK_FETCH_PROXY_URL: "https://source.example/api",
        SUBSTACK_FETCH_PROXY_TOKEN: "proxy-token",
      },
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({
          url,
          authorization: new Headers(init?.headers).get("authorization") || "",
        });
        return new Response(xml, {
          headers: { "Content-Type": "application/rss+xml" },
        });
      },
    },
    async () => {
      const feed = await fetchNewsletterFeed(publication);
      assert.equal(feed.transport, "service-proxy");
      assert.equal(feed.items.length, 1);
      assert.match(feed.items[0].contentHtml, /Full proxy body/);
    }
  );
  assert.equal(calls.length, 1);
  const proxyUrl = new URL(calls[0].url);
  assert.equal(
    proxyUrl.origin + proxyUrl.pathname,
    "https://source.example/api/v1/proxy"
  );
  assert.equal(proxyUrl.searchParams.get("url"), publication.feedUrl);
  assert.equal(calls[0].authorization, "Bearer proxy-token");
});

test("restricted fetch validates every redirect and enforces streamed byte limits", async () => {
  const calls: string[] = [];
  await withMocks(
    {
      fetch: async input => {
        const url = String(input);
        calls.push(url);
        if (url === "https://feed.example/start")
          return new Response(null, {
            status: 302,
            headers: { Location: "https://cdn.example/feed.xml" },
          });
        return new Response("valid feed", {
          headers: { "Content-Type": "application/xml" },
        });
      },
    },
    async () => {
      const result = await restrictedFetchText("https://feed.example/start", {
        allowedHosts: ["feed.example", "cdn.example"],
        maxBytes: 100,
      });
      assert.equal(result.text, "valid feed");
      assert.equal(result.finalUrl, "https://cdn.example/feed.xml");
    }
  );
  assert.deepEqual(calls, [
    "https://feed.example/start",
    "https://cdn.example/feed.xml",
  ]);

  await withMocks(
    {
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.example/feed.xml" },
        }),
    },
    () =>
      assert.rejects(
        () =>
          restrictedFetchText("https://feed.example/start", {
            allowedHosts: ["feed.example"],
            maxBytes: 100,
          }),
        /host is not allowed/
      )
  );
  await withMocks({ fetch: async () => new Response("x".repeat(101)) }, () =>
    assert.rejects(
      () =>
        restrictedFetchText("https://feed.example/start", {
          allowedHosts: ["feed.example"],
          maxBytes: 100,
        }),
      /exceeded 100 bytes/
    )
  );
});

test("image validation trusts magic bytes and decoding, not the remote filename", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const imagePublication = { ...publication, imageHosts: ["images.example"] };
  await withMocks(
    {
      fetch: async () =>
        new Response(png, { headers: { "Content-Type": "image/png" } }),
    },
    async () => {
      const image = await validateRemoteImage(
        "https://images.example/not-really.txt",
        imagePublication
      );
      assert.equal(image.mime, "image/png");
      assert.equal(image.extension, "png");
    }
  );
  await withMocks(
    {
      fetch: async () =>
        new Response(png, { headers: { "Content-Type": "image/jpeg" } }),
    },
    () =>
      assert.rejects(
        () =>
          validateRemoteImage(
            "https://images.example/fake.jpg",
            imagePublication
          ),
        /MIME mismatch/
      )
  );
});

test("DOM cleanup precedes Markdown conversion and translation validation preserves structure and citations", () => {
  // Production incident 2026-08-21: Curiosity Chronicle's four-block promo
  // preamble was translated and published ahead of the actual article.
  // Production incident 2026-08-21: Substack wrapped an image in a block-level
  // div inside a link, which Turndown emitted as invalid multiline link syntax.
  const imageUrl = "https://substackcdn.com/image/fetch/article.jpg";
  const html = `<p><em>watch on <a href="https://youtube.com/watch?v=example">YouTube</a> or read and listen on sahilbloom.com</em></p><p><em>read time</em> <strong>10 minutes</strong></p><p>Welcome to The Curiosity Chronicle, a newsletter where I provide actionable ideas.</p><p><em>Forwarded this email? Join 800,000+ other readers <a href="https://www.sahilbloom.com/newsletter">here</a>.</em></p><div><hr></div><h2>Heading</h2><p>Hello <a href="/p/source">source</a>.</p><figure><a href="${imageUrl}"><div><picture><img src="${imageUrl}" alt="Article image"></picture></div></a></figure><blockquote>A claim.</blockquote><ul><li>First</li><li>Second</li></ul><p>${BODY_FILLER}</p><h3>Support independent writing</h3><p>Become a paid subscriber today.</p><p class="subscribe">Subscribe now</p>`;
  const prepared = prepareArticle(
    html,
    "https://sahilbloom.substack.com/p/full-post",
    publication
  );
  assert.doesNotMatch(
    prepared.markdown,
    /watch on|read time|Welcome to The Curiosity Chronicle|Forwarded this email/
  );
  assert.doesNotMatch(prepared.markdown, /Subscribe now/);
  assert.doesNotMatch(
    prepared.markdown,
    /Support independent writing|paid subscriber/
  );
  assert.match(prepared.markdown, /^## Heading/m);
  assert.equal(prepared.audit.headings, 1);
  assert.equal(prepared.audit.links, 2);
  assert.equal(prepared.audit.images, 1);
  assert.match(
    prepared.markdown,
    /\[!\[Article image\]\(https:\/\/substackcdn\.com\/image\/fetch\/article\.jpg\)\]\(https:\/\/substackcdn\.com\/image\/fetch\/article\.jpg\)/
  );
  assert.equal(prepared.audit.listItems, 2);

  const response = {
    title: "中文标题",
    description: "一段足够清楚但明显超过二十个汉字的中文摘要内容",
    markdown: prepared.protectedMarkdown
      .replace("Heading", "标题")
      .replace("Hello", "你好")
      .replace("source", "来源"),
  };
  const translated = restoreTranslation(response, prepared, publication);
  // 事实来源仍可核查；只剥掉图片外层的点击链接。
  assert.match(
    translated.markdown,
    /\[来源\]\(https:\/\/sahilbloom\.substack\.com\/p\/source\)/
  );
  // 图片保留，且外层的点击放大链接被剥掉，只留裸图片。
  assert.match(
    translated.markdown,
    /^!\[Article image\]\(https:\/\/substackcdn\.com\/image\/fetch\/article\.jpg\)$/m
  );
  assert.match(translated.markdown, /^### 标题/m);
  // 模型违反摘要合同后退回标题短语，不能把原摘要生硬截成残句。
  assert.equal(translated.description, "中文标题");
  assert.match(translated.warning ?? "", /description replaced/);

  // 模型编出一个原文里没有的占位符时，抹掉它而不是把 URL_0001_009 印给读者。
  const invented = restoreTranslation(
    { ...response, markdown: `${response.markdown}\n\n尾注 URL_0001_099。` },
    prepared,
    publication
  );
  assert.doesNotMatch(invented.markdown, /URL_\d{4}_\d{3}/);
  assert.throws(
    () =>
      prepareArticle(
        `<p>Preview</p><section class="paywall-content">Paid only</section>`,
        "https://sahilbloom.substack.com/p/paid",
        publication
      ),
    /paywall marker/
  );
});

test("newsletter archive quality gate catches reader-visible generation residue", () => {
  // Production incidents 2026-08-21: archived posts exposed orphan `**`, a
  // missing Substack mention, duplicate body H1, and translated subscription CTAs.
  const invalid = `---
title: "示例标题｜Example"
description: "本文是一段明显过长而且不合要求的摘要。"
translation:
  language: zh-CN
---

# 示例标题

从 的《文章》中可以看到这一点。

**

### 请订阅高级会员以支持我的创作
`;
  const violations = substackPostQualityViolations(invalid, "example.md");
  assert.deepEqual(
    violations.map(item => item.code).sort(),
    [
      "body-h1",
      "description",
      "missing-mention",
      "orphan-markup",
      "promo",
      "title-suffix",
    ].sort()
  );
});

test("canonical identity is stable and per-publication ledger never hides corruption", () => {
  const canonical = normalizeCanonicalUrl(
    "https://sahilbloom.substack.com/p/example/?utm_source=email&b=2&a=1#comments",
    publication.articleHosts
  );
  assert.equal(canonical, "https://sahilbloom.substack.com/p/example?a=1&b=2");
  // Substack 的推荐码与欢迎参数逐次变化，漏剥就会把同一篇当成新文章再翻一遍。
  assert.equal(
    normalizeCanonicalUrl(
      "https://sahilbloom.substack.com/p/example?r=2abcde&showWelcome=true&triedRedirect=true",
      publication.articleHosts
    ),
    "https://sahilbloom.substack.com/p/example"
  );
  assert.throws(
    () =>
      normalizeCanonicalUrl(
        "https://attacker.example/p/example",
        publication.articleHosts
      ),
    /host is not allowed/
  );

  const dir = tempDir("substack-ledger");
  const file = path.join(dir, "issues.json");
  const issue = {
    guid: "post-1",
    canonicalUrl: canonical,
    sourcePublishedAt: "2026-08-19T12:00:00.000Z",
    sourceSha256: "a".repeat(64),
    status: "published" as const,
    postPath: "src/content/posts/zh-cn/example.md",
    translatedAt: "2026-08-20T12:00:00.000Z",
    model: "test-model",
  };
  upsertSubstackIssue(file, issue);
  upsertSubstackIssue(file, issue);
  assert.equal(readSubstackLedger(file).issues.length, 1);
  fs.writeFileSync(file, "{broken", "utf8");
  assert.throws(
    () => readSubstackLedger(file),
    /invalid Substack translation ledger/
  );
});

test("archive filenames remain stable while same-day slug collisions get a content identity suffix", () => {
  const repo = tempDir("substack-archive");
  const base = {
    repo,
    publication,
    sourceTitle: "Same title",
    sourceAuthor: "Writer",
    sourcePublishedAt: "2026-08-19T12:00:00.000Z",
    translatedTitle: "同一个标题",
    description: "示例摘要",
    markdown: "正文",
    firstImage: "/images/substack/curiosity-chronicle/example.jpg",
    model: "test-model",
    translatedAt: "2026-08-20T12:00:00.000Z",
  };
  const first = archiveSubstackTranslation({
    ...base,
    canonicalUrl: "https://sahilbloom.substack.com/p/same",
  });
  const rerun = archiveSubstackTranslation({
    ...base,
    canonicalUrl: "https://sahilbloom.substack.com/p/same",
  });
  const collision = archiveSubstackTranslation({
    ...base,
    canonicalUrl: "https://sahilbloom.substack.com/archive/same",
  });
  assert.equal(rerun.postPath, first.postPath);
  assert.notEqual(collision.postPath, first.postPath);
  assert.match(collision.postPath, /-[a-f0-9]{8}\.md$/);
  assert.match(
    fs.readFileSync(path.join(repo, first.postPath), "utf8"),
    /^wechat:\n {2}enabled: true\n {2}cover: "\/images\/substack\/curiosity-chronicle\/example\.jpg"$/m
  );
  assert.throws(
    () =>
      archiveSubstackTranslation({
        ...base,
        firstImage: undefined,
        canonicalUrl: "https://sahilbloom.substack.com/p/no-cover",
      }),
    /requires a first article image/
  );
});

test("mid-article promo blocks, empty Substack mentions and footnote markers survive cleanup intact", () => {
  // 线上实测 2026-08-21：honest-broker 的订阅 CTA 插在正文中间，两侧各夹一条 <hr>；
  // experimental-history 的 @提及 在 RSS 里是空 span，名字只存在于 data-attrs 里。
  const promoPublication = {
    ...publication,
    dropPatterns: [{ source: "^Please support my work\\b", flags: "i" }],
    translationLengthRatio: {
      warnMin: 0.1,
      warnMax: 3,
      failMin: 0.05,
      failMax: 5,
    },
  };
  const mention = `<span class="mention-wrap" data-attrs='{"name":"Max Read","type":"user"}' data-component-name="MentionToDOM"></span>`;
  const html =
    "<p>Opening paragraph that carries the argument forward.</p>" +
    "<div><hr></div>" +
    "<h3>Please support my work by taking out a premium subscription.</h3>" +
    "<div><hr></div>" +
    `<p>For another take, see ${mention}'s piece.</p>` +
    '<p>A claim with a footnote.<a href="https://sahilbloom.substack.com/p/x#footnote-1">1</a></p>' +
    '<p><a href="https://sahilbloom.substack.com/p/x#footnote-anchor-1">1</a></p>' +
    `<p>${BODY_FILLER}</p>`;
  const prepared = prepareArticle(
    html,
    "https://sahilbloom.substack.com/p/x",
    promoPublication
  );

  assert.doesNotMatch(prepared.markdown, /Please support my work/);
  assert.match(prepared.markdown, /^Opening paragraph/m);
  assert.match(prepared.markdown, /piece\./);
  // CTA 删掉后两侧的分隔线会连在一起，只应留下一条。
  assert.equal((prepared.markdown.match(/^\* \* \*$/gm) || []).length, 1);
  // 空 mention span 的名字必须从 data-attrs 还原，否则译文会留下「参见 的……」这种残句。
  assert.match(prepared.markdown, /see Max Read's piece/);

  const translated = restoreTranslation(
    {
      title: "标题",
      description: "简介",
      markdown: prepared.protectedMarkdown,
    },
    prepared,
    promoPublication
  );
  // 脚注锚点与目标都保留可核查链接，正文里不应出现无主的裸数字行。
  assert.match(
    translated.markdown,
    /A claim with a footnote\.\[1\]\(https:\/\/sahilbloom\.substack\.com\/p\/x#footnote-1\)/
  );
  assert.match(
    translated.markdown,
    /^\[1\]\(https:\/\/sahilbloom\.substack\.com\/p\/x#footnote-anchor-1\)$/m
  );
  assert.equal(
    translated.markdown.split("\n").filter(line => /^\d+$/.test(line.trim()))
      .length,
    0
  );
});

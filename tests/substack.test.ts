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
  validateAndRestoreTranslation,
} from "../scripts/substack_content.ts";
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

const publication = {
  ...NEWSLETTER_PUBLICATIONS["curiosity-chronicle"],
  minTextChars: 1,
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

test("DOM cleanup precedes Markdown conversion and translation validation preserves structure and URLs", () => {
  // Production incident 2026-08-21: Curiosity Chronicle's four-block promo
  // preamble was translated and published ahead of the actual article.
  // Production incident 2026-08-21: Substack wrapped an image in a block-level
  // div inside a link, which Turndown emitted as invalid multiline link syntax.
  const imageUrl = "https://substackcdn.com/image/fetch/article.jpg";
  const html = `<p><em>watch on <a href="https://youtube.com/watch?v=example">YouTube</a> or read and listen on sahilbloom.com</em></p><p><em>read time</em> <strong>10 minutes</strong></p><p>Welcome to The Curiosity Chronicle, a newsletter where I provide actionable ideas.</p><p><em>Forwarded this email? Join 800,000+ other readers <a href="https://www.sahilbloom.com/newsletter">here</a>.</em></p><div><hr></div><h2>Heading</h2><p>Hello <a href="/p/source">source</a>.</p><figure><a href="${imageUrl}"><div><picture><img src="${imageUrl}" alt="Article image"></picture></div></a></figure><blockquote>A claim.</blockquote><ul><li>First</li><li>Second</li></ul><p class="subscribe">Subscribe now</p>`;
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
    description: "一段足够清楚的中文摘要",
    blocks: prepared.blocks.map(block => ({
      id: block.id,
      markdown: block.markdown
        .replace("Heading", "标题")
        .replace("Hello", "你好")
        .replace("source", "来源"),
    })),
  };
  const translated = validateAndRestoreTranslation(
    response,
    prepared.blocks,
    publication
  );
  assert.match(
    translated.markdown,
    /https:\/\/sahilbloom\.substack\.com\/p\/source/
  );
  assert.match(translated.markdown, /^## 标题/m);

  const linkBlock = response.blocks.find(block => /URL_/.test(block.markdown));
  assert.ok(linkBlock);
  linkBlock.markdown = linkBlock.markdown.replace(/URL_\d{4}_\d{3}/, "");
  assert.throws(
    () => validateAndRestoreTranslation(response, prepared.blocks, publication),
    /changed URL placeholders/
  );
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

test("canonical identity is stable and per-publication ledger never hides corruption", () => {
  const canonical = normalizeCanonicalUrl(
    "https://sahilbloom.substack.com/p/example/?utm_source=email&b=2&a=1#comments",
    publication.articleHosts
  );
  assert.equal(canonical, "https://sahilbloom.substack.com/p/example?a=1&b=2");
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
    description: "摘要",
    markdown: "正文",
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
});

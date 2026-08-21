import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseNewsletterFeed } from "../scripts/substack_feed.ts";
import {
  prepareArticle,
  validateAndRestoreTranslation,
} from "../scripts/substack_content.ts";
import { NEWSLETTER_PUBLICATIONS } from "../scripts/substack_publications.ts";
import { normalizeCanonicalUrl } from "../scripts/generate_substack_translations.ts";
import {
  readSubstackLedger,
  upsertSubstackIssue,
} from "../scripts/substack_ledger.ts";
import { restrictedFetchText } from "../scripts/restricted_fetch.ts";
import { validateRemoteImage } from "../scripts/substack_image.ts";
import { archiveSubstackTranslation } from "../scripts/substack_archive.ts";
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
  const html = `<h2>Heading</h2><p>Hello <a href="/p/source">source</a>.</p><blockquote>A claim.</blockquote><ul><li>First</li><li>Second</li></ul><p class="subscribe">Subscribe now</p>`;
  const prepared = prepareArticle(
    html,
    "https://sahilbloom.substack.com/p/full-post",
    publication
  );
  assert.doesNotMatch(prepared.markdown, /Subscribe now/);
  assert.match(prepared.markdown, /^## Heading/m);
  assert.equal(prepared.audit.headings, 1);
  assert.equal(prepared.audit.links, 1);
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

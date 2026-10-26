import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { magazineConfig, parseMagazineEpub, renderMagazineSource, writeMagazineArticleImages } from "../scripts/magazine.ts";
import { economistWeeklyMarkdown } from "../scripts/economist_weekly_compose.ts";
import { buildEpub } from "./helpers/epub.ts";
import { tempDir } from "./helpers/mocks.ts";

// The 2026-10-24 Economist EPUB includes a complete article with no image at all.
// Requiring an image discarded the entire issue before any summaries were generated.
test("Economist retains imageless articles through image archiving and issue composition", () => {
  const config = magazineConfig("economist-weekly");
  const body = "A complete article with evidence that must survive even without an illustration. ".repeat(25);
  const image = { href: "images/story.jpg", data: Buffer.from("original image"), mediaType: "image/jpeg" };
  const epub = buildEpub("Economist fixture", [
    { id: "illustrated", html: `<html><body><h1>Illustrated</h1><img src="${image.href}"/><p>${body}</p></body></html>`, image },
    { id: "text-only", html: `<html><body><h1>Text only</h1><p>${body}</p></body></html>` },
    { id: "another", html: `<html><body><h1>Another</h1><p>${body}</p></body></html>` },
  ]);
  const parsed = parseMagazineEpub(epub, config);
  assert.deepEqual(
    parsed.articles.map(article => article.originalTitle),
    ["Illustrated", "Text only", "Another"]
  );
  assert.equal(parsed.articles[1].text, body.trim());
  assert.equal(parsed.articles[1].image, undefined);
  const output = tempDir("magazine-images");
  const images = writeMagazineArticleImages(config, "2026-10-24", parsed, output);
  assert.deepEqual([...images], [[1, "/images/magazine/economist/2026-10-24/01.jpg"]]);
  assert.deepEqual(fs.readFileSync(path.join(output, "economist/2026-10-24/01.jpg")), image.data);
  const source = renderMagazineSource(
    config,
    { key: "fixture", issueDate: "2026-10-24", sourceCommit: "fixture", epubSha256: "fixture" },
    parsed,
    "https://example.com",
    images
  );
  assert.match(source, /原文标题：Text only/);
  const summaries = parsed.articles
    .map(article =>
      [
        `## ${article.rank}. 文章`,
        ...(images.has(article.rank) ? [`- 图片：${images.get(article.rank)}`] : []),
        `- 中文标题：文章${article.rank}`,
        "- 核心观点：供需变化推动市场结构调整。",
        "- 内容总结：文章通过事实与案例分析市场结构调整的原因。",
      ].join("\n")
    )
    .join("\n\n");
  const { markdown } = economistWeeklyMarkdown(summaries);
  assert.equal((markdown.match(/^## /gm) || []).length, parsed.articles.length);
  assert.equal((markdown.match(/!\[/g) || []).length, images.size);
  assert.match(markdown, /^## 文章2$/m);
  assert.throws(() => economistWeeklyMarkdown(summaries.replace(images.get(1)!, "https://example.com/foreign.jpg")), /local article image/);
});

// The 2026-08-31 New Yorker EPUB uses Calibre paragraphs without .article or
// article headings. CI discarded every article; its NCX holds the real titles.
test("New Yorker Calibre EPUB retains complete bodies and resolves article titles from nested NCX entries", () => {
  const stories = ["First Story", "Second Story", "Third Story"];
  const paragraphs = stories.map((_, index) => `${"A complete reported narrative with substantial supporting evidence. ".repeat(30)}TAIL_${index}`);
  const epub = buildEpub(
    "NewYorker.fixture",
    [
      ...stories.map((_, index) => ({
        id: `story-${index}`,
        html: `<html><head><title>NewYorker.fixture</title></head><body class="calibre"><div class="calibre_navbar"><p>${"NAVIGATION_ONLY ".repeat(100)}</p></div><p class="calibre_4">${paragraphs[index]}</p></body></html>`,
      })),
      {
        id: "legacy",
        html: `<html><head><title>NewYorker.fixture</title></head><body><h1>Legacy Story</h1><div class="article"><p>${paragraphs[0]}</p></div></body></html>`,
      },
      { id: "section", html: '<html><body class="calibre"><h2>Contents</h2><ul><li>First Story</li></ul></body></html>' },
      { id: "short-poem", html: '<html><body class="calibre"><p>A brief verse with too little text to summarize.</p></body></html>' },
      { id: "unrecognized", html: `<html><body><p>${paragraphs[0]}</p></body></html>` },
    ],
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>Issue</text></navLabel><content src="../story-0.xhtml"/><navPoint><navLabel><text>Section</text></navLabel><content src="../story-0.xhtml"/>${stories.map((title, index) => `<navPoint><navLabel><text>${title}</text></navLabel><content src="../story-${index}.xhtml#body"/></navPoint>`).join("")}</navPoint></navPoint><navPoint><navLabel><text>Directory Title</text></navLabel><content src="../legacy.xhtml"/></navPoint></navMap></ncx>`
  );

  const parsed = parseMagazineEpub(epub, magazineConfig("new-yorker-weekly"));
  assert.deepEqual(
    parsed.articles.map(article => article.originalTitle),
    [...stories, "Legacy Story"]
  );
  for (const [index, article] of parsed.articles.entries()) {
    assert.equal(article.rank, index + 1);
    assert.equal(article.text, paragraphs[index % paragraphs.length]);
  }
});

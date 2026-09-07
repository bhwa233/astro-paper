import assert from "node:assert/strict";
import test from "node:test";
import { magazineConfig, parseMagazineEpub } from "../scripts/magazine.ts";
import { buildEpub } from "./helpers/epub.ts";

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

import AdmZip from "adm-zip";

interface EpubPage {
  id: string;
  html: string;
  /** Calibre magazines ship .html spine items; the other two use .xhtml. */
  extension?: string;
}

/** Builds a minimal but structurally valid EPUB: container.xml + content.opf + spine pages. */
function buildEpub(title: string, pages: EpubPage[]): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "META-INF/container.xml",
    Buffer.from(`<?xml version="1.0"?><container><rootfiles><rootfile full-path="EPUB/content.opf"/></rootfiles></container>`),
  );
  const manifest = pages
    .map(page => `<item id="${page.id}" href="${page.id}.${page.extension || "xhtml"}" media-type="application/xhtml+xml"/>`)
    .join("");
  const spine = pages.map(page => `<itemref idref="${page.id}"/>`).join("");
  zip.addFile(
    "EPUB/content.opf",
    Buffer.from(`<?xml version="1.0"?><package><metadata><title>${title}</title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`),
  );
  for (const page of pages) {
    zip.addFile(`EPUB/${page.id}.${page.extension || "xhtml"}`, Buffer.from(page.html));
  }
  return zip.toBuffer();
}

export type EpubKind = "economist" | "new-yorker" | "calibre";

/**
 * Synthetic magazine EPUBs, one shape per publisher pipeline:
 * - economist: `.te_section_title` + `origin_link`, repeated titles, very long bodies
 *   (guards against title dedupe and per-article truncation).
 * - new-yorker: `.article` bodies plus a TOC page (no `.article`) and a short poem
 *   (both must be filtered out).
 * - calibre (Atlantic / Wired): hashed classes, a navbar to strip, plus a feed index
 *   page that falls below minArticleChars.
 *
 * Every article body ends in a `_TAIL` sentinel so tests can prove the tail survived.
 */
export function epubFixture(kind: EpubKind, articleCount: number): Buffer {
  if (kind === "economist") {
    return buildEpub(
      "The Economist fixture",
      Array.from({ length: articleCount }, (_, index) => {
        const rank = index + 1;
        const body = `${`Article ${rank} presents complete evidence without an artificial per-article length limit. `.repeat(180)}ARTICLE_${rank}_TAIL_SENTINEL`;
        return {
          id: `article-${rank}`,
          html: `<html><body><div class="te_section_title">Leaders</div><h1>Repeated title</h1><a class="origin_link" href="https://www.economist.com/fixture/${rank}">Original</a><p>${body}</p></body></html>`,
        };
      }),
    );
  }

  if (kind === "new-yorker") {
    return buildEpub("The New Yorker fixture", [
      ...Array.from({ length: articleCount }, (_, index) => {
        const rank = index + 1;
        const body = `${`New Yorker article ${rank} carries a full reported narrative with plenty of substance. `.repeat(60)}NY_${rank}_TAIL`;
        return {
          id: `article-${rank}`,
          html: `<html><body><span class="ny_article_category">A Reporter at Large</span><h1 class="ny_article_h1_title">Story ${rank}</h1><span class="ny_article_author">By Someone</span><div class="article"><p><a href="https://www.newyorker.com/news/story-${rank}">source</a></p><p>${body}</p></div></body></html>`,
        };
      }),
      // No .article wrapper -> dropped.
      { id: "toc-page", html: `<html><body><ul class="sec_toc_item"><li>Contents</li></ul></body></html>` },
      // Has .article but below minArticleChars -> dropped.
      {
        id: "short-poem",
        html: `<html><body><span class="ny_article_category">Poems</span><div class="article"><p>A brief verse, too short to summarize.</p></div></body></html>`,
      },
    ]);
  }

  return buildEpub("The Atlantic fixture", [
    ...Array.from({ length: articleCount }, (_, index) => {
      const rank = index + 1;
      const body = `${`Calibre body ${rank} carries a complete reported feature with ample substance to summarize. `.repeat(50)}CAL_${rank}_TAIL`;
      return {
        id: `body-${rank}`,
        extension: "html",
        html: `<html><body><div class="calibre_navbar"><a href="#">| Next |</a></div><h2 class="calibre6">Feature ${rank}</h2><p class="article_date">June 2026</p><p class="calibre3">${body}</p></body></html>`,
      };
    }),
    // Feed/TOC page: empty .article markers, no prose -> dropped by minArticleChars.
    {
      id: "feed-index",
      extension: "html",
      html: `<html><body><h2 class="calibre_feed_title">Features</h2><div class="article"></div><div class="article"></div></body></html>`,
    },
  ]);
}

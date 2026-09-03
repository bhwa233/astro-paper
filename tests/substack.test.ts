import assert from "node:assert/strict";
import test from "node:test";

import { processItem, selectItems } from "../scripts/generate_substack_translations.ts";
import { prepareArticle } from "../scripts/substack_content.ts";
import { substackPostQualityViolations } from "../scripts/substack_quality.ts";
import { readSubstackLedger, substackLedgerRelPath, upsertSubstackIssue } from "../scripts/substack_ledger.ts";
import { publicationByKey } from "../scripts/substack_publications.ts";
import { tempDir } from "./helpers/mocks.ts";

const publication = publicationByKey("curiosity-chronicle");

function feedItem(slug: string, sourceTextChars: number) {
  const canonicalUrl = `https://sahilbloom.substack.com/p/${slug}`;
  return {
    title: slug,
    guid: canonicalUrl,
    link: canonicalUrl,
    canonicalUrl,
    publishedAt: "2099-01-02T00:00:00.000Z",
    author: "Test Author",
    description: "",
    contentHtml: `<p>${"a".repeat(sourceTextChars)}</p>`,
  };
}

// The source-length gate is a publishing boundary: short posts must stop before
// AI configuration is read, persist their terminal decision, and not consume a slot.
test("Substack source-length gate skips below 4000 characters before generation", async () => {
  const repo = tempDir("substack-source-length");
  const shortItem = feedItem("short-post", 3_999);
  const short = await processItem({
    repo,
    publication,
    item: shortItem,
    promptInstructions: "",
    artifactsRoot: "artifacts",
    dryRun: false,
    force: false,
    remainingBudget: 400_000,
  });

  assert.equal(short.result.status, "skipped");
  assert.equal(short.result.sourceTextChars, 3_999);
  assert.equal(short.chargedTokens, 0);
  assert.equal(short.consumesSlot, false);

  const ledgerFile = `${repo}/${substackLedgerRelPath(publication.key)}`;
  const ledger = readSubstackLedger(ledgerFile);
  assert.equal(ledger.issues.length, 1);
  assert.equal(ledger.issues[0].status, "skipped");

  const nextItem = feedItem("long-post", 4_000);
  assert.deepEqual(
    selectItems([shortItem, nextItem], publication, ledgerFile, {
      force: false,
    }).map(item => item.canonicalUrl),
    [nextItem.canonicalUrl]
  );

  const boundary = await processItem({
    repo,
    publication,
    item: nextItem,
    promptInstructions: "",
    artifactsRoot: "artifacts",
    dryRun: true,
    force: false,
    remainingBudget: 400_000,
  });
  assert.equal(boundary.result.status, "dry-run");
  assert.equal(boundary.result.sourceTextChars, 4_000);
  assert.equal(boundary.consumesSlot, true);

  upsertSubstackIssue(ledgerFile, {
    guid: shortItem.guid,
    canonicalUrl: shortItem.canonicalUrl,
    sourcePublishedAt: shortItem.publishedAt,
    sourceSha256: "a".repeat(64),
    status: "published",
    postPath: "src/content/posts/zh-cn/existing.md",
    translatedAt: "2099-01-03T00:00:00.000Z",
    model: "test-model",
  });
  await processItem({
    repo,
    publication,
    item: shortItem,
    promptInstructions: "",
    artifactsRoot: "artifacts",
    dryRun: false,
    force: true,
    remainingBudget: 400_000,
  });
  assert.equal(readSubstackLedger(ledgerFile).issues[0].status, "published");
});

// Regression: the RSS repeated its premium CTA above and below the article.
// Selecting the first closing match deleted the entire article in production.
test("Substack cuts retain content before the closing CTA and demote body H1", () => {
  const article = prepareArticle(
    [
      "<p>If you liked this piece, you should subscribe to my premium newsletter. It’s $70 a year.</p>",
      "<p>If you want to get in touch — hit me up.</p>",
      "<hr>",
      "<h1>Section heading</h1>",
      "<p>The retained article body.</p>",
      "<p>If you liked this piece, you should subscribe to my premium newsletter. It’s $70 a year.</p>",
    ].join(""),
    "https://www.wheresyoured.at/the-ai-haters-manifesto",
    publicationByKey("wheres-your-ed-at")
  );

  assert.match(article.markdown, /^## Section heading$/m);
  assert.match(article.markdown, /The retained article body\./);
  assert.doesNotMatch(article.markdown, /^# Section heading$/m);
});

// Regression: WordPress rewrote a caption's ™ into an s.w.org emoji image, and the
// mirror step failed the whole publication on a host that is not an image source.
test("Substack restores WordPress emoji images to their source characters", () => {
  const article = prepareArticle(
    [
      "<figure><figcaption>Tove Jansson: self-portrait © Moomin Characters",
      '<img src="https://s.w.org/images/core/emoji/17.0.2/72x72/2122.png"',
      ' alt="™" class="wp-smiley" style="height: 1em; max-height: 1em;" />',
      "</figcaption></figure>",
      "<p>The retained article body.</p>",
    ].join(""),
    "https://www.themarginalian.org/2026/08/24/too-ticky-quotes-tove-jansson",
    publicationByKey("marginalian")
  );

  assert.match(article.markdown, /Moomin Characters™/);
  assert.doesNotMatch(article.markdown, /s\.w\.org/);
});

// Regression: The Marginalian preserves Markdown thematic breaks as `***`.
test("Substack quality accepts thematic breaks but rejects incomplete emphasis", () => {
  const prefix = '---\ndescription: "有效摘要"\ntitle: "标题"\n---\n';
  assert.equal(
    substackPostQualityViolations(`${prefix}\n***\n`, "post.md").some(violation => violation.code === "orphan-markup"),
    false
  );
  assert.equal(
    substackPostQualityViolations(`${prefix}\n**\n`, "post.md").some(violation => violation.code === "orphan-markup"),
    true
  );
});

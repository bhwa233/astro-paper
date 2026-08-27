import assert from "node:assert/strict";
import test from "node:test";

import {
  processItem,
  selectItems,
} from "../scripts/generate_substack_translations.ts";
import {
  readSubstackLedger,
  substackLedgerRelPath,
  upsertSubstackIssue,
} from "../scripts/substack_ledger.ts";
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

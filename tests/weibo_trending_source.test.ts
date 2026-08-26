import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWeiboTrendingItemSummary,
  WEIBO_TRENDING_SUMMARY_LIMIT,
} from "../scripts/weibo_trending_source.ts";

test("Weibo trending AI summaries reject output beyond the card limit", () => {
  const summary = "热".repeat(WEIBO_TRENDING_SUMMARY_LIMIT);
  assert.equal(
    parseWeiboTrendingItemSummary(JSON.stringify({ rank: 1, summary }), 1).summary,
    summary,
  );
  assert.throws(
    () =>
      parseWeiboTrendingItemSummary(
        JSON.stringify({ rank: 1, summary: `${summary}点` }),
        1,
      ),
    /exceeds 250 Unicode characters/,
  );
});

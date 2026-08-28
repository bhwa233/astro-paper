import assert from "node:assert/strict";
import test from "node:test";

import { validateRedditLifeVideoSelection } from "../scripts/reddit_life_video_cards.ts";
import { validateRedditLifeVideoTitle } from "../scripts/reddit_life_video_compose.ts";

test("Reddit life AI title enforces the issue-specific 20-character boundary", () => {
  const question = "哪些习惯看似普通，实际上最值得警惕？";

  assert.equal(validateRedditLifeVideoTitle("医护人员戒掉的正常习惯", question), "医护人员戒掉的正常习惯");
  assert.equal(validateRedditLifeVideoTitle("医".repeat(20), question), "医".repeat(20));
  assert.throws(() => validateRedditLifeVideoTitle("医".repeat(21), question), /at most 20/);
  assert.throws(() => validateRedditLifeVideoTitle("Reddit 精选问答", question), /column name/);
  assert.throws(() => validateRedditLifeVideoTitle(question, question), /copying it verbatim/);
});

test("Reddit life daily selection requires exactly two issues", () => {
  assert.throws(() => validateRedditLifeVideoSelection({ issues: [] }, []), /exactly 2 issues/);
  assert.throws(() => validateRedditLifeVideoSelection({ issues: [{}] }, []), /exactly 2 issues/);
});

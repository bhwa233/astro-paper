import assert from "node:assert/strict";
import test from "node:test";

import { redditLifeCardCount, validateRedditLifeVideoSelection } from "../scripts/reddit_life_video_cards.ts";
import { validateRedditLifeVideoTitle } from "../scripts/reddit_life_video_compose.ts";

test("Reddit life AI title enforces the issue-specific 20-character boundary", () => {
  const question = "哪些习惯看似普通，实际上最值得警惕？";

  assert.equal(validateRedditLifeVideoTitle("医护人员戒掉的正常习惯", question), "医护人员戒掉的正常习惯");
  assert.equal(validateRedditLifeVideoTitle("医".repeat(20), question), "医".repeat(20));
  assert.throws(() => validateRedditLifeVideoTitle("医".repeat(21), question), /at most 20/);
  assert.throws(() => validateRedditLifeVideoTitle("Reddit 精选问答", question), /column name/);
  assert.throws(() => validateRedditLifeVideoTitle(question, question), /copying it verbatim/);
});

test("Reddit life daily selection requires exactly one issue", () => {
  assert.throws(() => validateRedditLifeVideoSelection({ issues: [] }, []), /exactly 1 issues/);
  assert.throws(() => validateRedditLifeVideoSelection({ issues: [{}, {}] }, []), /exactly 1 issues/);
});

test("Reddit life card batch takes every answer when a question has fewer than ten", () => {
  const question = {
    index: 1,
    question: "哪些习惯看似普通，实际上最值得警惕？",
    answers: [
      { index: 1, answer: "每天熬夜刷手机到两点。" },
      { index: 2, answer: "饭后立刻躺下睡觉。" },
      { index: 3, answer: "长期憋尿不去厕所。" },
    ],
  };
  const issue = (sourceIndexes: number[]) => ({
    issues: [
      {
        questionIndex: 1,
        title: "最该警惕的普通习惯",
        cards: sourceIndexes.map(sourceIndex => ({ sourceIndex, body: question.answers[sourceIndex - 1]!.answer })),
      },
    ],
  });

  assert.equal(redditLifeCardCount(question), 3);
  const [selected] = validateRedditLifeVideoSelection(issue([2, 1, 3]), [question], 1, redditLifeCardCount).issues;
  assert.deepEqual(
    selected!.cards.map(card => card.sourceIndex),
    [2, 1, 3]
  );
  assert.ok(selected!.cards.every(card => card.verbatim));
  assert.throws(() => validateRedditLifeVideoSelection(issue([1, 2]), [question], 1, redditLifeCardCount), /exactly 3 cards/);
  // 每日视频不传 cardCount，仍是固定十条。
  assert.throws(() => validateRedditLifeVideoSelection(issue([1, 2, 3]), [question], 1), /exactly 10 cards/);
  assert.throws(
    () =>
      validateRedditLifeVideoSelection(
        { issues: [{ questionIndex: 1, title: "无回答的问题", cards: [] }] },
        [{ ...question, answers: [] }],
        1,
        redditLifeCardCount
      ),
    /1-10 cards/
  );
});

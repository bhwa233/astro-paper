import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRedditLifeNewspicSelection,
  renderRedditLifeNewspicMarkdown,
} from "../scripts/reddit_life_newspic_compose.ts";

test("Reddit image message preserves the AI title and selected question", () => {
  const selection = parseRedditLifeNewspicSelection(
    {
      version: 3,
      archiveDate: "2099-01-02",
      title: "普通习惯背后的健康代价",
      question: "哪些习惯看似普通，实际上最值得警惕？",
      cards: [
        { index: 1, sourceIndex: 10, body: "第一条高赞回答。" },
        { index: 2, sourceIndex: 11, body: "第二条高赞回答。" },
      ],
    },
    "2099-01-02",
  );

  const markdown = renderRedditLifeNewspicMarkdown(selection);
  assert.match(markdown, /title: "普通习惯背后的健康代价"/);
  assert.match(markdown, /syncId: "reddit-life-newspic-2099-01-02"/);
  assert.match(markdown, /articleType: "newspic"/);
  assert.doesNotMatch(markdown, /sourceURL:/);
  assert.match(markdown, /!\[\]\(card-00\.png\)[\s\S]*!\[\]\(card-01\.png\)[\s\S]*!\[\]\(card-02\.png\)/);
});

test("Reddit image message refuses a selection that mixes duplicate source answers", () => {
  assert.throws(
    () =>
      parseRedditLifeNewspicSelection(
        {
          version: 3,
          archiveDate: "2099-01-02",
          title: "普通习惯背后的健康代价",
          question: "哪些习惯看似普通，实际上最值得警惕？",
          cards: [
            { index: 1, sourceIndex: 10, body: "第一条高赞回答。" },
            { index: 2, sourceIndex: 10, body: "第二条高赞回答。" },
          ],
        },
        "2099-01-02",
      ),
    /duplicate source index/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRedditLifeNewspicSelections,
  renderRedditLifeNewspicMarkdown,
} from "../scripts/reddit_life_newspic_compose.ts";
import { VIDEO_MANIFEST_VERSION } from "../video/src/contract.ts";

test("Reddit image messages preserve both AI titles and selected questions", () => {
  const selections = parseRedditLifeNewspicSelections(
    {
      version: VIDEO_MANIFEST_VERSION,
      archiveDate: "2099-01-02",
      title: "普通习惯背后的健康代价",
      question: "哪些习惯看似普通，实际上最值得警惕？",
      cards: [
        { index: 1, sourceIndex: 10, body: "第一条高赞回答。" },
        { index: 2, sourceIndex: 11, body: "第二条高赞回答。" },
      ],
      additionalIssues: [
        {
          title: "成年人默默承受的生活真相",
          question: "哪些成年后的真相很少有人提前告诉你？",
          cards: [{ index: 1, sourceIndex: 20, body: "另一组高赞回答。" }],
        },
      ],
    },
    "2099-01-02",
  );

  assert.equal(selections.length, 2);
  const markdown = selections.map(renderRedditLifeNewspicMarkdown);
  assert.match(markdown[0], /title: "普通习惯背后的健康代价"/);
  assert.match(markdown[0], /syncId: "reddit-life-newspic-2099-01-02-01"/);
  assert.match(markdown[1], /title: "成年人默默承受的生活真相"/);
  assert.match(markdown[1], /syncId: "reddit-life-newspic-2099-01-02-02"/);
  assert.match(markdown[0], /articleType: "newspic"/);
  assert.doesNotMatch(markdown[0], /sourceURL:/);
  assert.match(markdown[0], /!\[\]\(card-00\.png\)[\s\S]*!\[\]\(card-01\.png\)[\s\S]*!\[\]\(card-02\.png\)/);
});

test("Reddit image message refuses a selection that mixes duplicate source answers", () => {
  assert.throws(
    () =>
      parseRedditLifeNewspicSelections(
        {
          version: VIDEO_MANIFEST_VERSION,
          archiveDate: "2099-01-02",
          title: "普通习惯背后的健康代价",
          question: "哪些习惯看似普通，实际上最值得警惕？",
          cards: [
            { index: 1, sourceIndex: 10, body: "第一条高赞回答。" },
            { index: 2, sourceIndex: 10, body: "第二条高赞回答。" },
          ],
          additionalIssues: [
            {
              title: "成年人默默承受的生活真相",
              question: "哪些成年后的真相很少有人提前告诉你？",
              cards: [{ index: 1, sourceIndex: 20, body: "另一组高赞回答。" }],
            },
          ],
        },
        "2099-01-02",
      ),
    /duplicate source index/,
  );
});

test("Reddit image messages require two different questions", () => {
  assert.throws(
    () =>
      parseRedditLifeNewspicSelections(
        {
          version: VIDEO_MANIFEST_VERSION,
          archiveDate: "2099-01-02",
          title: "普通习惯背后的健康代价",
          question: "哪些习惯看似普通，实际上最值得警惕？",
          cards: [{ index: 1, sourceIndex: 10, body: "第一条高赞回答。" }],
          additionalIssues: [
            {
              title: "同一问题不能重复生成两条",
              question: "哪些习惯看似普通，实际上最值得警惕？",
              cards: [{ index: 1, sourceIndex: 20, body: "另一组高赞回答。" }],
            },
          ],
        },
        "2099-01-02",
      ),
    /different questions/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { resolveRedditLifeVideoTaxonomy, REDDIT_LIFE_VIDEO_SUMMARY_HARD_MAX_CHARS } from "../scripts/reddit_life_video_taxonomy.ts";

const TITLE = "医护看多了患者后戒掉的习惯";
const SUMMARY = "他们最先戒掉的是摩托车和安全带侥幸心理，而不是大家以为的垃圾食品";

test("Reddit life taxonomy keeps vocabulary tags and records the ones it dropped", () => {
  const result = resolveRedditLifeVideoTaxonomy({ tags: ["身心健康", "人性观察", "动物园", "反常识"], summary: SUMMARY }, TITLE);

  assert.equal(result.status, "processed");
  assert.deepEqual(result.tags, ["身心健康", "人性观察", "反常识"]);
  assert.deepEqual(result.droppedTags, ["动物园"]);
});

test("Reddit life taxonomy normalizes hash prefixes and drops duplicates", () => {
  const result = resolveRedditLifeVideoTaxonomy({ tags: ["#身心健康", "身心健康", "人性观察", "反常识"], summary: SUMMARY }, TITLE);

  assert.equal(result.status, "processed");
  assert.deepEqual(result.tags, ["身心健康", "人性观察", "反常识"]);
});

test("Reddit life taxonomy degrades instead of throwing when too few tags survive", () => {
  const result = resolveRedditLifeVideoTaxonomy({ tags: ["身心健康", "自造词", "另一个自造词"], summary: SUMMARY }, TITLE);

  assert.equal(result.status, "failed");
  assert.deepEqual(result.tags, []);
  assert.deepEqual(result.droppedTags, ["自造词", "另一个自造词"]);
  assert.match(result.problems.join(" "), /only 1 of 3 required tags/);
});

test("Reddit life taxonomy requires two primary tags", () => {
  const result = resolveRedditLifeVideoTaxonomy({ tags: ["身心健康", "医护视角", "反常识"], summary: SUMMARY }, TITLE);

  assert.equal(result.status, "failed");
  assert.match(result.problems.join(" "), /only 1 of 2 required primary tags/);
});

test("Reddit life taxonomy keeps primary tags when trimming past the five-tag ceiling", () => {
  const result = resolveRedditLifeVideoTaxonomy({ tags: ["医护视角", "反常识", "亲身经历", "冷知识", "身心健康", "人性观察"], summary: SUMMARY }, TITLE);

  // 主题域排在前面，截断才不会把它们截没——栏目名固定之后它们是唯一的区分信号。
  assert.equal(result.status, "processed");
  assert.deepEqual(result.tags, ["身心健康", "人性观察", "医护视角", "反常识", "亲身经历"]);
});

test("Reddit life summary accepts the target band and flags lengths outside it", () => {
  const tags = ["身心健康", "人性观察", "反常识"];

  assert.equal(resolveRedditLifeVideoTaxonomy({ tags, summary: SUMMARY }, TITLE).summaryOutOfBand, false);
  assert.equal(resolveRedditLifeVideoTaxonomy({ tags, summary: "他们最先戒的是摩托车" }, TITLE).summaryOutOfBand, true);
  assert.equal(resolveRedditLifeVideoTaxonomy({ tags, summary: "他们最先戒的是摩托车" }, TITLE).status, "processed");
});

test("Reddit life summary degrades past the hard ceiling", () => {
  const tags = ["身心健康", "人性观察", "反常识"];
  const overlong = "戒".repeat(REDDIT_LIFE_VIDEO_SUMMARY_HARD_MAX_CHARS + 1);
  const result = resolveRedditLifeVideoTaxonomy({ tags, summary: overlong }, TITLE);

  assert.equal(result.status, "failed");
  assert.equal(result.summary, "");
  assert.match(result.problems.join(" "), /hard limit is 60/);
});

test("Reddit life summary refuses to restate the title", () => {
  const tags = ["身心健康", "人性观察", "反常识"];
  const result = resolveRedditLifeVideoTaxonomy({ tags, summary: `「${TITLE}」。` }, TITLE);

  assert.equal(result.status, "failed");
  assert.match(result.problems.join(" "), /restates the title/);
});

test("Reddit life taxonomy degrades on a missing or malformed payload", () => {
  assert.equal(resolveRedditLifeVideoTaxonomy({}, TITLE).status, "failed");
  assert.equal(resolveRedditLifeVideoTaxonomy(null, TITLE).status, "failed");
  assert.equal(resolveRedditLifeVideoTaxonomy({ tags: "身心健康", summary: SUMMARY }, TITLE).status, "failed");
});

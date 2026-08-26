import assert from "node:assert/strict";
import test from "node:test";
import { parseRedditItemSummary, parseSourceFacts } from "../scripts/reddit_top20_compose.ts";

function item(summary: string): string {
  return JSON.stringify({ rank: 1, title_zh: "一次失误如何失控", description: "当事人的选择引发了一连串后果。", summary });
}

test("Reddit life discussion summaries reject answer lists but accept continuous narrative", () => {
  assert.throws(
    () => parseRedditItemSummary(item("1\\. 第一条回答仍在按问答方式罗列。"), 1, 1, "narrative"),
    /narrative summary must not use lists/,
  );

  const narrative = "事情从一次看似能蒙混过去的选择开始，当事人很快发现后果已经超出控制。\n\n评论里的质疑没有替他下结论，而是把他一直回避的矛盾推到了眼前。";
  assert.equal(parseRedditItemSummary(item(narrative), 1, 1, "narrative").summary, narrative);
});

test("Reddit source facts use the local subreddit split over a legacy category label", () => {
  const source = [
    "1. [r/confessions] I kept a secret too long",
    "- 栏目：life",
    "- 来源：r/confessions",
    "- 发布时间：2099-01-02T07:00:00Z",
    "- 帖子链接：https://www.reddit.com/r/confessions/comments/fixture/",
  ].join("\n");

  assert.equal(parseSourceFacts(source)[0]?.category, "life-discussions");
});

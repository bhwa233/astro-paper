import assert from "node:assert/strict";
import test from "node:test";

import { dropTrailingStories, renderRedditLifeWechatMarkdown, type RedditLifeCandidate } from "../scripts/reddit_life_wechat_compose.ts";

const candidate: RedditLifeCandidate = {
  rank: 1,
  postId: "abc123",
  title: "一个值得讨论的问题",
  subreddit: "AskReddit",
  points: "1000 points · 100 评论",
  numComments: 100,
  permalink: "https://www.reddit.com/r/AskReddit/comments/abc123/topic/",
  body: "1\\. 第一条回答\n\n2\\. 第二条回答",
};

const trailingCandidate: RedditLifeCandidate = {
  ...candidate,
  rank: 2,
  postId: "def456",
  title: "另一道也值得讨论的问题",
  permalink: "https://www.reddit.com/r/AskReddit/comments/def456/topic/",
  body: "1\\. 唯一一条回答",
};

test("Reddit life WeChat opens with its fixed question list and keeps it during truncation", () => {
  const markdown = renderRedditLifeWechatMarkdown({
    candidates: [candidate, trailingCandidate],
    headline: candidate.title,
    archiveDate: "2099-01-01",
    volume: "v1",
    articleUrl: "https://example.com/posts/reddit-life/",
    coverFile: "cover-1.png",
  });

  assert.match(markdown, /showCoverInBody: false/);
  // 摘要留给微信从正文抽；astro-wechat 取值前会 trim 再丢空串，只有零宽空格能穿过去。
  assert.match(markdown, /^ {2}digest: "\u200B"$/m);
  assert.doesNotMatch(markdown, /^description:/m);
  // 2026-08-27: omitting sourceURL made the WeChat CLI derive a nonexistent
  // /posts/<archive-file>/ link instead of pointing 阅读原文 at the daily blog.
  assert.match(markdown, /sourceURL: "https:\/\/example\.com\/posts\/reddit-life\/"/);
  assert.match(markdown, /> 本期 Reddit 问答包括：\n>\n> 1\\\. 一个值得讨论的问题\n>\n> 2\\\. 另一道也值得讨论的问题/);
  assert.ok(markdown.indexOf("本期 Reddit 问答包括：") < markdown.indexOf(`## ${candidate.title}`));

  const shortened = dropTrailingStories(markdown, 2);
  assert.match(shortened, /> 本期 Reddit 问答包括：\n>\n> 1\\\. 一个值得讨论的问题\n\n/);
  assert.doesNotMatch(shortened, /另一道也值得讨论的问题/);
  assert.match(shortened, /第一条回答/);
  assert.doesNotMatch(shortened, /第二条回答/);
});

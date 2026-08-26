import assert from "node:assert/strict";
import test from "node:test";

import {
  dropTrailingStories,
  renderRedditLifeWechatMarkdown,
  type RedditLifeCandidate,
} from "../scripts/reddit_life_wechat_compose.ts";

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

test("Reddit life WeChat opens with the AI lead and keeps its cover out of the body", () => {
  const lead = "这是一段由 AI 根据本卷问题写出的导语。";
  const markdown = renderRedditLifeWechatMarkdown({
    candidates: [candidate],
    headline: candidate.title,
    description: candidate.title,
    lead,
    archiveDate: "2099-01-01",
    volume: "v1",
    articleUrl: "https://example.com/posts/reddit-life/",
    coverFile: "cover-1.png",
  });

  assert.match(markdown, /showCoverInBody: false/);
  assert.ok(markdown.indexOf(lead) < markdown.indexOf(`## ${candidate.title}`));

  const shortened = dropTrailingStories(markdown, 1);
  assert.match(shortened, new RegExp(lead));
  assert.match(shortened, /第一条回答/);
  assert.doesNotMatch(shortened, /第二条回答/);
});

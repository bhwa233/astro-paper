import assert from "node:assert/strict";
import test from "node:test";

import { parseRedditLifeWechatSelection, rankedRedditLifeCandidates, splitRedditLifeWechatCandidates } from "../scripts/reddit_life_wechat_selection.ts";
import type { RedditLifeCandidate } from "../scripts/reddit_life_wechat_compose.ts";

function candidates(count: number): RedditLifeCandidate[] {
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    return {
      rank,
      postId: `post${rank}`,
      title: `候选 ${rank}`,
      subreddit: "AskReddit",
      points: `${1000 - rank} points · ${rank} 评论`,
      numComments: rank,
      permalink: `https://www.reddit.com/r/AskReddit/comments/post${rank}/topic/`,
      body: "1\\. 代表回答",
    };
  });
}

test("Reddit life WeChat selection can promote posts beyond the original top 20", () => {
  const source = candidates(25);
  const selectedRanks = [25, 2, 21];
  const selection = parseRedditLifeWechatSelection(
    JSON.stringify({
      selected: selectedRanks.map(rank => ({ rank, longTail: 5, resonance: 4, reason: "具备跨地区的长期讨论价值" })),
      rejected: source.filter(item => !selectedRanks.includes(item.rank)).map(item => ({ rank: item.rank, category: "low_resonance", reason: "讨论角度较窄且缺少代表故事" })),
    }),
    source.length,
  );

  assert.deepEqual(
    rankedRedditLifeCandidates(source, selection).map(item => item.rank),
    selectedRanks,
  );
});

test("Reddit life WeChat selection rejects duplicate and omitted candidates", () => {
  assert.throws(
    () =>
      parseRedditLifeWechatSelection(
        JSON.stringify({
          selected: [{ rank: 2, longTail: 5, resonance: 5, reason: "具备长期讨论价值" }],
          rejected: [
            { rank: 2, category: "low_resonance", reason: "重复候选" },
            { rank: 3, category: "narrow_interest", reason: "受众范围较窄" },
          ],
        }),
        3,
      ),
    /cover all 3 candidates exactly once/,
  );
});

test("Reddit life WeChat splits ten AI-ranked posts across both drafts", () => {
  const volumes = splitRedditLifeWechatCandidates(candidates(10));
  assert.deepEqual(volumes.map(volume => volume.map(item => item.rank)), [
    [1, 3, 5, 7, 9],
    [2, 4, 6, 8, 10],
  ]);
});

test("Reddit life WeChat keeps an incomplete selection in one ordered draft", () => {
  const volumes = splitRedditLifeWechatCandidates(candidates(6));
  assert.deepEqual(volumes.map(volume => volume.map(item => item.rank)), [[1, 2, 3, 4, 5, 6]]);
});

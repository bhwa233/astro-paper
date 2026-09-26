import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRedditLifeWechatSelection,
  rankedRedditLifeCandidates,
  splitRedditLifeWechatCandidates,
  validateLegacyRedditLifeWechatSelection,
} from "../scripts/reddit_life_wechat_selection.ts";
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

test("Reddit life WeChat orders by score, breaks ties by source rank, and drops posts below the threshold", () => {
  const source = candidates(8);
  const scoreByRank: Record<number, number> = { 1: 40, 2: 75, 3: 90, 4: 75, 5: 59, 6: 60, 7: 88, 8: 10 };
  const selection = parseRedditLifeWechatSelection(
    JSON.stringify({ scores: source.map(item => ({ rank: item.rank, score: scoreByRank[item.rank], reason: "理由" })) }),
    source.length
  );

  assert.deepEqual(
    rankedRedditLifeCandidates(source, selection).map(item => item.rank),
    [3, 7, 2, 4, 6]
  );
  assert.equal(selection.scores.length, 8);
});

test("Reddit life WeChat selection rejects duplicate and omitted candidates", () => {
  assert.throws(
    () =>
      parseRedditLifeWechatSelection(
        JSON.stringify({
          scores: [
            { rank: 2, score: 80, reason: "具备长期讨论价值" },
            { rank: 2, score: 30, reason: "重复候选" },
            { rank: 3, score: 50, reason: "受众范围较窄" },
          ],
        }),
        3
      ),
    /cover all 3 candidates exactly once/
  );
});

test("Reddit life WeChat still reads the pre-scoring audit format of historical manifests", () => {
  const legacy = {
    selected: [{ rank: 2, longTail: 5, resonance: 4, reason: "具备长期讨论价值" }],
    rejected: [{ rank: 1, category: "region_specific", reason: "依赖本地制度" }],
  };
  assert.deepEqual(validateLegacyRedditLifeWechatSelection(legacy, 2, 10).selected, [{ rank: 2 }]);
});

test("Reddit life WeChat keeps up to five AI-ranked posts in one ordered draft", () => {
  const volumes = splitRedditLifeWechatCandidates(candidates(5));
  assert.deepEqual(
    volumes.map(volume => volume.map(item => item.rank)),
    [[1, 2, 3, 4, 5]]
  );
  assert.throws(() => splitRedditLifeWechatCandidates(candidates(6)), /at most 5 selected posts/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWeiboTrendingDedupeResponse,
  parseWeiboTrendingItemSummary,
  removeWeiboTrendingDuplicates,
  WEIBO_TRENDING_SUMMARY_LIMIT,
  type WeiboTrendingItem,
} from "../scripts/weibo_trending_source.ts";
import {
  parseWeiboTrendingTitleResponse,
  WEIBO_TRENDING_WECHAT_DESCRIPTION_MAX_LENGTH,
  WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH,
} from "../scripts/weibo_trending_title.ts";

test("Weibo trending AI summaries reject output beyond the card limit", () => {
  const summary = "热".repeat(WEIBO_TRENDING_SUMMARY_LIMIT);
  assert.equal(
    parseWeiboTrendingItemSummary(JSON.stringify({ rank: 1, summary }), 1).summary,
    summary,
  );
  assert.throws(
    () =>
      parseWeiboTrendingItemSummary(
        JSON.stringify({ rank: 1, summary: `${summary}点` }),
        1,
      ),
    /exceeds 250 Unicode characters/,
  );
});

test("Weibo trending dedupe keeps the highest-ranked item in each semantic duplicate group", () => {
  const candidates = [1, 2, 3, 4, 5].map(rank => ({
    rank,
    title: `话题${rank}`,
    category: "热搜",
    url: `https://example.com/${rank}`,
    description: "",
    hot: 100 - rank,
  })) satisfies WeiboTrendingItem[];
  const groups = parseWeiboTrendingDedupeResponse(
    JSON.stringify({
      duplicate_groups: [
        { ranks: [4, 2], reason: "同一新闻事件的不同进展" },
        { ranks: [5, 3], reason: "同一传闻的不同说法" },
      ],
    }),
    candidates.map(item => item.rank),
  );

  assert.deepEqual(groups.map(group => group.ranks), [[2, 4], [3, 5]]);
  assert.deepEqual(removeWeiboTrendingDuplicates(candidates, groups).kept.map(item => item.rank), [1, 2, 3]);
  assert.throws(
    () =>
      parseWeiboTrendingDedupeResponse(
        JSON.stringify({
          duplicate_groups: [
            { ranks: [1, 2], reason: "同一事件" },
            { ranks: [2, 3], reason: "另一事件" },
          ],
        }),
        candidates.map(item => item.rank),
      ),
    /appears in more than one group/,
  );
});

test("Weibo trending AI returns a bounded WeChat title and topic summary", () => {
  const title = "赴韩女生遇害等十条热搜";
  const description = "西藏吉隆口岸泥石流救援持续推进，刘翔退役安置争议引发体育保障讨论，中国女留学生在韩遇害案披露更多调查细节，其余热点涉及外交安全、消费争议与文娱动态。";
  assert.deepEqual(
    parseWeiboTrendingTitleResponse(
      JSON.stringify({ title_suffix: "三件事看懂今天", wechat_title: title, wechat_description: description }),
      10,
    ),
    { titleSuffix: "三件事看懂今天", wechatTitle: title, wechatDescription: description },
  );
  assert.throws(
    () =>
      parseWeiboTrendingTitleResponse(
        JSON.stringify({
          title_suffix: "三件事看懂今天",
          wechat_title: `${"热".repeat(WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH - 1)}热搜`,
          wechat_description: description,
        }),
        10,
      ),
    /exceeds 20 characters/,
  );
  assert.throws(
    () =>
      parseWeiboTrendingTitleResponse(
        JSON.stringify({
          title_suffix: "三件事看懂今天",
          wechat_title: title,
          wechat_description: "热".repeat(WEIBO_TRENDING_WECHAT_DESCRIPTION_MAX_LENGTH + 1),
        }),
        10,
      ),
    /must contain 60-120 characters/,
  );
});

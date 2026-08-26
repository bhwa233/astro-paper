import assert from "node:assert/strict";
import test from "node:test";

import { renderWeiboTrendingWechatMarkdown, weiboTrendingWechatSyncId } from "../scripts/weibo_trending_wechat_compose.ts";

const items = [{ rank: 1, title: "测试热搜", summary: "测试摘要。" }];
const articleUrl = "https://blog.bhwa233.com/posts/01/";

test("Weibo trending WeChat drafts use a date-specific sync identity", () => {
  const firstDate = "2099-01-01";
  const secondDate = "2099-01-02";

  assert.notEqual(weiboTrendingWechatSyncId(firstDate), weiboTrendingWechatSyncId(secondDate));

  const markdown = renderWeiboTrendingWechatMarkdown({
    items,
    archiveDate: firstDate,
    title: "测试热搜｜2099-01-01 微博热搜",
    description: "测试热搜摘要。",
    articleUrl,
    showSourceUrl: false,
  });

  assert.match(markdown, /syncId: "weibo-trending-2099-01-01"/);
  assert.doesNotMatch(markdown, /sourceURL:/);
});

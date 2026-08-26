import assert from "node:assert/strict";
import test from "node:test";

import {
  renderWeiboTrendingWechatMarkdown,
  weiboTrendingWechatSyncId,
} from "../scripts/weibo_trending_wechat_compose.ts";

const articleUrl = "https://blog.bhwa233.com/posts/01/";

test("Weibo trending WeChat drafts use a date-specific sync identity", () => {
  const firstDate = "2099-01-01";
  const secondDate = "2099-01-02";

  assert.notEqual(weiboTrendingWechatSyncId(firstDate), weiboTrendingWechatSyncId(secondDate));

  const markdown = renderWeiboTrendingWechatMarkdown({
    itemCount: 1,
    archiveDate: firstDate,
    title: "测试热搜｜2099-01-01 微博热搜",
    description: "测试热搜摘要。",
    articleUrl,
    showSourceUrl: false,
  });

  assert.match(markdown, /syncId: "weibo-trending-2099-01-01"/);
  assert.match(markdown, /articleType: "newspic"/);
  assert.match(markdown, /!\[\]\(card-00\.png\)[\s\S]*!\[\]\(card-01\.png\)/);
  assert.doesNotMatch(markdown, /sourceURL:/);
});

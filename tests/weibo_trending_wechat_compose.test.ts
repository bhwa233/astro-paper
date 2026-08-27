import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWeiboTrendingArticleWechatTitle,
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
    title: "测试事件等十条热搜",
    description: "测试热搜摘要。",
    articleUrl,
    showSourceUrl: false,
  });

  assert.match(markdown, /syncId: "weibo-trending-2099-01-01"/);
  assert.match(markdown, /articleType: "newspic"/);
  assert.match(markdown, /title: "测试事件等十条热搜"/);
  assert.match(markdown, /!\[\]\(card-00\.png\)[\s\S]*!\[\]\(card-01\.png\)/);
  assert.doesNotMatch(markdown, /sourceURL:/);
});

test("Weibo trending WeChat uses the dedicated title from the upstream article", () => {
  const markdown = `---
title: "完整的站点文章标题 ｜ 2099-01-01 微博热搜"
wechat:
  title: "核心事件等十条热搜"
---
`;
  assert.equal(parseWeiboTrendingArticleWechatTitle(markdown), "核心事件等十条热搜");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  fitWeiboTrendingWechatSummary,
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

test("Weibo trending image cards shorten summaries only at sentence boundaries", () => {
  const summary = "第一句完整。第二句也完整。第三句保留。";

  assert.equal(fitWeiboTrendingWechatSummary(summary, 14), "第一句完整。第二句也完整。…");
  assert.throws(
    () => fitWeiboTrendingWechatSummary("没有句号的超长第一句话", 8),
    /starts with a sentence longer than 7 characters/,
  );
});

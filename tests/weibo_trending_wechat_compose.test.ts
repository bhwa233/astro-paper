import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWeiboTrendingArticleDescription,
  parseWeiboTrendingArticleWechatTitle,
  renderWeiboTrendingWechatMarkdown,
  weiboTrendingWechatSyncId,
} from "../scripts/weibo_trending_wechat_compose.ts";

const articleUrl = "https://blog.bhwa233.com/posts/01/";
const description = "西藏吉隆口岸泥石流救援持续推进，刘翔退役安置争议引发体育保障讨论，中国女留学生在韩遇害案披露更多调查细节，其余热点涉及外交安全、消费争议与文娱动态。";

test("Weibo trending WeChat drafts use a date-specific sync identity", () => {
  const firstDate = "2099-01-01";
  const secondDate = "2099-01-02";

  assert.notEqual(weiboTrendingWechatSyncId(firstDate), weiboTrendingWechatSyncId(secondDate));

  const markdown = renderWeiboTrendingWechatMarkdown({
    itemCount: 1,
    archiveDate: firstDate,
    title: "测试事件等1条热搜",
    description,
    articleUrl,
    showSourceUrl: false,
  });

  assert.match(markdown, /syncId: "weibo-trending-2099-01-01"/);
  assert.match(markdown, /articleType: "newspic"/);
  assert.match(markdown, /title: "测试事件等1条热搜"/);
  assert.match(markdown, new RegExp(`description: "${description}"[\\s\\S]*---\\n\\n${description}\\n\\n!\\[\\]\\(card-00\\.png\\)[\\s\\S]*!\\[\\]\\(card-01\\.png\\)`));
  assert.doesNotMatch(markdown, /sourceURL:/);
});

test("Weibo trending WeChat validates the dedicated title and summary from the upstream article", () => {
  const markdown = `---
title: "完整的站点文章标题 ｜ 2099-01-01 微博热搜"
wechat:
  title: "核心事件等1条热搜"
description: "${description}"
---

## 1. 核心事件
`;
  assert.equal(parseWeiboTrendingArticleWechatTitle(markdown), "核心事件等1条热搜");
  assert.equal(parseWeiboTrendingArticleDescription(markdown), description);
});

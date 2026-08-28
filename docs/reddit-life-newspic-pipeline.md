# Reddit 图片消息管线

`publish-reddit-life-newspic.yml` 每日将已经归档的视频选题转换为一篇微信公众号图片消息草稿。它不请求 Reddit，也不调用模型；同日视频与图片消息共用一个问题和同一组回答。

```text
data/reddit-life-video/<date>/video.json
  -> scripts/generate_reddit_life_newspic.ts
       -> data/reddit-life-newspic/<date>/video.json
       -> data/reddit-life-newspic/<date>/card-00.png ... card-10.png
       -> data/reddit-life-newspic/<date>/01.md
       -> data/reddit-life-newspic/<date>/run.json
```

第一张 `1080x1440` PNG 是问题卡；后续一到十张是依照视频选题排序的中文高赞回答卡。所有卡片均由 `video/` 工作区的 Remotion 静帧渲染器以 React/CSS 排版并归档为 PNG，第一张同时作为微信图片消息的封面。静态卡片框架与批量渲染器可供后续图文 composition 复用。

归档稿的 `description` 和图片消息的纯文本 `content` 都使用当天精选问题。微信的 `newspic` 草稿不接受普通图文的 `digest` 字段，因此必须把问题放在 Markdown 图片列表之前，才能作为草稿描述发送。

归档 Markdown 固定使用 `wechat.articleType: newspic`、独立的日期 `syncId` 和 `Reddit人生讨论` 标签。它不写 `sourceURL`：微信的“阅读原文”必须在创建草稿前提供一个公开 URL，而新图片消息在这个时点没有自己的公开地址。

工作流在视频任务成功完成时触发，并保留一小时后的定时补偿。若定时任务先于视频选题提交，生成器会写入 `upstream-empty` manifest 后成功退出；视频完成事件检测到选题到达后会在同日重建。处理成功时，manifest 记录视频选题、生成稿和每张卡片的 SHA-256，重跑会校验全部归档文件后复用，`force` 才会重新渲染并创建替代微信草稿。

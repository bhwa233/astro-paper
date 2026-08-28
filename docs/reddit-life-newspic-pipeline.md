# Reddit 图片消息管线

`publish-reddit-life-newspic.yml` 每日将已经归档的视频选题转换为两篇微信公众号图片消息草稿。它不请求 Reddit，也不调用模型；上游一次 AI 请求同时选出两个不同问题及各自的标题和回答，第一组供视频与第一篇图片消息共用，第二组用于当天第二篇图片消息。

```text
data/reddit-life-video/<date>/video.json
  -> scripts/generate_reddit_life_newspic.ts
       -> data/reddit-life-newspic/<date>/video.json
       -> data/reddit-life-newspic/<date>/01/card-00.png ... card-10.png
       -> data/reddit-life-newspic/<date>/01/01.md
       -> data/reddit-life-newspic/<date>/02/card-00.png ... card-10.png
       -> data/reddit-life-newspic/<date>/02/01.md
       -> data/reddit-life-newspic/<date>/run.json
```

每组第一张 `1080x1440` PNG 是问题卡；后续一到十张是依照选题排序的中文高赞回答卡。所有卡片均由 `video/` 工作区的 Remotion 静帧渲染器以 React/CSS 排版并归档为 PNG，第一张同时作为该微信图片消息的封面。静态卡片框架与批量渲染器可供后续图文 composition 复用。

视频选题的 v4 `video.json` 必须携带两组由选题 AI 根据最终问题和回答生成的中文 `title`，每个最多 20 个 Unicode 字符。第一组保留在顶层以兼容视频渲染，第二组存入 `additionalIssues`。图片消息直接复用两个标题，不再额外调用模型；每篇归档稿的 `description` 和图片消息纯文本 `content` 使用各自完整问题。微信的 `newspic` 草稿不接受普通图文的 `digest` 字段，因此必须把问题放在 Markdown 图片列表之前，才能作为草稿描述发送。

归档 Markdown 固定使用 `wechat.articleType: newspic`、独立的 `reddit-life-newspic-<date>-01/02` sync ID 和 `Reddit人生讨论` 标签。它不写 `sourceURL`：微信的“阅读原文”必须在创建草稿前提供一个公开 URL，而新图片消息在这个时点没有自己的公开地址。

工作流在视频任务成功完成时触发，并保留一小时后的每日定时补偿。若定时任务先于视频选题提交，生成器会写入 `upstream-empty` manifest 后成功退出；视频完成事件检测到选题到达后会在同日重建。处理成功时，manifest 记录视频选题、两篇生成稿和每张卡片的 SHA-256；补偿 cron 会按 `video.json` 内容哈希复用已经完成的归档，不会因为中间产生了归档提交而重复渲染。只有选题内容变化或显式传入 `force` 才重新渲染，`force` 同时创建两篇替代微信草稿。

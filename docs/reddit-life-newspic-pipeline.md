# Reddit 图片消息管线

> **2026-09-26 起**这是每天唯一的公众号草稿（文章草稿已停发）。问题来自视频选卡从 SparkHub 素材池领取的那一题。草稿建好后，`confirm-sparkhub` job 运行 `scripts/confirm_reddit_life_newspic_sparkhub.ts`：从同步台账 `.astro-wechat/ledger.json` 取草稿 `mediaId`，按 `data/reddit-life-video/<date>/source.json` 找到这一题（池 id，本地兜底选出的用 Reddit postId），调用 SparkHub `confirm` 把它记为已用、公众号状态记为 `draft`（external_id 为 media_id），并把卡片的 Release 下载地址存进 assets，供各平台发布 agent 取用。这一步失败只告警；未确认的领取 24 小时后退回素材池。台账里没有这篇（草稿没建成）时跳过。

`publish-reddit-life-newspic.yml` 每日将已经归档的视频选题转换为一篇微信公众号图片消息草稿。它不请求 Reddit，也不调用模型；上游一次 AI 请求选出一个问题及其标题和回答，与当天视频共用。篇数由 `src/utils/redditLifePublishing.ts` 的 `REDDIT_LIFE_DAILY_NEWSPIC_COUNT` 控制，2026-09-24 起从 2 改为 1；此前的归档目录仍有 `02/`。

```text
data/reddit-life-video/<date>/video.json
  -> scripts/generate_reddit_life_newspic.ts
       -> data/reddit-life-newspic/<date>/video.json
       -> data/reddit-life-newspic/<date>/01/card-00.png ... card-10.png  （不提交，上传到 Release reddit-life-newspic-<date>）
       -> data/reddit-life-newspic/<date>/01/01.md
       -> data/reddit-life-newspic/<date>/run.json
```

每组第一张 `1080x1440` PNG 是问题卡；后续一到十张是依照选题排序的中文高赞回答卡。所有卡片均由 `video/` 工作区的 Remotion 静帧渲染器以 React/CSS 排版并归档为 PNG，第一张同时作为该微信图片消息的封面。静态卡片框架与批量渲染器可供后续图文 composition 复用。

视频选题的 v5 `video.json` 顶层携带选题 AI 根据最终问题和回答生成的中文 `title`，最多 20 个 Unicode 字符；`additionalIssues` 现为空数组，2026-09-24 之前的归档里存有第二组，读取时截掉。图片消息直接复用这个标题，不再额外调用模型；归档稿的 `description` 和图片消息纯文本 `content` 使用完整问题。微信的 `newspic` 草稿不接受普通图文的 `digest` 字段，因此必须把问题放在 Markdown 图片列表之前，才能作为草稿描述发送。

归档 Markdown 固定使用 `wechat.articleType: newspic`、独立的 `reddit-life-newspic-<date>-01` sync ID 和 `Reddit人生讨论` 标签。它不写 `sourceURL`：微信的“阅读原文”必须在创建草稿前提供一个公开 URL，而新图片消息在这个时点没有自己的公开地址。同步核心也只给图文（news）草稿发 `content_source_url`，图片消息一律发空串。

工作流在视频任务成功完成时触发，并保留一小时后的每日定时补偿。若定时任务先于视频选题提交，生成器会写入 `upstream-empty` manifest 后成功退出；视频完成事件检测到选题到达后会在同日重建。处理成功时，manifest 记录视频选题、生成稿和每张卡片的 SHA-256，以及 `release` 段（Release tag 与每张卡片的资产名）。卡片 PNG 不提交：workflow 在提交 `run.json` 之前把它们上传到 GitHub Release `reddit-life-newspic-<date>`，微信同步 job 与 `sync-wechat-draft.yml` 在建草稿前按 manifest 放回原位并核对哈希（`scripts/release_assets.ts`），图片消息的上传流程本身不变；补偿 cron 会按 `video.json` 内容哈希复用已经完成的归档，不会因为中间产生了归档提交而重复渲染。只有选题内容变化、`issueCount` 与当前篇数不一致或显式传入 `force` 才重新渲染，`force` 同时创建替代微信草稿。旧日期的 manifest 记的是 2 篇，重跑会按 1 篇重新渲染；sync ID `-01` 不变，普通重跑不会重复建草稿。

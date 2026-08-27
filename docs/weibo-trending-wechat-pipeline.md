# 微博热搜微信草稿管线

## 1. 目标

`weibo-trending` 发布站点文章后，独立管线把同一天的文章转换为一篇微信公众号图片消息草稿。转换过程不重新拉榜、不调用模型，只读取标题阶段已经生成的微信标题与话题总结，并把前 10 条各渲染成一张方形卡片；自动化只创建草稿，不执行群发。

站点文章是唯一内容输入：

```text
src/content/posts/zh-cn/wb-<YYYYMMDD>.md
  -> scripts/generate_weibo_trending_wechat.ts
       -> data/weibo-trending-wechat/<date>/01.md
       -> data/weibo-trending-wechat/<date>/upstream.md
       -> data/weibo-trending-wechat/<date>/card-00.png ... card-10.png
       -> data/weibo-trending-wechat/<date>/run.json
```

## 2. 内容规则

- 微信标题读取站点文章的 `wechat.title`，不再复用完整博客标题。该字段由站点文章标题阶段根据去重后的前 10 条生成，采用“核心事件 + 等十条热搜”结构且不超过 20 个 Unicode 字符；公众号管线不再调用模型。站点标签和微信 `eligibleTags` 匹配键仍是 `微博热搜`，文章文件名统一为 `wb-<YYYYMMDD>.md`，站点 URL 为 `/posts/wb-<YYYYMMDD>/`。
- 微信话题总结读取站点文章的 `description`。标题模型在同一次调用中根据前 10 条已有智搜摘要生成 60～120 个 Unicode 字符的综合总结，合并相关事件且不机械罗列标题；公众号管线只校验和传递，不再次概括。
- `parseWeiboTrendingArticle` 严格读取连续的 `## N.` 块，标题或摘要为空、编号断号都会终止转换。
- `card-00.png` 是总封面，显示栏目、日期与前 10 条标题；后 10 张各承载一条热搜总结，按上游排名排列。
- 话题卡包含排名、标题、摘要和页码。上游 AI 摘要已经限制在 250 个 Unicode 字符内，卡片直接使用完整摘要，不再二次截取或添加省略号。
- `wechat.articleType` 固定为 `newspic`。同一段话题总结既写入归档稿的 `description`，也作为图片列表前唯一的纯文本段落；后者会由 astro-wechat 发送为微信图片消息的 `content`。
- **不写 `wechat.sourceURL`**：它会变成草稿的「阅读原文」。同步身份固定为 `weibo-trending-<date>`，与读者是否看到站外入口无关。
- 图片消息的第一张图同时是微信封面；`ogImage` 因此也指向 `card-00.png`，不会再生成独立横版封面或二维码。

卡片由 `scripts/weibo_trending_wechat_cards.ts` 使用 satori 渲染为 1080×1080 PNG，沿用站点微博主题色、`platformCard` 骨架、手绘笔圈品牌和字体子集加载器。方图白色面板固定为画布的 90%×90%，使四边微博红背景均为 54px；封面列表使用新增空间放大字号。话题标题占固定高度，多行标题与编号垂直居中；摘要顶部对齐，页码拥有独立底部区域，字号按可用面积与文本长度动态计算。图片是消息正文，任何一张渲染失败都会终止归档，不回落到默认封面。

## 3. 容量收口

图片消息每天确定性地取一张 Top 10 总封面和 10 张话题卡，不再执行普通图文 HTML 长度探测。astro-wechat 在 dry-run 时还会校验最终标题不超过 20 个 Unicode 字符，并校验图片数量、图片资源和纯文本话题总结长度；所有校验都发生在永久素材上传之前。

## 4. 归档与幂等

生成器要求 `--date`、`--upstream-sha` 和 `--upstream-workflow-run`，并校验当前 `HEAD` 等于父任务提交。v2 `run.json` 记录北京时间归档日、父提交及 workflow run、上游文章与快照路径、稿件路径、全部卡片路径与 SHA-256，以及收录数。

同一天已有合法 manifest 且父提交不变时直接复用，不重新转换正文。复用前会校验已归档文件仍与 manifest 的 SHA-256 一致。读取器继续接受 v1 普通图文历史归档，普通重跑不会改写它；只有显式传入不同的父提交时才按当前规则重建为 v2 图片消息，并清理旧 manifest 记录但已不再引用的封面或卡片。manifest 无法解析或归档文件不匹配时直接失败，防止把损坏状态当作空归档。上游文章不存在时写入 `upstream-empty` manifest，不创建草稿，也不把空结果当作错误。

`card-*.png`、`01.md`、`upstream.md` 和 `run.json` 都会提交；同步 job checkout 归档提交后即可解析全部图片，不需要恢复运行时资源。

## 5. Workflow

`.github/workflows/publish-weibo-trending.yml` 在站点文章发布成功后调用 `.github/workflows/weibo-trending-wechat.yml`，传入父提交、父 workflow run 和可选归档日。

子 workflow 分为两个 job：

1. checkout 父提交，生成并提交 `data/weibo-trending-wechat/<date>/`，上传运行 artifact。
2. checkout 新归档提交，执行 astro-wechat dry-run，只接受 `planned` 或 `already-synchronized`，随后创建草稿。

所有微信同步 job 使用 `wechat-sync-${{ github.repository }}` 并发组串行执行。正式发布即使部分失败，也会先提交 `.astro-wechat/ledger.json`，再让 job 失败，避免重跑重复创建已成功的草稿。

专用 workflow 同时提供 `workflow_dispatch` 补跑入口。对已有归档补跑时应传原始归档日期、包含上游文章的提交 SHA 和对应 workflow run；它会复用 manifest。`sync-wechat-draft.yml` 的路径白名单也接受该目录；稿件及卡片都已提交，本地直接调用 astro-wechat 前不需要恢复任何资源。

图片消息的所有卡片会作为永久图片素材上传。微信当前的草稿读取接口看不到 `newspic`，因此创建请求结果未知时系统会保留 pending 台账并停止自动重试；操作人员需要先到公众号草稿箱确认，不能依靠远端自动对账。

## 6. 本地验证

生成与预览需要让当前 `HEAD` 与 `--upstream-sha` 完全一致：

```bash
node --import tsx scripts/generate_weibo_trending_wechat.ts \
  --date 2026-08-19 \
  --upstream-sha "$(git rev-parse HEAD)" \
  --upstream-workflow-run 123456789 \
  --artifacts-dir weibo-trending-wechat-artifacts

pnpm exec astro-wechat preview data/weibo-trending-wechat/2026-08-19/01.md
```

转换逻辑的回归检查运行：

```bash
pnpm run test:blog
pnpm run typecheck
```

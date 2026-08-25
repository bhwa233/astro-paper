# 微博热搜微信草稿管线

## 1. 目标

`weibo-trending` 发布站点文章后，独立管线把同一天的文章转换为一篇微信公众号草稿。转换过程不重新拉榜、不调用模型、不改写摘要，只保留前 30 条并移除微博话题链接；自动化只创建草稿，不执行群发。

站点文章是唯一内容输入：

```text
src/content/posts/zh-cn/wb-<YYYYMMDD>.md
  -> scripts/generate_weibo_trending_wechat.ts
       -> data/weibo-trending-wechat/<date>/01.md
       -> data/weibo-trending-wechat/<date>/upstream.md
       -> data/weibo-trending-wechat/<date>/cover.png
       -> data/weibo-trending-wechat/<date>/run.json
```

## 2. 内容规则

- 标题完整复用站点文章 frontmatter，格式固定为 `<date> 热搜 ｜ <AI 标题后半句>`。后半句由站点文章生成阶段基于最终成功收录的话题统一生成，公众号管线不再调用模型。站点标签和微信 `eligibleTags` 匹配键仍是 `微博热搜`，文章文件名统一为 `wb-<YYYYMMDD>.md`，站点 URL 为 `/posts/wb-<YYYYMMDD>/`。
- `parseWeiboTrendingArticle` 严格读取连续的 `## N.` 块，标题或摘要为空、编号断号都会终止转换。
- 正文按上游顺序保留前 30 条，只输出二级标题和摘要段。`- **话题**` 行不进入微信稿，避免超长 URL 被 astro-wechat 转成尾注。
- 微信摘要默认拼接前三条标题，超过 120 个 Unicode 码点时依次退到两条、一条，仍超长才按码点截断。
- **不写 `wechat.sourceURL`**：它会变成草稿的 `content_source_url`，也就是文末的「阅读原文」，和已经撤掉的二维码卡片是同一类站外引流。没有它时 astro-wechat 的同步身份退回稿子的仓库相对路径，这条线一天只出一篇，路径天然唯一。代价是上一次同步中断留下 `pending` 记录时无法自动对账，astro-wechat 会抛 `reconcile-impossible` 要求人工确认。
- 正文没有页脚，也没有任何指向站外的东西：二维码卡片已撤掉，理由是带导流入口会影响微信的推荐算法。

封面由 `scripts/weibo_trending_wechat_cover.ts` 使用 satori 渲染为 1175×500 PNG，列出前五条标题，页脚显示品牌与归档日期。条目字号由 `scripts/wechat_cover_layout.ts` 按「最长标题不折行」与「n 行不超出条目区」两个约束算出，与 Reddit 封面共用同一套尺寸。字体下载或渲染失败只会回落到 `astro-wechat.config.mjs` 的 `defaultCover`，不会中断归档。

## 3. 长度收口

生成器在稿件最终目录写入临时探针，并通过 astro-wechat 的 `openProject` 与 `prepareArticle` 检查真实 HTML 长度。完整 30 条超限时，二分查找可通过的最大前缀，只删除热度最低的尾部条目；frontmatter 不参与截断。实际收录数与删除数写入 `run.json`，发生删除时同时输出 WARN。

## 4. 归档与幂等

生成器要求 `--date`、`--upstream-sha` 和 `--upstream-workflow-run`，并校验当前 `HEAD` 等于父任务提交。`run.json` 记录北京时间归档日、父提交及 workflow run、上游文章与快照路径、稿件/封面路径、SHA-256、收录数和截断数。

同一天已有合法 manifest 时直接复用，不重新转换正文。复用前会校验已归档文件仍与 manifest 的 SHA-256 一致，。manifest 无法解析或归档文件不匹配时直接失败，防止把损坏状态当作空归档。上游文章不存在时写入 `upstream-empty` manifest，不创建草稿，也不把空结果当作错误。

`cover.png`、`01.md`、`upstream.md` 和 `run.json` 会提交；稿子不再引用任何运行时生成的资源。

## 5. Workflow

`.github/workflows/publish-weibo-trending.yml` 在站点文章发布成功后调用 `.github/workflows/weibo-trending-wechat.yml`，传入父提交、父 workflow run 和可选归档日。

子 workflow 分为两个 job：

1. checkout 父提交，生成并提交 `data/weibo-trending-wechat/<date>/`，上传运行 artifact。
2. checkout 新归档提交，执行 astro-wechat dry-run，只接受 `planned` 或 `already-synchronized`，随后创建草稿。

所有微信同步 job 使用 `wechat-sync-${{ github.repository }}` 并发组串行执行。正式发布即使部分失败，也会先提交 `.astro-wechat/ledger.json`，再让 job 失败，避免重跑重复创建已成功的草稿。

专用 workflow 同时提供 `workflow_dispatch` 补跑入口。对已有归档补跑时应传原始归档日期、包含上游文章的提交 SHA 和对应 workflow run；它会复用 manifest。`sync-wechat-draft.yml` 的路径白名单也接受该目录；稿件及其封面都已提交，本地直接调用 astro-wechat 前不再需要恢复任何资源。

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

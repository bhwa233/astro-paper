# 微博热搜微信草稿管线

## 1. 目标

`weibo-trending` 发布站点文章后，独立管线把同一天的文章转换为一篇微信公众号草稿。转换过程不重新拉榜、不调用模型、不改写摘要，只保留前 30 条并移除微博话题链接；自动化只创建草稿，不执行群发。

站点文章是唯一内容输入：

```text
src/content/posts/zh-cn/微博热搜-<date>.md
  -> scripts/generate_weibo_trending_wechat.ts
       -> data/weibo-trending-wechat/<date>/01.md
       -> data/weibo-trending-wechat/<date>/upstream.md
       -> data/weibo-trending-wechat/<date>/cover.png
       -> data/weibo-trending-wechat/<date>/run.json
       -> data/weibo-trending-wechat/<date>/qr.png（仅运行时）
```

## 2. 内容规则

- 标题复用 `taskTitle("weibo-trending", date)`，格式为 `每日微博热搜总结｜<date>`。站点标签和微信 `eligibleTags` 匹配键仍是 `微博热搜`，文件名及站点 slug 不变。
- `parseWeiboTrendingArticle` 严格读取连续的 `## N.` 块，标题或摘要为空、编号断号都会终止转换。
- 正文按上游顺序保留前 30 条，只输出二级标题和摘要段。`- **话题**` 行不进入微信稿，避免超长 URL 被 astro-wechat 转成尾注。
- 微信摘要默认拼接前三条标题，超过 120 个 Unicode 码点时依次退到两条、一条，仍超长才按码点截断。
- `wechat.sourceURL` 指向同一天的站点文章，既是「阅读原文」落点，也是 astro-wechat 的同步身份。
- 页脚不放可点击外链，只显示固定博客地址和 `qr.png`。二维码内容固定为 `https://blog.bhwa233.com/`。

封面由 `scripts/weibo_trending_wechat_cover.ts` 使用 satori 渲染为 1175×500 PNG，列出前三条标题，页脚显示品牌与归档日期。字体下载或渲染失败只会回落到 `astro-wechat.config.mjs` 的 `defaultCover`，不会中断归档。

## 3. 长度收口

生成器在稿件最终目录写入临时探针，并通过 astro-wechat 的 `openProject` 与 `prepareArticle` 检查真实 HTML 长度。完整 30 条超限时，二分查找可通过的最大前缀，只删除热度最低的尾部条目；frontmatter 和二维码页脚不参与截断。实际收录数与删除数写入 `run.json`，发生删除时同时输出 WARN。

## 4. 归档与幂等

生成器要求 `--date`、`--upstream-sha` 和 `--upstream-workflow-run`，并校验当前 `HEAD` 等于父任务提交。`run.json` 记录北京时间归档日、父提交及 workflow run、上游文章与快照路径、稿件/封面路径、SHA-256、收录数和截断数。

同一天已有合法 manifest 时直接复用，不重新转换正文。复用前会校验已归档文件仍与 manifest 的 SHA-256 一致，并重新生成稿件旁的 `qr.png`。manifest 无法解析或归档文件不匹配时直接失败，防止把损坏状态当作空归档。上游文章不存在时写入 `upstream-empty` manifest，不创建草稿，也不把空结果当作错误。

`cover.png`、`01.md`、`upstream.md` 和 `run.json` 会提交；恒定的 `qr.png` 被 `.gitignore` 排除，由每次需要同步的运行恢复并随 job artifact 交给发布 job。

## 5. Workflow

`.github/workflows/publish-weibo-trending.yml` 在站点文章发布成功后调用 `.github/workflows/weibo-trending-wechat.yml`，传入父提交、父 workflow run 和可选归档日。

子 workflow 分为两个 job：

1. checkout 父提交，生成并提交 `data/weibo-trending-wechat/<date>/`，上传包含 `qr.png` 的运行 artifact。
2. checkout 新归档提交，下载 artifact 恢复二维码，执行 astro-wechat dry-run，只接受 `planned` 或 `already-synchronized`，随后创建草稿。

所有微信同步 job 使用 `wechat-sync-${{ github.repository }}` 并发组串行执行。正式发布即使部分失败，也会先提交 `.astro-wechat/ledger.json`，再让 job 失败，避免重跑重复创建已成功的草稿。

专用 workflow 同时提供 `workflow_dispatch` 补跑入口。对已有归档补跑时应传原始归档日期、包含上游文章的提交 SHA 和对应 workflow run；它会复用 manifest 并恢复二维码。`sync-wechat-draft.yml` 的路径白名单也接受该目录，但本地直接调用 astro-wechat 前必须先运行生成器恢复未提交的二维码。

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

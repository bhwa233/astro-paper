# Reddit 人生精选微信草稿技术方案

状态：已实现（自动草稿链路可靠性修订）
最后更新：2026-08-18

## 1. 背景

`reddit-top20` 每天产出「人生与社会」栏目文章，其中每帖的正文已经是逐条故事的有序列表（一条回答一项，无小标题、无引用块）。微信侧要的正是这个形态，因此这条管线不再自己组织内容，只把上游排名第一那帖转成一篇微信草稿。

早期方案曾经深抓单帖评论树、逐讨论串调用模型、再综合成四段式文章（讨论背景 / 主流观点 / 回复补充 / 分歧边界）。上游正文改成故事集之后那套结构失去意义，已整体删除：**这条管线现在没有任何模型调用，也不请求 Reddit 深抓来源服务。**

## 2. 目标与非目标

目标：

- 每个归档日最多归档一篇微信稿，并自动创建到微信公众号草稿箱
- 正文故事以第一帖为唯一来源；除编号规范化、微信页脚和超限收口外不重排、不改写
- 跨天不重复推荐同一个 Reddit 帖子
- 渲染结果必须落在微信正文长度上限内
- 同一天重跑稳定复用 manifest，同时恢复同步所需的本地资源
- 归档可审计：保留上游文章快照、父任务提交与父 workflow run

非目标：

- 不重新选帖，不请求 Reddit 补充数据
- 不进入 Astro 内容集合（`data/` 下的文件不会生成博客页面）
- 不自动群发或发布公众号文章；这里只创建微信草稿

## 3. 数据流

```text
reddit-top20 (publish)
  └─ src/content/posts/zh-cn/reddit-<date>-life.md   ← 唯一内容输入
       └─ scripts/generate_reddit_life_wechat.ts     ← 纯规则转换，无 AI
            ├─ data/reddit-life-wechat/<date>/01-<postId>.md
            ├─ data/reddit-life-wechat/<date>/upstream-life.md
            ├─ data/reddit-life-wechat/<date>/run.json
            ├─ data/reddit-life-wechat/<date>/cover.png
            ├─ data/reddit-life-wechat/<date>/qr.png  ← 仅 job artifact，不提交
            └─ data/reddit-life-wechat/recommended.json
                 └─ astro-wechat dry-run
                      └─ 创建微信公众号草稿
                           └─ 提交 .astro-wechat/ledger.json
```

workflow `reddit-life-wechat.yml` 由 `publish-reddit-life.yml` 在 publish 成功后调用。父任务传入 `upstream_sha`、`upstream_workflow_run` 与归档日期；子 workflow checkout 该提交，生成器再验证当前 `HEAD`，从而保证文章、审计字段和父任务交接一致。

## 4. 选帖与内容转换

- **选帖**：`parseRedditLifeCandidates` 解析上游文章的 `## N.` 块，取 rank 1。subreddit 必须属于 life 栏目，否则报错。
- **正文**：事实 bullet 之后的全部故事作为输入。编号统一为 `1\.` 形式；只有撞微信正文上限时才从末尾删除故事。
- **描述**：取上游文章 frontmatter 的 `description`——它就是第一帖的一句话描述（`redditTop20Description` 取 `items[0].description`）。
- **标题**：`<上游中文标题>｜Reddit 热帖精选 #<期号>`。微信标题上限 64 个 Unicode 码点；超长时只截帖子标题并加省略号，品牌与期号始终保留。
- **页脚**：正文末尾附博客首页二维码卡片与 `https://blog.bhwa233.com/`。
- **frontmatter**：`tags: [Reddit人生讨论]`（在 `astro-wechat.config.mjs` 的 `eligibleTags` 内）、`wechat.enabled: true`、`wechat.sourceURL` 指向原帖，另附 `redditPostId` 与 `subreddit` 便于追溯。

## 5. 长度收口

微信正文上限是 20000 字符的 HTML，而一帖的故事条数不可控。`fitWechatContentLimit` 直接用 astro-wechat 的渲染器判定（`openProject` + `prepareArticle`，无网络、只写临时探针）：

1. 整篇能渲染就原样归档
2. 撞 `content-too-long` / `content-too-large` 时，二分找出最少需要删除的尾部故事条数
3. 删除只发生在正文末尾。编号从 1 递增，从尾部删不会留下断号；frontmatter 与页脚永不参与截断
4. 删掉的条数写进 `WARN` 日志，不静默截断

## 6. 存档与重跑模型

```text
data/reddit-life-wechat/
├── recommended.json
└── 2026-08-17/
    ├── run.json
    ├── upstream-life.md
    ├── cover.png          # 提交
    ├── qr.png             # 不提交，由每次需要同步的运行恢复
    └── 01-<reddit-post-id>.md
```

`cover.png` 是这一篇的专属封面，由 `reddit_life_wechat_cover.ts` 用 satori 渲染后随稿子提交；缺失时 `astro-wechat` 回落到配置里的 `defaultCover`，因此渲染失败只降级不中断。

`qr.png` 指向博客首页，内容恒定，所以按 `.gitignore` 排除，避免仓库里堆一份天天重复的二进制。每次需要同步一篇 `generated` 稿件时，生成器都必须保证稿件旁存在 `qr.png`，包括复用已有 manifest 的同日重跑。`generate-and-archive` 将它上传为本次 run 的 artifact，`sync-wechat` 下载同一份字节。没有待同步稿件（`upstream-empty` 或 `duplicate`）时不上传、不下载 QR，也不启动微信发布命令。

`run.json` 记录 manifest version、归档日期与时区、父任务提交 SHA / workflow run / 文章路径、上游快照路径、运行状态（`processed` 或 `upstream-empty`），以及那一帖的事实字段、处理状态（`generated` 或 `duplicate`）、期号、产物路径和内容 hash。

同一日期存在合法 manifest 时，重跑复用它而不重新转换正文；但会恢复 `generated` 稿件需要的 `qr.png`。manifest 解析失败时抛错，不回退成空快照。上游文章不存在时写入 `status: upstream-empty` 的 manifest，不产出草稿，也不把空结果当成错误。

`recommended.json` 用仓库通用的 `recommendation_ledger.ts`，身份是规范化的 Reddit post ID，不用标题或日期。**写入必须传该归档日 manifest 中全部 `generated` 帖子，而不是增量**——`appendRecommendations` 按 `postPath` 全量覆盖，只传增量会把上一次的记录静默删掉，导致该帖在后续日期重新变成「未推荐」并被重复出稿。

## 7. 微信同步

草稿放在 `data/reddit-life-wechat/` 下，不进内容集合，所以博客站点不会出现重复内容。自动 workflow 会先运行 astro-wechat dry-run，只接受 `planned` 或已同步跳过，然后串行创建微信草稿；部分成功时先提交 `.astro-wechat/ledger.json`，再让 job 以失败结束，避免重跑重复创建已经成功的草稿。

`sync-wechat-draft.yml` 仍保留为人工补同步入口，路径校验同时接受 `src/content/posts/*.md` 与 `data/reddit-life-wechat/*.md`。由于 `qr.png` 不提交，绕开自动 workflow 前必须在目标稿件旁恢复二维码：

```bash
node --import tsx scripts/generate_reddit_life_wechat.ts \
  --date <date> --upstream-sha <sha> --upstream-workflow-run <run-id>
```

本地预览：

```bash
pnpm exec astro-wechat preview data/reddit-life-wechat/<date>/01-<postId>.md
```

## 8. 运行方式

```bash
node --import tsx scripts/generate_reddit_life_wechat.ts \
  --date 2026-08-17 \
  --upstream-sha <sha> \
  --upstream-workflow-run <run-id> \
  --artifacts-dir reddit-life-wechat-artifacts
```

`--upstream-sha` 与 `--upstream-workflow-run` 必填。生成器要求当前仓库 `HEAD` 等于 `upstream_sha`；这条管线只读已提交的父任务交接结果，不接受任意工作区内容冒充该提交。

## 9. 启用状态

`publish-reddit-life.yml` 已在 Reddit life 发布成功后调用该 workflow。自动链路只创建公众号草稿，不执行群发；也可通过 `reddit-life-wechat.yml` 的 `workflow_dispatch` 对指定父任务提交补跑。

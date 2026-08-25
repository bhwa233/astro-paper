# Reddit 人生精选微信草稿技术方案

状态：已实现（一天三卷，每卷五帖 + 每帖条数自适应）
最后更新：2026-08-25

## 1. 背景

`reddit-top20` 每天产出「人生与社会」栏目文章，其中每帖的正文已经是逐条故事的有序列表（一条回答一项，无小标题、无引用块）。微信侧要的正是这个形态，因此这条管线不再自己组织内容，只把上游前 15 帖转成上中下三篇微信草稿。

早期方案曾经深抓单帖评论树、逐讨论串调用模型、再综合成四段式文章（讨论背景 / 主流观点 / 回复补充 / 分歧边界）。上游正文改成故事集之后那套结构失去意义，已整体删除，这条管线不再请求 Reddit 深抓来源服务。

正文是纯规则搬运，整条管线不调用模型：每卷标题取本卷第一帖，第一卷的摘要取上游 frontmatter 的 description。曾经有一次模型调用把多帖话题串成一个标题，读者一眼看不出在讲什么，因此改回主打第一帖。

稿子里没有任何站外引流：不写 `wechat.sourceURL`（也就没有「阅读原文」），正文末尾也没有二维码卡片和「今天还有这些热帖」清单。撤掉它们是因为带导流入口会影响微信的推荐算法；读者要看的内容因此改为直接多推两卷，而不是引到站外。

## 2. 目标与非目标

目标：

- 每个归档日最多归档三篇微信稿（上 / 中 / 下），并自动创建到微信公众号草稿箱
- 正文故事以上游前 15 帖为唯一来源；除编号规范化、每帖条数截断和超限收口外不重排、不改写
- 渲染结果必须落在微信正文长度上限内
- 同一天重跑稳定复用 manifest
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
            ├─ data/reddit-life-wechat/<date>/01-<postId>.md  ← 上卷（第 1-5 帖）
            ├─ data/reddit-life-wechat/<date>/06-<postId>.md  ← 中卷（第 6-10 帖）
            ├─ data/reddit-life-wechat/<date>/11-<postId>.md  ← 下卷（第 11-15 帖）
            ├─ data/reddit-life-wechat/<date>/upstream-life.md
            ├─ data/reddit-life-wechat/<date>/run.json
            ├─ data/reddit-life-wechat/<date>/cover-1.png … cover-3.png
                 └─ astro-wechat dry-run
                      └─ 创建微信公众号草稿
                           └─ 提交 .astro-wechat/ledger.json
```

workflow `reddit-life-wechat.yml` 由 `publish-reddit-life.yml` 在 publish 成功后调用。父任务传入 `upstream_sha`、`upstream_workflow_run` 与归档日期；子 workflow checkout 该提交，生成器再验证当前 `HEAD`，从而保证文章、审计字段和父任务交接一致。

## 4. 选帖与内容转换

- **选帖与分卷**：`parseRedditLifeCandidates` 解析上游文章的 `## N.` 块，取前 15 帖，编排层按顺序切成上（1-5）、中（6-10）、下（11-15）三卷，每卷一篇稿子。subreddit 必须属于 life 栏目，否则报错。上游不足 15 帖时后面的卷为空，少推一卷而不是硬凑。
- **截断**：每帖最多保留前 30 条回答，实际条数由第 5 节的长度收口按渲染结果定，同一卷内五帖统一同一个值，三卷各自二分。撤掉页脚后每篇省出的 HTML 预算会让收敛值比过去更高。实测 2026-08-21 归档收敛到每帖 24 条、2026-08-20 收敛到 19 条，故事总量不足时（2026-08-19）不触发截断。
- **分隔**：每个问题使用 Markdown 二级标题，与其他微信日报的条目层级保持一致。
- **正文**：事实 bullet 之后的全部故事作为输入。编号统一为 `1\.` 形式；只有撞微信正文上限时才从末尾删除故事。
- **标题与摘要**：标题取本卷第一帖标题，形如 `<本卷第一帖标题>｜Reddit 热帖精选 #期号 上`，品牌、期号与卷次由代码拼接，因此 64 字上限在代码里可控。摘要只有上卷能沿用上游 frontmatter 的 `description`（它本来就是第 1 帖的一句话描述）；中下两卷上游没有对应句子，退而列出本卷收录的五个标题。
- **期号与卷次**：`#N` 由 `nextRedditLifeIssue` 扫描已归档 manifest 取最大值加一，一天只取一次号，三卷共用；写进 manifest 后永不重算，重跑复用同一个号。卷次 `上 / 中 / 下` 同样写进 manifest。微信标题上限 64 个 Unicode 码点，超长时只截话题串并加省略号，品牌与期号始终保留。
- **frontmatter**：`tags: [Reddit人生讨论]`（在 `astro-wechat.config.mjs` 的 `eligibleTags` 内）、`wechat.enabled: true`，另附 `redditPostId` 与 `subreddit` 记本卷第一帖，便于追溯。**不写 `wechat.sourceURL`**：它既是「阅读原文」的落点，也是 astro-wechat 的同步身份，而三卷共用同一篇上游文章的地址会撞车，后两卷会被判 `already-synchronized` 静默跳过。没有它时身份退回稿子的仓库相对路径，三卷天然唯一。代价是上一次同步中断留下 `pending` 记录时无法自动对账，astro-wechat 会抛 `reconcile-impossible` 要求人工确认。

## 5. 长度收口

微信正文上限是 20000 字符的 HTML，而一帖的故事条数不可控。`fitWechatContentLimit` 直接用 astro-wechat 的渲染器判定（`openProject` + `prepareArticle`，无网络、只写临时探针），分两级收口：

1. 每帖 30 条能渲染就原样归档
2. 撞 `content-too-long` / `content-too-large` 时，二分「每帖统一保留几条」，取仍能渲染通过的最大值。删减均摊到本卷五帖，不会把靠后的帖子整个啃掉；实测约 5 次探针
3. 每帖只剩一条仍超限（单条故事极长）才退到尾删：`dropTrailingStories` 二分最少的删除条数。编号从 1 递增，从尾部删不会留下断号；frontmatter 永不参与截断。稿子不再有页脚，正文末尾就是可删区的末尾，因此也不再需要哨兵把尾部圈起来保护
4. 收敛到的每帖条数与删掉的条数都写进 `WARN` 日志，不静默截断

## 6. 存档与重跑模型

```text
data/reddit-life-wechat/
└── 2026-08-17/
    ├── run.json
    ├── upstream-life.md
    ├── cover-1.png        # 提交，三卷各一张
    ├── cover-2.png
    ├── cover-3.png
    ├── 01-<reddit-post-id>.md   # 上卷
    ├── 06-<reddit-post-id>.md   # 中卷
    └── 11-<reddit-post-id>.md   # 下卷
```

`cover-N.png` 是每一卷的专属封面，由 `reddit_life_wechat_cover.ts` 用 satori 渲染后随稿子提交，逐条列出本卷五帖标题加品牌、期号与卷次；文件名用序号而不是「上中下」，因为产物要经 shell 传给 CLI，中文文件名在 WSL 与 Git Bash 之间会被拆坏；条目字号由 `wechat_cover_layout.ts` 按「最长标题不折行」与「n 行不超出条目区」两个约束算出，与微博封面共用同一套尺寸。缺失时 `astro-wechat` 回落到配置里的 `defaultCover`，因此渲染失败只降级不中断。

`run.json` 记录 manifest version、归档日期与时区、父任务提交 SHA / workflow run / 文章路径、上游快照路径、运行状态（`processed` 或 `upstream-empty`），以及每一帖的事实字段、处理状态、期号、卷次、产物路径和内容 hash。同一卷的五帖各占一条 `posts` 记录但共享同一个 `path`——一卷只有一篇稿子，发布前按 `path` 去重，去重后正好是三条路径。

同一日期存在合法 manifest 时，重跑复用它而不重新转换正文。manifest 解析失败时抛错，不回退成空快照。上游文章不存在时写入 `status: upstream-empty` 的 manifest，不产出草稿，也不把空结果当成错误。


## 7. 微信同步

草稿放在 `data/reddit-life-wechat/` 下，不进内容集合，所以博客站点不会出现重复内容。自动 workflow 会先运行 astro-wechat dry-run，只接受 `planned` 或已同步跳过，然后串行创建三篇微信草稿；部分成功时先提交 `.astro-wechat/ledger.json`，再让 job 以失败结束，避免重跑重复创建已经成功的草稿。

`sync-wechat-draft.yml` 仍保留为人工补同步入口，路径校验同时接受 `src/content/posts/*.md` 与 `data/reddit-life-wechat/*.md`。稿子及其封面都已提交，本地直接调用 astro-wechat 前不再需要恢复任何资源；要重新生成整天的三卷可以跑：

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

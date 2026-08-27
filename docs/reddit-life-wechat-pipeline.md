# Reddit 人生精选微信草稿技术方案

状态：已实现（全文 AI 选题 + 固定问答清单开篇 + 一天最多两篇，每篇五帖 + 每帖条数自适应）
最后更新：2026-08-27

## 1. 背景

`reddit-top20` 每天从 `r/AskReddit` 与 `r/askscience` 产出「问答精选」栏目文章，其中每帖正文已经是逐条回答的有序列表（一条回答一项，无小标题、无引用块）。微信侧先对文章里的全部帖子做一次 AI 过滤排序，剔除地区依赖、短期失效或过于小众的内容，再把最多 10 帖转成两篇微信草稿。`r/confessions`、`r/changemyview` 与 `r/tifu` 已拆到仅发布博客的「人生讨论」栏目，不是本管线输入。

早期方案曾经深抓单帖评论树、逐讨论串调用模型、再综合成四段式文章（讨论背景 / 主流观点 / 回复补充 / 分歧边界）。上游正文改成故事集之后那套结构失去意义，已整体删除，这条管线不再请求 Reddit 深抓来源服务。

模型只做微信选题，不改写故事正文、标题、摘要或开篇。每篇标题取选后第一帖，摘要列出本篇收录的标题。曾经有一次模型调用把多帖话题串成一个标题，读者一眼看不出在讲什么，因此成稿仍坚持主打第一帖。

稿子里没有任何站外引流：不写 `wechat.sourceURL`（也就没有「阅读原文」），正文末尾也没有二维码卡片和「今天还有这些热帖」清单。撤掉它们是因为带导流入口会影响微信的推荐算法，入选内容直接进入草稿正文。

## 2. 目标与非目标

目标：

- 每个归档日最多归档两篇微信稿，并自动创建到微信公众号草稿箱
- 候选覆盖上游文章全部帖子，AI 最多选 10 帖并按长尾价值和普遍共鸣排序
- 正文只搬运入选帖的已有回答；除编号规范化、每帖条数截断和超限收口外不改写
- 渲染结果必须落在微信正文长度上限内
- 同一天重跑稳定复用 manifest
- 归档可审计：保留上游文章快照、父任务提交与父 workflow run

非目标：

- 不请求 Reddit 补充数据，不让模型改写或补造上游内容
- 不进入 Astro 内容集合（`data/` 下的文件不会生成博客页面）
- 不自动群发或发布公众号文章；这里只创建微信草稿

## 3. 数据流

```text
reddit-top20 (publish)
  └─ src/content/posts/zh-cn/reddit-<date>-life.md   ← 唯一内容输入
       └─ AI 过滤地区依赖内容并排序
            └─ scripts/generate_reddit_life_wechat.ts     ← 按选后顺序做规则转换
            ├─ data/reddit-life-wechat/<date>/01-<postId>.md  ← 第 1-5 帖
            ├─ data/reddit-life-wechat/<date>/06-<postId>.md  ← 第 6-10 帖
            ├─ data/reddit-life-wechat/<date>/upstream-life.md
            ├─ data/reddit-life-wechat/<date>/run.json
            ├─ data/reddit-life-wechat/<date>/cover-1.png … cover-2.png
                 └─ astro-wechat dry-run
                      └─ 创建微信公众号草稿
                           └─ 提交 .astro-wechat/ledger.json
```

workflow `reddit-life-wechat.yml` 由 `publish-reddit-life.yml` 在 publish 成功后调用。父任务传入 `upstream_sha`、`upstream_workflow_run` 与归档日期；子 workflow checkout 该提交，生成器再验证当前 `HEAD`，从而保证文章、审计字段和父任务交接一致。

## 4. 选帖与内容转换

- **候选证据**：`parseRedditLifeCandidates` 解析上游文章的全部 `## N.` 块。每个候选向模型提供标题、subreddit、热度及前三条代表回答，每条回答最多 320 字；正文全量不进入选题提示词。
- **过滤与排序**：一次模型调用同时比较全部候选。地区依赖和短期失效是硬过滤，长尾性、跨地区共鸣、具体故事或解释价值决定入选顺序；最多保留 10 帖。`r/askscience` 不因缺少个人故事被自动降级，清楚解释普遍科学问题同样算高价值。模型必须把每个候选恰好归入 `selected` 或 `rejected`，重复、遗漏、越界、非法分数和非法分类都会触发 JSON 重试。重试耗尽时整次生成失败，不回退到未过滤的原榜。
- **开篇**：代码根据本卷实际收录标题生成固定清单：先写「本期 Reddit 问答包括：」，再按正文顺序列出全部问题。开篇不调用模型，也不会出现清单与正文不一致。
- **分卷**：编排层按 AI 顺序每五帖分成一篇稿子。合格不足 10 帖时少推一篇而不是用低质量帖子补齐。
- **截断**：每帖最多保留前 30 条回答，实际条数由第 5 节的长度收口按渲染结果定，同一篇内五帖统一同一个值，两篇各自二分。撤掉页脚后每篇省出的 HTML 预算会让收敛值比过去更高。实测 2026-08-21 归档收敛到每帖 24 条、2026-08-20 收敛到 19 条，故事总量不足时（2026-08-19）不触发截断。
- **分隔**：每个问题使用 Markdown 二级标题，与其他微信日报的条目层级保持一致。
- **正文**：事实 bullet 之后的全部回答作为输入。编号统一为 `1\.` 形式；只有撞微信正文上限时才从末尾删除回答。
- **封面**：每卷仍生成专属封面并作为微信列表缩略图，但 `wechat.showCoverInBody: false` 阻止渲染器把它重复插到正文开头；正文从固定问答清单开始。
- **标题与摘要**：标题取每篇选后第一帖标题，形如 `<本篇第一帖标题>｜Reddit 问答精选`；期号与卷次均不显示。原文章摘要对应原榜第一帖，重排后不再可靠，因此两篇摘要都列出各自收录的标题。
- **内部身份**：两篇稿子在 manifest 中记录内部卷序号 `v1` 至 `v2`；微信同步 ID 使用归档日期与卷序号，因此不依赖标题，也不会因标题重复跳过后续稿子。
- **frontmatter**：`tags: [Reddit人生讨论]`（在 `astro-wechat.config.mjs` 的 `eligibleTags` 内）、`wechat.enabled: true`，另附 `redditPostId` 与 `subreddit` 记本篇第一帖，便于追溯。**不写 `wechat.sourceURL`**：它既是「阅读原文」的落点，也是 astro-wechat 的同步身份，而两篇共用同一篇上游文章的地址会撞车，后一篇会被判 `already-synchronized` 静默跳过。没有它时身份退回稿子的仓库相对路径，两篇天然唯一。代价是上一次同步中断留下 `pending` 记录时无法自动对账，astro-wechat 会抛 `reconcile-impossible` 要求人工确认。

## 5. 长度收口

微信正文上限是 20000 字符的 HTML，而一帖的故事条数不可控。`fitWechatContentLimit` 直接用 astro-wechat 的渲染器判定（`openProject` + `prepareArticle`，无网络、只写临时探针），分两级收口：

1. 每帖 30 条能渲染就原样归档
2. 撞 `content-too-long` / `content-too-large` 时，二分「每帖统一保留几条」，取仍能渲染通过的最大值。删减均摊到本卷五帖，不会把靠后的帖子整个啃掉；实测约 5 次探针
3. 每帖只剩一条仍超限（单条故事极长）才退到尾删：`dropTrailingStories` 二分最少的删除条数。编号从 1 递增，从尾部删不会留下断号；frontmatter 与开篇问答清单永不参与截断。稿子不再有页脚，正文末尾就是可删区的末尾，因此也不再需要哨兵把尾部圈起来保护
4. 收敛到的每帖条数与删掉的条数都写进 `WARN` 日志，不静默截断

## 6. 存档与重跑模型

```text
data/reddit-life-wechat/
└── 2026-08-17/
    ├── run.json
    ├── upstream-life.md
    ├── cover-1.png        # 提交，两篇各一张
    ├── cover-2.png
    ├── 01-<reddit-post-id>.md   # 第 1-5 帖
    └── 06-<reddit-post-id>.md   # 第 6-10 帖
```

`cover-N.png` 是每篇的专属列表封面，由 `reddit_life_wechat_cover.ts` 用 satori 渲染后随稿子提交，逐条列出本篇五帖标题和品牌；它不进入文章正文。期号与卷次均不显示。文件名用序号，条目字号由 `wechat_cover_layout.ts` 从大到小试算，允许长标题最多折成两行，再按总行数确保列表不超出条目区；英文括注不再把整张封面压到最小字号。缺失时 `astro-wechat` 回落到配置里的 `defaultCover`，因此渲染失败只降级不中断。

`run.json` v4 记录 manifest version、归档日期与时区、父任务提交 SHA / workflow run / 文章路径、上游快照路径、运行状态（`processed` 或 `upstream-empty`），以及模型名、候选总数和完整的入选/过滤决定与理由。入选帖同时记录 `sourceRank`、`selectionRank`、内部卷序号、产物路径和内容 hash。同一篇的五帖各占一条 `posts` 记录但共享同一个 `path`，发布前按 `path` 去重，去重后最多是两条路径。读取器继续兼容历史 v1/v2/v3 manifest，其中 v3 的 `leads` 只作历史数据校验，不进入新稿。

同一日期存在合法 manifest 时，重跑复用它而不重新转换正文。manifest 解析失败时抛错，不回退成空快照。上游文章不存在时写入 `status: upstream-empty` 的 manifest，不产出草稿，也不把空结果当成错误。


## 7. 微信同步

草稿放在 `data/reddit-life-wechat/` 下，不进内容集合，所以博客站点不会出现重复内容。自动 workflow 会先运行 astro-wechat dry-run，只接受 `planned` 或已同步跳过，然后串行创建两篇微信草稿；部分成功时先提交 `.astro-wechat/ledger.json`，再让 job 以失败结束，避免重跑重复创建已经成功的草稿。

父 workflow 手动运行时的 `force=true` 会同时重建站点文章、当日微信归档，并把 `--force-create` 传给 dry-run 和正式同步。它会绕过 `already-synchronized` 新建替代草稿，不会更新或删除公众号草稿箱里的旧稿；同步台账在成功后改为记录最新草稿。未开启 `force` 的普通重跑继续复用 manifest 和同步台账。

`sync-wechat-draft.yml` 仍保留为人工补同步入口，路径校验同时接受 `src/content/posts/*.md` 与 `data/reddit-life-wechat/*.md`。稿子及其封面都已提交，本地直接调用 astro-wechat 前不再需要恢复任何资源；要重新生成整天的两篇稿子可以跑：

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

`--upstream-sha` 与 `--upstream-workflow-run` 必填，`--model` 默认取 `AI_MODEL` 或 `gemini-3.7-flash`。生成器要求当前仓库 `HEAD` 等于 `upstream_sha`；这条管线只读已提交的父任务交接结果，不接受任意工作区内容冒充该提交。

## 9. 启用状态

`publish-reddit-life.yml` 已在 Reddit life 发布成功后调用该 workflow。自动链路只创建公众号草稿，不执行群发；也可通过 `reddit-life-wechat.yml` 的 `workflow_dispatch` 对指定父任务提交补跑。

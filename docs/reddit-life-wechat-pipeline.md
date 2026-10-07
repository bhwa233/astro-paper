# Reddit 人生精选微信草稿技术方案

状态：初次抓取只记录元数据；评论刷新后统一评分并生成最新文章、`upstream-life.md` 与可选微信稿
最后更新：2026-10-07

> **新流程。** 初次抓取不保存回答、评分或 `upstream-life.md` 快照，只把帖子 id、标题、版块、链接、评论数和来源排名记录到 SparkHub。随后刷新任务按 K 选出全部首页新候选（默认 K=100，保留人工刷新入口），深抓评论并重写回答。评分阶段只读取这次刷新后的回答，评分结果绑定回答内容 hash；地区依赖明显的回答按规则降分。
>
> **文章生成时机。** 刷新和评分完成后，生成器从 SparkHub 重新读取已接受、已评分的当前正文，用同一批数据生成 `src/content/posts/zh-cn/reddit-<date>-life.md` 与 `data/reddit-life-wechat/<date>/upstream-life.md`。两者都不使用初次来源文章的回答快照；只有这一步成功后，微信稿、视频、图文和卡片才继续。

## 1. 背景

`reddit-top20` 每天从 `r/AskReddit` 与 `r/askscience` 产出「问答精选」栏目文章，其中每帖正文已经是逐条回答的有序列表（一条回答一项，无小标题、无引用块）。微信侧先让 AI 给文章里的全部帖子逐一打 0-100 分，地区依赖、短期失效、对立争议或过度专业的内容压到低分，再由代码按分数取过线（≥60）的最多 5 帖转成一篇微信草稿。2026-09-23 之前每天最多 10 帖、分两篇推送，历史归档里仍能看到第二卷。`r/confessions`、`r/changemyview` 与 `r/tifu` 已拆到仅发布博客的「人生讨论」栏目，不是本管线输入。

早期方案曾经深抓单帖评论树、逐讨论串调用模型、再综合成四段式文章（讨论背景 / 主流观点 / 回复补充 / 分歧边界）。上游正文改成故事集之后那套结构失去意义，已整体删除，这条管线不再请求 Reddit 深抓来源服务。

模型只做微信选题，不改写故事正文、标题、摘要或开篇。每篇标题取选后第一帖，摘要列出本篇收录的标题。曾经有一次模型调用把多帖话题串成一个标题，读者一眼看不出在讲什么，因此成稿仍坚持主打第一帖。

稿子的「阅读原文」固定指向当天问答博客文章的原始地址，不添加查询参数或锚点。正文末尾没有二维码卡片和「今天还有这些热帖」清单，入选内容直接进入草稿正文。

## 2. 目标与非目标

目标：

- 每个归档日最多归档一篇微信稿，并自动创建到微信公众号草稿箱
- 候选覆盖上游文章全部帖子，AI 给每帖打一个 0-100 综合分，代码按分数排序并取过线的最多 5 帖
- 正文只搬运入选帖的已有回答；除编号规范化、每帖条数截断和超限收口外不改写
- 渲染结果必须落在微信正文长度上限内
- 同一天重跑稳定复用 manifest
- 归档可审计：保留刷新后的正文导出、回答 hash、父任务提交与父 workflow run

非目标：

- 初次抓取阶段不做 AI 评分，也不把 Reddit 原始 score/points 存入素材池或参与排序
- 不进入 Astro 内容集合（`data/` 下的文件不会生成博客页面）
- 不自动群发或发布公众号文章；这里只创建微信草稿

## 3. 数据流

```text
reddit-top20 (publish)
  └─ 初次 ingest：只记录候选元数据到 SparkHub
       └─ refresh：默认 K=100，刷新首页轮全部新候选并重写回答
            └─ AI 评分：读取刷新后的回答，绑定 content_sha256
                 └─ 重新读取 SparkHub archive
                      ├─ src/content/posts/zh-cn/reddit-<date>-life.md
                      ├─ data/reddit-life-wechat/<date>/upstream-life.md
                      ├─ data/reddit-life-wechat/<date>/01-<postId>.md
                      └─ run.json / 微信草稿 / 视频 / 图文 / 卡片
```

workflow `reddit-life-wechat.yml` 由 `publish-reddit-life.yml` 在 publish 成功后调用。父任务传入 `upstream_sha`、`upstream_workflow_run` 与归档日期；子 workflow checkout 该提交，生成器再验证当前 `HEAD`，从而保证文章、审计字段和父任务交接一致。

## 4. 选帖与内容转换

- **候选证据**：初次 ingest 只从上游文章解析元数据。评分时从 SparkHub 读取刷新后的 `content_md`，提示词包含问题和代表回答；不包含 Reddit 原始热度或 points。
- **打分与排序**：一次模型调用给全部候选各打一个 0-100 整数分，综合长尾价值、普遍共鸣和大众可读性；地区依赖、短期失效、对立争议、过度专业是扣分项，分数封顶 39。排序完全由代码决定：按分数降序，同分按上游排名升序，取 ≥60 分（`REDDIT_LIFE_WECHAT_MIN_SCORE`）的前 5 帖，不足 5 帖照样成篇。模型必须给每个候选恰好一个分数，重复、遗漏、越界和非法分数都会触发 JSON 重试。重试耗尽时整次生成失败，不回退到未打分的原榜。
- **开篇**：代码根据本卷实际收录标题生成固定清单：先写「本期 Reddit 问答包括：」，再按正文顺序列出全部问题。开篇不调用模型，也不会出现清单与正文不一致。
- **分卷**：入选帖按 AI 顺序全部进同一篇稿子。合格不足 5 帖时照样成篇，不用低质量帖子补齐。
- **截断**：每帖最多保留前 30 条回答，实际条数由第 5 节的长度收口按渲染结果定，同一篇内各帖统一同一个值。撤掉页脚后每篇省出的 HTML 预算会让收敛值比过去更高。实测 2026-08-21 归档收敛到每帖 24 条、2026-08-20 收敛到 19 条，故事总量不足时（2026-08-19）不触发截断。
- **分隔**：每个问题使用 Markdown 二级标题，与其他微信日报的条目层级保持一致。
- **正文**：事实 bullet 之后的全部回答作为输入。编号统一为 `1\.` 形式；只有撞微信正文上限时才从末尾删除回答。
- **封面**：稿子仍生成专属封面并作为微信列表缩略图，但 `wechat.showCoverInBody: false` 阻止渲染器把它重复插到正文开头；正文从固定问答清单开始。
- **标题与摘要**：标题取选后第一帖标题，形如 `<本篇第一帖标题>｜Reddit 问答精选`；期号与卷次均不显示。原文章摘要对应原榜第一帖，重排后不再可靠，因此摘要列出本篇收录的标题。
- **内部身份**：稿子在 manifest 中记录内部卷序号 `v1`（每天两篇时期的历史归档还有 `v2`）；微信同步 ID 使用归档日期与卷序号，因此不依赖标题。
- **frontmatter**：`tags: [Reddit人生讨论]`（在 `astro-wechat.config.mjs` 的 `eligibleTags` 内）、`wechat.enabled: true`，另附 `redditPostId` 与 `subreddit` 记本篇第一帖，便于追溯。`wechat.sourceURL` 显式写入当天 `reddit-<date>-life` 博客地址，作为草稿的 `content_source_url`（「阅读原文」），不添加查询参数或锚点。同步身份由独立的 `wechat.syncId` 决定，不依赖原文地址。若某次同步停在 `pending`，同步会停止，须人工检查草稿箱、确认需要新建后再使用 `--force-create`。

## 5. 长度收口

微信正文上限是 20000 字符的 HTML，而一帖的故事条数不可控。`fitWechatContentLimit` 直接用 astro-wechat 的渲染器判定（`openProject` + `prepareArticle`，无网络、只写临时探针），分两级收口：

1. 每帖 30 条能渲染就原样归档
2. 撞 `content-too-long` / `content-too-large` 时，二分「每帖统一保留几条」，取仍能渲染通过的最大值。删减均摊到本篇各帖，不会把靠后的帖子整个啃掉；实测约 5 次探针
3. 每帖只剩一条仍超限（单条故事极长）才退到尾删：`dropTrailingStories` 二分最少的删除条数。编号从 1 递增，从尾部删不会留下断号；frontmatter 与开篇问答清单永不参与截断。稿子不再有页脚，正文末尾就是可删区的末尾，因此也不再需要哨兵把尾部圈起来保护
4. 收敛到的每帖条数与删掉的条数都写进 `WARN` 日志，不静默截断

## 6. 存档与重跑模型

```text
data/reddit-life-wechat/
└── 2026-09-23/
    ├── run.json
    ├── upstream-life.md       # 刷新后的最新正文导出，不是初始快照
    ├── cover-1.png        # 提交
    └── 01-<reddit-post-id>.md   # 第 1-5 帖
```

2026-09-23 之前的目录还有 `cover-2.png` 和第二卷 `02-<reddit-post-id>.md`。

`cover-1.png` 是稿子的专属列表封面，由 `reddit_life_wechat_cover.ts` 用 satori 渲染后随稿子提交，逐条列出本篇各帖标题和品牌；它不进入文章正文。期号与卷次均不显示。文件名用序号，条目字号由 `wechat_cover_layout.ts` 从大到小试算，允许长标题最多折成两行，再按总行数确保列表不超出条目区；英文括注不再把整张封面压到最小字号。缺失时 `astro-wechat` 回落到配置里的 `defaultCover`，因此渲染失败只降级不中断。

`run.json` 记录 manifest version、归档日期与时区、父任务提交 SHA / workflow run / 文章路径、刷新后 `upstream-life.md` 路径、运行状态，以及全部候选的 AI 分数、理由和当前回答 hash。入选帖同时记录 `sourceRank`、`selectionRank`、内部卷序号、产物路径和内容 hash。同一篇的各帖各占一条 `posts` 记录但共享同一个 `path`，发布前按 `path` 去重。旧 manifest 只用于读取历史归档。

同一日期存在合法 manifest 时，重跑复用它而不重新转换正文。manifest 解析失败时抛错，不回退成空快照。刷新后没有已评分 archive 时写入 `status: upstream-empty` 的 manifest，不生成文章或草稿，也不把空结果当成有效候选。


## 7. 微信同步

草稿放在 `data/reddit-life-wechat/` 下，不进内容集合，所以博客站点不会出现重复内容。自动 workflow 会先运行 astro-wechat dry-run，只接受 `planned` 或已同步跳过，然后创建微信草稿（历史日期重跑时可能是两篇，串行创建）；部分成功时先提交 `.astro-wechat/ledger.json`，再让 job 以失败结束，避免重跑重复创建已经成功的草稿。

父 workflow 手动运行时的 `force=true` 会同时重建站点文章、当日微信归档，并把 `--force-create` 传给 dry-run 和正式同步。它会绕过 `already-synchronized` 新建替代草稿，不会更新或删除公众号草稿箱里的旧稿；同步台账在成功后改为记录最新草稿。未开启 `force` 的普通重跑继续复用 manifest 和同步台账。

`sync-wechat-draft.yml` 仍保留为人工补同步入口，路径校验同时接受 `src/content/posts/*.md` 与 `data/reddit-life-wechat/*.md`。微信 CLI 只为配置的博客内容目录自动推导 canonical URL；`data/` 下的归档稿必须显式写 `wechat.sourceURL`，避免按归档文件名生成不存在的 `/posts/<slug>/`。稿子及其封面都已提交，本地直接调用 astro-wechat 前不再需要恢复任何资源；要重新生成整天的稿子可以跑：

```bash
node --import tsx scripts/generate_reddit_life_wechat.ts \
  --date <date> --upstream-sha <sha> --upstream-workflow-run <run-id>
```

本地预览：

```bash
pnpm exec astro-wechat preview data/reddit-life-wechat/<date>/01-<postId>.md
```

### SparkHub 素材池

初次候选步骤用 `scripts/ingest_reddit_life_sparkhub.ts` 把元数据推进 `POST /api/linkdisk/dashboard/decks/reddit-life/ingest`，不发送正文、score 或 points。刷新完成后，生成器从 `GET /scoring-candidates` 读取当前回答，评分后以回答 hash 回报 `POST /scores`，再从 `GET /archive/{date}` 读取最终版本生成文章和 `upstream-life.md`。素材池只有 `score_status=ready` 且 hash 匹配的帖子才可领取、出卡或进入发布队列。

这一步只记录初次元数据，按 postId upsert；刷新、评分和文章生成是后续必经步骤。失败或未配置 `SPARKHUB_DASHBOARD_TOKEN` secret（值即 SparkHub 的 `DASHBOARD_ACCESS_TOKEN`）会阻止下游继续，避免生成未刷新内容。手动补推某天：

```bash
SPARKHUB_API_URL=https://api.bhwa233.com SPARKHUB_DASHBOARD_TOKEN=<token> \
  node --import tsx scripts/ingest_reddit_life_sparkhub.ts --date <date>
```

## 8. 运行方式

```bash
node --import tsx scripts/generate_reddit_life_wechat.ts \
  --date 2026-08-17 \
  --upstream-sha <sha> \
  --upstream-workflow-run <run-id> \
  --artifacts-dir reddit-life-wechat-artifacts
```

`--upstream-sha` 与 `--upstream-workflow-run` 必填，`--model` 默认取 `AI_MODEL` 或 `gemini-3.8-flash`。生成器要求当前仓库 `HEAD` 等于 `upstream_sha`；这条管线只读已提交的父任务交接结果，不接受任意工作区内容冒充该提交。

## 9. 启用状态

`publish-reddit-life.yml` 已在 Reddit life 发布成功后调用该 workflow。自动链路只创建公众号草稿，不执行群发；也可通过 `reddit-life-wechat.yml` 的 `workflow_dispatch` 对指定父任务提交补跑。

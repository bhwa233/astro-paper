# Reddit 人生精选微信草稿技术方案

状态：待实现  
最后更新：2026-08-14

## 1. 背景

仓库已有 `reddit-top20` 定时任务。它从固定 subreddit 获取来源证据，逐帖生成中文摘要，再按“人生与社会、市场与价值投资、人物与问答”三个栏目生成 Astro 站点文章。

新任务的目标不同：它在 `reddit-top20` 完成后，直接读取当天已经生成的“人生与社会”文章，取文章中的前 3 个帖子（不足 3 个时取实际数量）。对其中历史未发布的帖子深抓更多评论，每条帖子生成一篇独立微信草稿，同时在 Git 仓库中保留 Markdown 存档，但不进入 Astro 内容集合，也不生成站点页面。

新任务命名为 `reddit-life-wechat`。现有 `reddit-top20` 任务继续运行，两者在任务入口、归档位置和发布目标上相互独立，只复用底层来源客户端、AI 客户端、Markdown 工具和微信发布工具。

## 2. 已确认决策

| 项目 | 决策 |
| --- | --- |
| 任务名 | `reddit-life-wechat` |
| 候选范围 | `r/AskReddit`、`r/confessions`、`r/changemyview`、`r/tifu` |
| 榜单窗口 | Reddit `top/day` |
| 每日输入 | `reddit-top20` 当天“人生与社会”文章中的前 3 个帖子；文章不足 3 帖时取实际数量 |
| 每日产量 | 最多三篇新的独立 Markdown 和微信草稿；稳态预期 0 到 2 篇 |
| 选帖原则 | 完全沿用上游文章顺序，不重新排序、不补位 |
| 跨天去重 | 同一 Reddit 帖子不重复发布；重复时跳过且不向后递补 |
| 顶层评论 | 初始上限 40 条/帖 |
| 直接回复 | 每条顶层评论最多 10 条高赞直接回复 |
| 评论树深度 | 最多两层：顶层评论及其直接回复 |
| 站点页面 | 不生成 |
| 长期存档 | Markdown、run manifest 和去重账本提交到 Git |
| 微信提交 | 预检通过后按本次新文章列表顺序调用，最多三次 |
| 自动调度 | `reddit-top20` 成功完成后，通过 workflow `needs` 调用新任务 |
| 旧任务 | `reddit-top20` 继续运行 |

## 3. 目标与非目标

### 3.1 目标

1. 每个归档日稳定复用 `reddit-top20` 人生文章中的前三条帖子；文章少于三条时复用其中全部帖子。
2. 只对这些帖子中的历史未发布项执行深度评论抓取。
3. 让文章覆盖更多高赞顶层观点，并保留直接回复对父观点的支持、质疑、纠正或补充关系。
4. 每帖独立生成、独立归档、独立创建微信草稿。
5. 同一天重跑时复用上游文章中相同的帖子集合；跨天运行时跳过历史帖子且不补位。
6. 微信部分成功后可以安全重跑，不重复创建已经成功的草稿。
7. 上游契约、模型输出或归档内容损坏时明确失败，不以静默降级制造错误内容。

### 3.2 非目标

1. 不替换或停用现有 `reddit-top20`。
2. 不把新任务的 Markdown 放入 `src/content/posts`。
3. 不生成 Astro 页面、RSS 条目、站点搜索索引或站点 canonical URL。
4. 不抓取完整评论树，不递归抓取回复的回复。
5. 不在微信草稿中批量转载评论原文；模型输出以中文归纳为主。
6. 不尝试让三次微信创建成为一个远端事务。微信接口不提供这种原子能力。
7. 不在新任务中重新定义人生类榜单，不跨 subreddit 排序，也不搜索第四名以后用于递补。

## 4. 总体架构

```text
GitHub Actions: publish-reddit-top20
        |
        v
reddit-top20 成功完成并提交站点文章
        |
        v
GitHub Actions: reddit-life-wechat（reusable workflow）
        |
        v
读取上游生成提交中的 src/content/posts/zh-cn/reddit-<date>-life.md
        |
        v
按文章顺序提取最多前 3 个帖子 ID 和事实字段
        |
        v
读取历史推荐账本，重复帖子标记为跳过且不补位
        |
        v
只为剩余帖子深抓：正文 + 顶层评论 + 直接回复
        |
        v
逐帖分块提炼与最终综合
        |
        v
写入 run manifest、0-3 篇新 Markdown 和推荐账本
        |
        v
提交 Git 存档
        |
        v
astro-wechat 对本次 0-3 篇新文章统一 dry-run
        |
        v
astro-wechat 内部按文件顺序调用微信 API
        |
        v
提交 .astro-wechat/ledger.json；重跑只补失败项
```

新任务跨越两个部署边界：

- 现有 `reddit-top20` 负责榜单选择，并通过当天人生文章确定候选帖子。
- Reddit 来源服务负责按指定 post ID 访问 Reddit 并返回深度评论证据。
- 本仓库负责解析上游文章、跨运行去重、AI 语义处理、Markdown 归档、微信同步和 CI 编排。

来源服务的实现不在本仓库，因此增加评论量需要同步增加“按指定 post ID 深抓”的来源服务契约。本仓库不能只通过修改 CI 环境变量保证这些行为已经发生。

## 5. 日期与调度语义

新任务沿用当前 Reddit 任务的归档日期规则：按 `America/Los_Angeles` 计算日期。自动运行的唯一 cron 入口仍是现有 `publish-reddit-top20` workflow 中的 `0 8 * * *`；新任务自身不声明 schedule。

需要区分两个概念：

- 归档日期是稳定的业务键，用于目录、run manifest 和重跑。
- Reddit `top/day` 是滚动窗口，不是严格的洛杉矶自然日榜单。

同一归档日期首次成功记录上游交接后，后续重跑不得重新读取另一个文章版本。即使 `top/day` 排名已经变化，也必须复用该日期 run manifest 中记录的上游提交和 Reddit ID 集合。

`publish-reddit-top20` 在同一个 workflow DAG 中先运行现有 `publish` job。只有该 job 成功完成并提交站点文章后，下游 job 才通过 `needs` 调用 `reddit-life-wechat` reusable workflow。下游直接透传相同的显式 date；定时运行时透传相同的 event schedule，使两个任务解析出相同的洛杉矶归档日期。

不采用独立 cron 或 `workflow_run`：独立 cron 只能依赖时间猜测先后；`workflow_run` 在手动补跑历史日期时也不便可靠继承原始输入。显式 job 依赖同时提供确定的执行顺序、日期透传和失败传播。

如果 `reddit-top20` 失败、取消或超时，新任务不自动运行。恢复时先重跑并完成 `reddit-top20`，随后由同一 DAG 进入新任务。`reddit-life-wechat` 仍保留 workflow_dispatch，供固定日期的独立调试和人工恢复使用。

虽然父子 job 已经串行，新 reusable workflow 的仓库写入阶段仍应加入现有 scheduled-posts 同类并发组，`cancel-in-progress` 保持关闭，避免与其他定时发布 workflow 同时 rebase 和 push。微信阶段继续使用全仓唯一的 `wechat-sync` 并发组。

## 6. 上游文章交接

### 6.1 唯一选帖来源

新任务不再访问 subreddit 榜单，也不重新解释 score。唯一选帖来源是同一归档日由 `reddit-top20` 已经生成并提交的“人生与社会”Markdown 文章。

父 workflow 必须向下游提供生成提交 SHA。下游检出该 SHA 后读取文章，不能从 workflow 启动时的旧工作树读取尚未提交的文件。

人生文章路径由下游按归档日期推导为 `src/content/posts/zh-cn/reddit-<date>-life.md`，并在检出的 SHA 上判定是否存在。不存在按 §6.2.1 的 `upstream-empty` 处理，不是失败。命名规则来自 `blog_tasks.ts` 的 `fileName` 与 `reddit_top20_compose.ts` 的 `fileNameSuffix`，两者任一变化都会同时改变上游产物和这里的推导，因此实现时必须复用同一份常量而不是在新任务中重写字符串。

**这一节存在一处现状阻塞。** `blog-publish.yml` 目前只在 `generate` job 上声明 `outputs.generated_sha`，`on.workflow_call` 没有 `outputs:` 块，因此该 SHA 到不了同一个 DAG 中的下游 job。`publish-reddit-top20.yml` 的 `publish` job 是 `uses:` 形式的 reusable workflow 调用，拿不到被调用 workflow 内部 job 的输出。实现新任务前必须先给 `blog-publish.yml` 补上 workflow_call 级别的 `outputs`，把 `generate.outputs.generated_sha` 透出到调用方。这是一次纯新增改动，不影响任何现有任务，见 §16 步骤 2。

### 6.2 候选提取规则

下游按文章中的编号章节顺序提取最多前 3 个帖子块，并从每块读取：

- 文章内排名
- 中文标题
- subreddit
- 热度与评论数展示值
- Reddit 原帖 URL
- URL 中的 Reddit post ID

提取器只验证结构、排名连续性、固定人生类 subreddit 和 URL/post ID 一致性。它不跨 subreddit 排序，不比较 score，也不读取第 4 名以后用于递补。

上游文章只决定帖子身份、顺序和榜单快照事实。下游不复用上游中文摘要作为“更多评论版”文章的语义证据；正文和评论观点必须来自针对这些 post ID 的新深抓结果。

### 6.2.1 上游帖子数量不是契约

`reddit_top20_compose.ts` 的 `redditCategoryArticlesFromItemSummaries` 在该栏目命中数 `>= 1` 时就生成文章，命中数为 0 时整篇不生成。因此以下都是合法上游产物，不是数据损坏：

- 人生文章只有 1 或 2 个帖子块。四个固定 subreddit 当天只有少量帖子通过来源服务的 `min_score` 时就会这样。
- 当天完全没有人生文章。已有归档中 `reddit-2026-08-10` 就只产出 `life` 与 `markets`，没有 `ama`，说明栏目缺失是常态而非异常。

据此，候选数量取 `min(3, 文章内实际帖子块数)`：

- 人生文章存在且可解析：按实际数量处理 1 到 3 个帖子，不因为不足 3 个而失败。
- 人生文章不存在：新任务干净跳过，写入状态为 `upstream-empty` 的 run manifest，不生成任何 Markdown，不追加推荐账本，不调用微信，job 成功退出。
- 人生文章存在但结构损坏：排名不连续、缺失原帖 URL、post ID 无法解析、subreddit 不在固定人生类清单内 —— 只有这些才视为上游发布契约断裂，直接终止新任务。

区分“上游当天内容就少”和“上游产物损坏”是这一节的全部目的。把前者当成失败会让 CI 在完全正常的日子红掉。

### 6.3 历史重复

先提取上游候选，再用 Reddit post ID 查询历史推荐账本。已经发布过的帖子标记为 `duplicate`，不深抓、不生成新的 Markdown、不创建新的微信草稿，也不使用第 4 名补位。

因此一次正常运行可以产生 0 到 3 篇新草稿。“前三”描述的是上游文章的输入范围，不承诺每天一定创建三篇新内容。

稳态产量预期是每天 0 到 2 篇，不是 3 篇。人生栏目只有四个 subreddit，绝大多数帖子来自 `r/AskReddit`，而 Reddit `top/day` 是滚动窗口，同一个高分帖连续两天甚至三天出现在榜单前列是常见情况而非例外。叠加“重复即跳过且不补位”，三个候选全部为新帖的日子属于少数。这是有意选择的结果：宁可少发，也不让同一个帖子在微信里出现两次。容量规划、成本估算和成功判据都应按这个预期设定，不要把“少于三篇”当成异常信号。

同一日期重跑时，run manifest 必须继续指向相同的上游生成提交和相同的 post ID 集合，不能改读后来被覆盖或重新生成的文章版本。

## 7. 指定帖子深抓

### 7.1 请求方式

新任务把候选中尚未发布的 Reddit post ID 或 permalink 交给来源服务，请求单帖深度证据。来源服务不负责选榜、排序、历史去重或递补。

沿用现有 Reddit 来源客户端的异步 job 模型，不引入第二种交互形状。现有实现是 `POST /v3/reddit/top20-source/jobs` 提交后轮询 `GET .../jobs/{id}`，状态机为 `queued | running | ready | failed`，客户端侧轮询超时由 `REDDIT_SOURCE_POLL_TIMEOUT_MS` 控制（默认 25 分钟）。新契约必须给出对应的提交端点、轮询端点、相同的状态机和 progress 字段语义，并复用同一组 `REDDIT_SOURCE_API_URL`、`REDDIT_SOURCE_API_TOKEN`、轮询间隔与超时环境变量。这是服务端契约的一部分，必须在 §16 步骤 1 中先行落地。

各帖子可以并发抓取，但每个单帖详情任务必须返回独立结果和统计，避免一个帖子失败导致其他帖子证据丢失。任务只处理上游候选，不因删除、内容排除或处理失败请求其他帖子。结果至少包含：

- 帖子 ID、标题、正文、subreddit、score、评论数、发布时间、permalink
- 顶层评论及其 score、comment ID
- 每条顶层评论的直接回复及其 score、comment ID、parent ID
- 删除、截断、过滤和抓取失败数量
- 实际使用的抓取 policy
- source 与 policy 的 SHA-256

### 7.2 评论选择策略

初始 policy：

| 参数 | 现有 policy 字段 | 初始值 |
| --- | --- | ---: |
| 顶层评论上限 | `top_level_comment_limit` | 40 |
| 每条顶层评论直接回复上限 | `direct_reply_limit` | 10 |
| 最大树深 | `max_comment_depth`（新增） | 2 |
| 帖子正文字符上限 | `max_post_body_chars` | 8,000 |
| 单条评论字符上限 | `max_comment_chars` | 1,200 |
| 每帖评论总字符预算 | `max_comment_chars_per_post`（新增） | 40,000 |

顶层评论上限取 40 而不是 100。人生栏目的高分帖常有上千条评论，但按 score 降序排到第 100 条时，得分通常已经掉到个位数，信息密度接近噪声，却要按满额付出抓取时间、字符预算和模型成本。三帖同时命中时，100 条的配置会在 `reddit-top20` 自身开销之上再叠加数十次分块调用。先按 40 起步，用真实 artifact 的观点覆盖率反向验证是否需要上调，比先设满额再往回砍更容易判断收益。

字段命名必须复用现有 `reddit-source-policy.v1` 的词汇。该 policy 已经携带 `top_level_comment_limit`、`direct_reply_limit`、`detail_comment_limit`、`max_post_body_chars`、`max_comment_chars`，且全部参与 policy hash 计算。新契约应当扩展这一组字段，只为确实缺失的语义新增 `max_comment_depth` 和 `max_comment_chars_per_post`，不要为同一个服务另起一套平行的策略词汇 —— 两份语义重叠但命名不同的 policy schema 会让服务端和客户端的校验逻辑长期分叉。

这些数值必须出现在来源服务返回的 policy 中并参与 policy hash，不能只作为 CI 中不可审计的隐式配置。后续根据真实 artifact 的覆盖率、CI 时间和模型成本调整，调整时升级 policy hash；若改变字段语义，则升级契约版本。

顶层评论按 Reddit 返回的高赞顺序处理。直接回复在各自父评论内按 score 降序选择，最多 10 条。总字符预算按以下原则分配：

1. 优先保留更多不同顶层评论，保证观点广度。
2. 顶层评论入选后，再以轮转方式为不同父评论补充直接回复。
3. 单个讨论串不得在其他顶层观点进入证据前耗尽总预算。
4. 父评论被丢弃时，其直接回复必须一并丢弃。

过滤 `[deleted]`、`[removed]`、AutoModerator、空内容和规范化后重复的评论。过滤只减少输入噪声，不能修改剩余评论的父子关系。

## 8. 来源契约演进

当前客户端只接受 `reddit-top20-source.v7` 的批量结果，其 `reddit-source-policy.v1` 已经同时描述 listing 策略（`listing_sort`、`listing_period`、`listing_limit`、`min_score`、`max_detail_candidates`）和详情策略（`top_level_comment_limit`、`direct_reply_limit`、`detail_comment_limit`、`max_post_body_chars`、`max_comment_chars`）。新任务只需要按上游选定的 post ID 深抓评论，不能在不改变语义的情况下继续假装是同一个 v7 响应。

因此为新任务引入独立的单帖证据契约，包含帖子事实、评论树、截断信息、抓取统计和 policy。每个响应都必须携带 archive date、contract version、fetched at、source hash 和 policy hash。

新 policy 是现有 `reddit-source-policy.v1` 的演进版，不是另一套体系：

- 详情类字段沿用原名与原语义，客户端两侧可以共用同一份字段校验。
- 与选榜相关的字段在单帖契约中不出现，因为新任务不选榜。
- 只为 §7.2 中确实缺失的语义新增字段，新增后同样纳入 policy hash。
- policy hash 的计算方式沿用现有实现：对规范化后按 key 排序的 policy 对象做 JSON 序列化再取 SHA-256，客户端用服务端给出的 hash 复核。

客户端必须拒绝：

- 未知的新旧契约版本
- 请求日期与响应日期不一致
- 非固定人生类 subreddit
- post ID、permalink 或 parent ID 不一致
- 非整数或负数 score/评论计数
- 超过 policy 上限的顶层评论或直接回复
- 深度超过两层的评论
- 缺失父评论的直接回复
- source 或 policy hash 不匹配
- 统计数量与实际证据树不一致

来源契约失败一律终止任务，不做“尽力解析”降级。

## 9. AI 处理流程

### 9.1 为什么不能继续单次调用

40 条顶层评论加每条最多 10 条直接回复，最坏情况下会形成数百个评论节点。即使来源服务执行字符截断，一次把全部证据交给模型，也容易出现后半段证据遗漏、父子关系混淆和输出不稳定。

因此每帖采用“讨论串分块提炼 + 帖级综合”两级处理。

### 9.2 讨论串分块

一个顶层评论及其直接回复是不可拆分的最小讨论串。分块时按顶层评论排名依次装入有界输入块，不得把回复移动到另一个不含父评论的块。

每个分块输出结构化语义证据，至少包括：

- 所依据的顶层 comment ID
- 主张或经历的具体内容
- 观点分量
- 直接回复是在支持、质疑、纠正还是补充父观点
- 有意义的数字、场景、方法和反例
- 应排除的低信息内容

模型不得在这一阶段写最终文章，也不得补充输入外事实。

### 9.3 帖级综合

最终调用只消费帖子事实和全部分块语义证据，输出：

- 与原题一致的自然中文标题
- 不使用 Markdown 标题语法的中文正文
- 对帖子问题和讨论落点的简要介绍
- 按观点聚类的具体内容
- 主流与少数意见的分量区别
- 对直接回复与父观点关系的准确描述
- 明显反驳、纠正和适用边界

热度、subreddit、发布时间、评论数和原帖 URL 不由模型生成，统一从来源事实确定性写入归档。

### 9.4 排除与失败

沿用现有 Reddit 摘要的主题排除规则：部分回答命中时只丢弃相关回答；整帖命中时该帖子标记为 `content-skipped`，不生成草稿，也不从上游第 4 名开始递补。

模型格式错误允许按现有 AI 重试策略重试。所有重试耗尽属于基础设施或模型契约失败，终止整次任务；不能把它当成帖子内容不合格后静默跳过。

## 10. 存档模型

### 10.1 目录结构

建议使用：

```text
data/reddit-life-wechat/
├── recommended.json
└── 2026-08-14/
    ├── run.json
    ├── 01-<reddit-post-id>.md
    ├── 02-<reddit-post-id>.md
    └── 03-<reddit-post-id>.md
```

示例展示三个帖子均为新内容时的完整目录。存在历史重复或内容跳过时，对应 Markdown 不出现，但 `run.json` 仍记录该上游排名及处理状态。上游人生文章不存在时，该日期目录只有一个状态为 `upstream-empty` 的 `run.json`。

该目录不在 Astro 的 `src/content/posts` 下，因此不会生成页面。每个日期目录还长期保存 `upstream-life.md`（上游人生文章快照）和 `post-detail-evidence.json`（服务返回的原帖与评论证据），使最终文章可从原始来源审计和重放。分块响应、重试错误和运行日志仍保存在 GitHub Actions artifact 中。

### 10.2 run manifest

`run.json` 是归档日期的不可变上游交接与处理快照，至少记录：

- manifest version
- archive date 与时区
- 上游 workflow run、生成提交 SHA 和人生文章相对路径
- 原始来源快照路径：`upstream-life.md` 与 `post-detail-evidence.json`
- 运行级状态：`processed` 或 `upstream-empty`
- 1 到 3 个帖子按上游文章顺序排列的 post ID、标题、subreddit、热度、评论数和 permalink
- 每帖处理状态：`generated`、`duplicate` 或 `content-skipped`
- 新生成 Markdown 的相对路径和内容 hash
- 深抓来源 contract version、policy hash、source hash 和 fetched at

同一日期存在合法 run manifest 时，重跑必须复用其中的上游提交、帖子集合和已有文件路径。manifest 解析失败时抛错，不得删除后重新读取当天最新文章。

`run.json` 中处于 `generated` 状态的帖子集合是该归档日的权威记录。它同时是重跑的输入、推荐账本写入的数据源和微信文件列表的来源，三处都不得各自重新推导。

本次所有非重复帖子都完成处理并通过校验前，不得发布最终 manifest 或更新推荐账本。实现时应先写入运行临时目录，整批处理结束后再移动到最终日期目录，避免半批存档成为下一次运行的错误快照。

### 10.3 跨天推荐账本

`recommended.json` 使用仓库现有 `recommendation_ledger.ts` 通用实现，由 Reddit 薄封装只提供 post ID 身份算法。推荐 key 使用规范化 Reddit post ID，不以标题、score、日期或排名作为身份。

账本中的 `postPath` 指向对应日期的 `run.json`，同一归档日的全部推荐项共用这一个 `postPath`。读取或结构校验失败时必须中止任务，绝不回退为空账本。没有任何 `generated` 帖子时不调用空批追加 —— `appendRecommendations` 对空数组直接抛错。

**每次写入必须传该归档日 `run.json` 中全部 `generated` 状态的帖子，不是本次新增的增量。** `appendRecommendations` 的实现是先执行 `filter(entry => entry.postPath !== meta.postPath && !newKeys.has(entry.key))` 再整批 push，即同一个 `postPath` 的历史行会被全部清除后重写。如果重跑时只传增量，上一次已经写入的帖子会因为不在本次批次中而被静默删除，于是它在后续日期重新变成“未发布”，被重复深抓并重复创建微信草稿 —— 正好是跨天去重要防的事。

这条约束在部分失败重跑时最容易被违反：第一次运行生成 A、B 并写入账本，微信阶段失败；重跑时 A、B 在 run manifest 中已是 `generated`，本次“新增”为空，此时既不能传空数组，也不能只传其中一个，必须原样重传 A、B。写入是幂等的全量覆盖，不是追加。

同一日期重跑时先读取 run manifest，不重新解析另一个上游版本；跨日期运行在提取上游候选后使用推荐账本标记历史重复 post ID。

### 10.4 单篇 Markdown

每篇 Markdown 至少包含以下 frontmatter 语义：

- 中文标题
- 中文摘要
- 作者
- 归档日期和抓取时间
- Reddit post ID、subreddit、score、评论数和原帖 URL
- `draft: false`
- 独立的 Reddit 微信标签
- `wechat.enabled: true`
- `wechat.sourceURL` 指向 Reddit 原帖 permalink

`wechat.sourceURL` 同时作为微信草稿的“阅读原文”链接和 `.astro-wechat/ledger.json` 中的稳定 source ID。因为跨天不重复，同一个 Reddit URL 只应对应一条微信草稿。

正文建议固定为：

1. 帖子问题与讨论背景
2. 主流观点及具体事例
3. 直接回复带来的补充、质疑与纠正
4. 少数意见、分歧和适用边界
5. 来源信息与原帖链接

不在正文中显示用户名，不逐条翻译或转载评论，不暴露抓取、模型或提示词处理过程。

## 11. 微信同步

### 11.1 资格配置

当前 `astro-wechat.config.mjs` 的 `eligibleTags` 只允许技术日报和每周图书推荐。实现新任务时需要加入独立 Reddit 标签，且每篇文章仍必须显式设置 `wechat.enabled: true`。配置只能限制已主动开启的文章，不能隐式开启其他 Markdown。

新标签必须与 `reddit-top20` 站点文章使用的 `Reddit热门` 区分开。虽然 `dist/eligibility.js` 的两道门是 AND 且文章级 `wechat.enabled` 具有否决权，存量 Reddit 站点文章不会因为标签进入白名单而被发布，但复用同一标签会让 `eligibleTags` 的意图无法从配置本身读出，也会让将来任何一次误加 `wechat.enabled` 的影响面从一篇扩大到上百篇。用独立标签把两条发布链路在配置层就分开。

默认封面可以继续使用现有 `defaultCover`。新任务没有站点页面，因此不得依赖 Astro 构建产物中的动态封面。

### 11.2 预检

Git 存档提交后，微信 job 检出生成提交，并从 run manifest 中 `generated` 状态的帖子读取本次 0 到 3 个文件路径。没有文件时微信 job 正常跳过；有文件时统一执行 dry-run，并要求每篇状态为：

- `planned`：尚未同步，本次将创建；或
- `skipped / already-synchronized`：之前已经成功创建。

任何资格错误、frontmatter 错误、封面错误或未知 skip reason 都阻止真实微信调用。

### 11.3 顺序创建

真实发布把新文件按上游 rank 顺序交给 `astro-wechat publish`。该工具内部用顺序循环逐篇调用微信 API，不会并发创建草稿；单篇失败被记录后仍继续处理后面的文件。当三个上游帖子都是新内容时，微信 API 会被顺序调用三次。

多次调用不是远端原子事务，允许出现部分成功。每篇的本地状态变化如下：

```text
无记录 -> pending -> committed
              |
              +-> 调用结果未知：下次按 sourceURL 与微信草稿核对
```

微信调用前写 `pending`，成功后立即写 `committed`。若运行在第一篇和第二篇之间中断，第一篇记录仍保存在工作树中。

### 11.4 部分失败恢复

发布命令非零退出后，workflow 仍必须执行以下步骤：

1. 上传本次全部逐篇结果 artifact。
2. 检查并提交已经变化的 `.astro-wechat/ledger.json`。
3. rebase 并重试 push。
4. 最后根据逐篇结果把 job 标记为失败。

下次运行遇到 `committed` 时直接跳过；遇到 `pending` 时利用 Reddit 原帖 URL 与微信草稿核对，确认已经创建则补记 committed，否则再创建。定时任务和手动重跑都不得使用 `--force-create`。

只有本次全部新文章都处于 created 或 already-synchronized 状态时，当日微信同步才算成功。duplicate 和 content-skipped 不进入微信文件列表。

## 12. CI 工作流

新任务使用独立 reusable workflow，不复用 `blog-publish.yml` 的站点发布分支。它由 `publish-reddit-top20` 的下游 job 自动调用，同时保留 workflow_dispatch 手动入口。新 reusable workflow 内部建议拆为两个 job。

### 12.1 generate-and-archive

1. 检出并同步到分支最新提交。
2. 安装锁定版本的 pnpm、Node 和依赖。
3. 读取归档日期、上游人生文章、run manifest、推荐账本和微信账本。
4. 上游人生文章不存在时，写入 `upstream-empty` 的 run manifest 并跳过其余步骤，job 成功退出。
5. 提取上游候选（最多 3 个），跳过历史重复项，对其余帖子深抓并生成 0 到 3 篇文章。
6. 校验上游交接、run manifest、新 Markdown、事实字段和模型证据契约。
7. 将原始证据和模型响应上传为 artifact。
8. 提交 `data/reddit-life-wechat` 下的存档和推荐账本；账本写入传该日期全部 `generated` 帖子。
9. push 时沿用现有三次 rebase/retry 策略。
10. 输出生成提交 SHA、run manifest 路径和本次 `generated` 归档路径列表。

生成阶段不修改 `src/content/posts`，不需要为了运行产物执行 Astro build。实现代码本身仍由普通 PR CI 的 lint、format、typecheck 和必要测试覆盖。

### 12.2 sync-wechat

1. 只在生成 job 成功后运行。
2. 检出生成提交 SHA，而不是 workflow 启动时的旧 SHA。
3. 从生成 job 的 output 拿到 run manifest 路径，直接在已检出的提交上读取它，按 rank 顺序取 `generated` 帖子的文件路径。不再为传递这份列表引入 artifact 上传/下载和二次交叉验证：run manifest 已经和被检出的代码在同一个提交里，是唯一权威来源，多一层搬运只会多一处可失败环节和一处可能与 manifest 不一致的副本。
4. 对本次 0 到 3 篇新文章执行 dry-run；零篇时正常跳过。
5. 按 rank 顺序调用微信 API，调用次数等于本次新文章数，最多三次。
6. 无论发布步骤是否部分失败，都持久化微信 ledger 并上传结果 artifact。
7. 本次全部新文章状态满足成功条件后 job 才通过。

微信 job 使用 `wechat-production` environment，并复用现有 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_PROXY_URL` 和 `WECHAT_PROXY_TOKEN` secrets。GitHub 托管 runner 继续通过固定 IP 转发代理访问微信，不直接依赖 runner 出口 IP 白名单。

### 12.3 手动入口

workflow_dispatch 至少支持：

- archive date
- AI model override

不提供日常可见的 `force_create` 输入。若确需人为创建重复草稿，应继续通过受控的现有手动微信 workflow 明确执行，而不是让定时任务拥有危险默认路径。

自动调用入口必须接收父 workflow 透传的 archive date、event schedule 和 AI model override，并使用 `secrets: inherit` 获得来源服务、AI 和微信凭据。新 workflow 不声明自己的 cron，避免同一天被父 DAG 和独立 schedule 重复触发。

## 13. 失败语义

| 失败 | 行为 |
| --- | --- |
| 推荐账本或 run manifest 损坏 | 立即失败，不重新读取上游 |
| 来源契约/hash 不匹配 | 立即失败 |
| 上游人生文章不存在 | 写入 `upstream-empty` manifest，跳过其余阶段，job 成功 |
| 上游人生文章只有 1 或 2 帖 | 正常处理实际数量，不失败 |
| 上游人生文章结构损坏（排名不连续、缺 URL、post ID 不可解析、subreddit 不在清单内） | 立即失败 |
| 上游生成提交 SHA 未从父 workflow 传入 | 立即失败，不回退到当前工作树 |
| 指定帖子详情瞬时失败 | 按基础 fetch 策略重试，耗尽后失败 |
| 帖子已删除或无可用评论 | 该帖标记 content-skipped，不补位 |
| 整帖命中排除主题 | 该帖标记 content-skipped，不补位 |
| AI/API 重试耗尽 | 基础设施失败，整批失败 |
| 任一 Markdown 契约失败 | 整批失败，不写最终存档 |
| 微信 dry-run 任一异常 | 不调用真实创建接口 |
| 微信真实创建部分失败 | 保存成功账本，任务失败，等待重跑补齐 |
| ledger push 失败 | 任务失败并保留 artifact；再次创建前必须先恢复账本状态 |

## 14. 可观测性与 artifact

CI summary 至少展示：

- 归档日期、来源 contract version 和 policy hash
- 上游文章是否存在、结构校验结果和候选提取数量（0 到 3）
- 上游生成提交、人生文章路径及各候选帖的 rank、post ID、热度和评论数
- 历史重复、content-skipped 和实际新生成数量
- 每帖顶层评论数、直接回复数、过滤数、截断数和总字符数
- 每帖分块数量、AI 重试次数和最终文章字符数
- 0 到 3 篇新归档路径与内容 hash
- 本次新文章的微信 dry-run 和真实发布状态

generation artifact 至少保存：

- 上游人生文章副本与候选提取结果（同样长期存档）
- 需要深抓帖子的原始证据（同样长期存档）
- 来源 policy 和统计
- 分块模型响应与最终模型响应
- duplicate、content-skipped 状态及原因
- run manifest 副本
- 微信 dry-run 与真实发布 JSON

artifact 中不得写入 API token、Authorization header 或完整 secrets。原始评论证据只放在受 GitHub 权限保护、具有保留期限的 artifact 中，不提交到长期 Git 历史。

## 15. 验证策略

实现时按风险覆盖以下不变量：

- `tests/pure.test.ts`：人生文章候选提取（覆盖 1、2、3 帖和文章缺失四种情形）、结构损坏与内容偏少的区分、历史去重不补位、评论预算和父子关系选择。
- `tests/ledgers.test.ts`：跨天不重复、同日 run manifest 固定、0 到 3 条批量写入边界和损坏立即失败。另需一条专门的回归用例：同一归档日第二次写入时传全量 `generated` 帖子，断言首次写入的帖子仍在账本中 —— 只传增量会因 `postPath` 过滤而丢行，这是重复建草稿的直接成因。
- `tests/sources.test.ts`：新来源契约版本、hash、评论深度、每父回复上限、统计不一致和未知 subreddit 拒收。
- `tests/compose.test.ts`：事实只取 source、回复不提升为独立主流观点、模型 skip 与格式错误分流、单篇微信 Markdown 契约。
- 离线流水线 fixture：覆盖 0 到 3 个新归档文件、`upstream-empty` 和一个 run manifest，不写入 `src/content/posts`。
- 微信同步集成检查：可变文件列表的 planned/already-synchronized 状态组合和部分成功账本恢复。

涉及 `.ts` 时执行 `pnpm run typecheck` 与 `pnpm run lint`；涉及生成真实逻辑时执行 `pnpm run test:blog`；提交前执行 `pnpm run format:check`。只有实现改变模块边界、依赖、构建配置或产物形状时才需要 `pnpm run build`。

## 16. 发布步骤

1. 先在来源服务实现并部署版本化的指定 post ID 单帖深抓契约，包含 §7.1 的异步 job 端点与 §7.2 的扩展 policy 字段。
2. 给 `blog-publish.yml` 增加 `on.workflow_call.outputs`，把 `generate` job 的 `generated_sha` 暴露到调用方；确认 `publish-reddit-top20.yml` 的 `publish` job 能读到该输出。此步骤不改变现有任何任务的行为，可以先独立合入验证。
3. 在本仓库完成新任务的来源客户端、compose、薄账本封装、非站点归档和离线验证。
4. 通过 workflow_dispatch 使用固定上游人生文章和 mock AI 验证 0 到 3 篇归档以及 `upstream-empty` 分支，不调用微信。
5. 对真实来源运行一次 generation-only，检查候选提取、历史去重、评论覆盖和分块 artifact；同时记录 40 条顶层评论下的实际观点覆盖率，作为是否上调上限的依据。
6. 对新生成文章执行微信 dry-run，确认标题、摘要、封面、正文排版与 sourceURL。
7. 手动触发一次真实微信串行创建，验证部分失败恢复和账本提交，并确认重跑后推荐账本中首次写入的帖子仍然存在。
8. 在现有 `publish-reddit-top20` workflow 中加入成功后调用新 reusable workflow 的下游 job；不为新任务增加第二个 schedule。

## 17. 验收标准

任务满足以下条件才视为完成：

1. 每个归档日严格按上游人生文章顺序读取最多前 3 个帖子，不重新排序或补位；文章只有 1 或 2 帖时按实际数量处理且不失败，文章缺失时干净跳过。
2. 同日重跑始终复用相同上游提交和相同 post ID 集合，跨日重复项跳过。
3. 每帖证据最多包含 40 条顶层评论、每条最多 10 条直接回复，且不存在孤儿回复或三层评论。
4. 每帖生成一个不进入 Astro 内容集合的 Markdown 存档。
5. 一次运行顺序创建 0 到 3 篇新微信草稿；三个上游帖子均为新内容时顺序创建三篇。受 `top/day` 滚动窗口与跨天去重影响，稳态下多数日子是 0 到 2 篇，少于三篇不构成失败信号。
6. 任一微信调用失败后，已成功草稿不会在重跑时重复创建；重跑也不会因账本增量写入而丢失历史推荐行。
7. 新存档、run manifest、推荐账本和微信账本均有可审计 Git 历史。
8. 现有 `reddit-top20` 调度和站点产物不受影响；对 `blog-publish.yml` 的改动仅新增 workflow_call 输出，不改变既有任务行为。
9. 自动运行只在同一归档日的 `reddit-top20` 成功完成后开始；上游失败时不运行。

# 代码 Review 报告｜2026-08-14

依据：`engineering-defaults` skill（复用优先、测试必须挣得自己的位置、gate 即验证）+ 本仓 `AGENTS.md`。
范围：`scripts/**`、`tests/**`。**本文只提方案，未改任何代码。**

---

## 0. 结论摘要

仓库的基础设施层是健康的，而且是主动收敛过的：`blog_common.ts` / `markdown_text.ts` /
`compose_common.ts` 的分层清楚，`recommendation_ledger.ts` 已经把 nyt-books 与 mdblist 的两份
拷贝合并成 spec 模式，`html_dom.ts` 是 jsdom 的唯一封装点，`check_conventions.ts` 把
「第三方库经封装引用」和「孤儿模板」这两条规则做成了扫全目录的 checker——这正是 skill 里
`verification-gates.md` 推荐的形态。测试也不是覆盖率驱动的：五个文件按层分工，注释里写明了
每条断言在防哪一类回归，`tests/pure.test.ts` 里的日期窗口用例甚至写清了「source builder 那条
用例看不出这些边界」。这些不需要动。

问题集中在**编排层**。按优先级：

| 级别 | 问题 | 位置 | 命中的约束 |
| --- | --- | --- | --- |
| P0 | 任务的行为知识散落在 4 个文件、约 29 处 `task === "..."` 分支里，注册表只持有展示元数据 | `generate_scheduled_post.ts` / `astro_paper_archive.ts` / `verify_blog_generation.ts` / `blog_tasks.ts` | 复用梯第 3 级（仓库别处已有同样的事） |
| P1 | 三份逐条目 AI 摘要重试循环，逻辑同构、实现各写一遍 | `generate_scheduled_post.ts:330/644/754` | 复用梯第 3 级 |
| P1 | `parseJsonObject` 是 `compose_common.stripJsonFence` 的第二实现 | `generate_scheduled_post.ts:309` vs `compose_common.ts:19` | 复用梯第 1 级（本仓共享原语已有） |
| P2 | 六处手写 env 数字读取器，`envPositiveInt` 已存在；其中两个字节级重复 | 见 §4 | 复用梯第 1 级 |
| P2 | 重试退避抖动包装写了两份 | `generate_scheduled_post.ts:615/734` | 复用梯第 3 级 |
| P2 | 账本读写样板第三次出现 | `podcast_ledger.ts:23-34` | 复用梯第 3 级 |
| P3 | 两条断言在复述常量 | `tests/ai-client.test.ts:139-140` | `do-not-test.md` 第 3 条 |

`generate_scheduled_post.ts` 1266 行、`foreign_tech_podcast_source.ts` 1137 行。规模本身不是罪名，
但下面几条修完，前者会掉到 800 行上下，而且掉的是重复的那部分。

---

## 1. P0：任务行为知识散落，注册表只管展示

### 证据

`blog_tasks.ts` 里的 `BLOG_TASKS` 是一张真正的注册表，但它只持有 `titlePrefix` / `tag` /
`description` / `fileName` 四个展示字段。任务**行为**上的差异被写在了别处：

```
scripts/generate_scheduled_post.ts   14 处
scripts/astro_paper_archive.ts        8 处
scripts/verify_blog_generation.ts     6 处
scripts/blog_tasks.ts                 1 处
```

同一个任务的知识被切成了五段，分别住在：

- 取源：`sourceForTask`（`generate_scheduled_post.ts:252`）——一半是 `SOURCE_BUILDERS` 表，
  另一半是 mdblist / nyt-books / magazine 三个 `if` 前置分支
- 中间聚合：`generateTask` 里 `tech-daily` / `reddit-top20` / magazine 三个 `if`（1122-1132）
- 成文：`astro_paper_archive.ts:372-379` 的八分支三元链
- 入账：`generateTask` 里 mdblist / nyt-books / magazine 三个 `if`（1181-1203）
- 发布校验：`verify_blog_generation.ts` 的 `verifySourceContract` 五分支 + `sectionHeadingPattern`
  的 nyt-books 例外（102）

### 为什么这是 P0，而不是风格问题

`AGENTS.md` 已经记了那次事故：nyt-books 去掉 `##` 分节后，`verify_blog_generation.ts` 仍硬要求
`^## `，导致周日发布在写盘后才失败。原因不是有人粗心——是**同一个任务的输出形状被写在两个文件里，
而语言层没有任何东西把它们绑在一起**。compose 层测试全绿也拦不住，因为它们根本不在一个模块。
`sectionHeadingPattern` 现在的那行三元表达式，就是这次事故留下的疤：它把「nyt-books 的正文
最高层级是 `###`」这条事实存在了离它的生产者最远的地方。

### 方案

把 `BLOG_TASKS` 从展示注册表升级成**任务规格注册表**，一个任务一条记录，行为字段可选：

```
"nyt-books-weekly": {
  展示: titlePrefix / tag / description / fileName,
  取源: (date, ctx) => ...,
  聚合: 无,
  成文: formatNytBooksWeekly,
  入账: { parse, append, relPath },
  发布契约: { 正文最高层级: /^#{2,3}\s+/m, source 必须出现: [...] },
}
```

编排层退化成「查表 → 依次调用存在的阶段」，`generateTask` 里那串 `if` 消失；
`verify_blog_generation.ts` 从注册表读契约，不再自己维护第二份任务清单。
新增任务变成加一条记录，漏掉某个阶段是类型错误而不是运行期静默走错分支。

**这个方向已经是本仓自己的习惯**，不是外来范式：`SOURCE_BUILDERS`（243）是半张表，
`recommendation_ledger.ts` 的 spec 模式是同一个思路的成品，`MAGAZINE_CONFIGS` 也是。
只是没做完，停在了「一半查表一半 if」。

### 风险与边界

- **不要一次全搬。** 建议顺序：先搬发布契约（收益最大、面积最小，直接消掉 P0 事故的复发路径），
  再搬入账，最后搬取源/成文。每步之间跑一次全 gate。
- 播客系任务（3 个）的形状与其余不同——一集一篇、多结果、封面本地化。它们值得在注册表里有一个
  显式的 `多篇产出` 标记，而不是继续靠 `isPodcastArticleTask(task)` 在四个文件里各判一次。
- magazine 系（4 个）已有 `MAGAZINE_CONFIGS`，接进新注册表时保持薄封装，不要把 config 展平。

### 验证

`pnpm run typecheck`（注册表字段是类型收敛的主力）+ `pnpm run lint` + `pnpm run test:blog`。
搬发布契约那一步额外跑一次 `pnpm run build`（动了模块边界）。
**不需要为注册表补新测试**——「某任务注册上了」正是 `do-not-test.md` 第 6 条点名的写法；
接得通由类型检查证明，行为由已有的 compose / ledger 用例证明。

---

## 2. P1：三份同构的逐条目 AI 摘要重试循环

### 证据

| 函数 | 行 | 并发 | 抖动 | 失败时 |
| --- | --- | --- | --- | --- |
| `generateJsonStageWithRetries` | 330 | 调用方给 | 无 | 抛错 |
| `summarizeRedditItem` | 644 | 3 | 有 | 返回 `{summary:null,error}`，整批容忍 |
| `summarizeMagazineItem` | 754 | 串行 | 有 | 抛错 |

三者的循环体一模一样：`for attempt` → `sleep(退避)` → `callAi(prompt, model, true)` →
`parse` → 成功写 artifact 返回；失败写 error artifact、把错误原因拼回 prompt、`writeStderr` 一条
WARN、重试。连拼回 prompt 的中文句子都几乎逐字相同（353 / 659 / 769）。

差异只有三处：并发度、要不要抖动、失败是抛还是降级。**这三处都是参数，不是逻辑。**

### 方案

保留 `generateJsonStageWithRetries` 作为唯一实现，补两个可选项：`jitterMs`、`onExhausted`
（抛错 / 返回降级值）。Reddit 与 magazine 的两个函数塌缩成各自的 `parse` 回调 + 一次调用。
per-item 的 artifact 命名（`item-NN-...`）已经是同一个模式，作为参数传入即可。

收益不只是省 80 行：现在三份实现里只有 `generateJsonStageWithRetries` 被
`tests/ai-client.test.ts:166` 覆盖，另外两份的重试路径没有任何用例。合并之后，那条已有用例
自动覆盖三个调用点——这正是 skill 说的「一个行为一次证明，取能证明它的最低层」。

### 验证

`pnpm run typecheck` + `pnpm run test:blog`。**不新增测试**：合并后的行为已被 166 那条覆盖，
再为 Reddit / magazine 各补一条，就是 `do-not-test.md` 第 11 条的「同一段代码重复穿越」。

---

## 3. P1：`parseJsonObject` 是共享原语的第二实现

`generate_scheduled_post.ts:309-316` 与 `compose_common.ts:19-25` 做同一件事：剥 ```` ```json ````
围栏、截取首个 `{` 到末个 `}`。差异只有两点：前者的结尾围栏正则少了 `i` 标志；后者解析失败时
抛的错带 label。

编排层已经从 `compose_common.ts` 引了 `parseModelJsonObject`（44 行的 import 里就有），
却又在 309 行手写了一份平行实现。直接删 309，改用 `stripJsonFence` + `JSON.parse`，
把「没有 JSON 对象」的报错信息保留下来即可。

验证：`pnpm run typecheck` + `pnpm run test:blog`（`tests/compose.test.ts:194` 已覆盖畸形输出拒收）。

---

## 4. P2：六处手写 env 数字读取器

`blog_common.ts:201` 已有 `envPositiveInt`，`blog_ai_client.ts` 与 `reddit_source_api.ts` 都在正确使用它。
但同一份三行逻辑另外还有六份：

| 位置 | 名字 | 与 `envPositiveInt` 的差异 |
| --- | --- | --- |
| `foreign_tech_podcast_source.ts:106` | `envNumber` | 允许小数 |
| `foreign_tech_podcast_source.ts:111` | `envFloat` | **与上一行逐字相同** |
| `blog_ai_client.ts:40` | `envDurationMs` | 允许小数 |
| `generate_scheduled_post.ts:298` | `retryAttempts` | 硬编码 env 名 |
| `generate_scheduled_post.ts:402` | `dailySummaryConcurrency` | 额外钳上界 8 |
| `generate_scheduled_post.ts:407` | `dailySummaryMaxCandidates` | 硬编码 env 名 |
| `mdblist_weekly_source.ts:87/92`、`xyzrank_top_episodes_source.ts:123` | 各自的 limit | 硬编码 env 名 |

`envNumber` 与 `envFloat` 字节级重复，是明确的删除对象。其余的真实差异只有两个：
「允许小数」和「钳上界」。`blog_common.ts` 加一个 `envPositiveNumber`、给 `envPositiveInt`
加可选 `max`，就能吃掉全部调用点。

这条优先级低，因为它不产生正确性风险——但它是**下一个人的取样偏差来源**：仓库里有七种读 env 的
写法时，第八个人会再写第八种。

验证：`pnpm run typecheck` + `pnpm run lint`。属于接线类改动，不需要新测试。

---

## 5. P2：另外两处小重复

**退避抖动写了两份。** `redditRetryDelayMs`（615）与 `economistRetryDelayMs`（734）逐字相同：
`retryDelayMs(attempt)` 之上加 0-1000ms 随机。并入 §2 的合并即可自然消失。

**账本读写样板第三次出现。** `podcast_ledger.ts:23-34` 的 `readLedger`（存在检查 → JSON.parse →
解析失败抛错 → 结构校验）与 `magazine_ledger.ts:33` / `recommendation_ledger.ts:28` 是同一段。
但 podcast 账本的身份逻辑确实不同——多指纹匹配 + upsert，不是 key 相等，`AGENTS.md` 也把它归为
第三种形状。

建议只抽最小的那层：一个 `readJsonLedger(file, label, validate)`，负责「不存在返回空 / 解析失败
抛错（不静默降级）/ 交给调用方做结构校验」。三个账本共用它，各自的身份逻辑不动。
**不要**试图把 podcast 账本塞进 `recommendation_ledger` 的 spec 模式——那会为了消掉 12 行样板
而给 spec 加一个只有一个使用者的指纹分支，是负收益。

`tests/ledgers.test.ts:31` 已经钉住「损坏即失败」这条不变量，合并后它自动覆盖三个账本。

---

## 6. P3：测试层的两条小瑕疵

`tests/ai-client.test.ts` 整体是好用例——它在防的是真实上过线的事故（payload 形状导致的重复故障），
注释也写清了事故内容，命中「四种情形」的第 2 条。但其中两行：

```
assert.deepEqual(jsonCalls[0].body.reasoning, { effort: "high" });
assert.equal(jsonCalls[0].body.max_output_tokens, 8192);
```

这是 `do-not-test.md` 第 3 条「复述常量」：断言和源码会被同一次编辑改掉，抓不到任何回归。
同一个测试里真正有价值的是它旁边那几行——`input` 是数组而不是字符串、JSON 指令拼在正文里、
`text` 与 `messages` 字段不存在。那些是事故本体。

建议删掉这两行。其余测试文件我没有找到该删的用例。

补充一条观察：`tests/sources.test.ts` 已 517 行，超过 skill 提的 ~300 行信号线。但它的内容确实是
「每个上游一条异常反应用例」，分工正当，暂时不建议拆——**如果**再加两三个上游，按上游族群拆成
`sources.podcast.test.ts` / `sources.web.test.ts` 更合适。

---

## 7. 明确不建议做的事

写下来是为了避免下一轮 review 又把它们提一遍：

- **不要拆 `foreign_tech_podcast_source.ts`（1137 行）。** 它长是因为一条真实的长流水线：
  RSS/Apple 双源 → 合并去重 → 下载 → ffmpeg 切片 → Gemini 多模态转写 → 成文。
  切成五个文件不会减少任何一个环节，只会让「音频这条链路在哪」变成一个要跨文件回答的问题。
  真要动，先动 §4 里它自己的两个重复 env 函数。
- **不要给注册表、路由、模板加「注册上了」的测试**（`do-not-test.md` 第 6 条）。
- **不要给 `check_conventions.ts` 加测试。** 它本身就是 gate；跑它就是验证。
- **不要引新依赖。** 本轮所有建议都在已装范围内完成，没有任何一条需要新包。

---

## 8. 建议执行顺序

每步独立可提交、可回滚，前一步不阻塞后一步：

| 步 | 内容 | 面积 | gate |
| --- | --- | --- | --- |
| 1 | 删 `parseJsonObject`，改用 `stripJsonFence`（§3） | 1 文件 | typecheck + test:blog |
| 2 | 删两条复述常量的断言（§6） | 1 文件 | test:blog |
| 3 | 合并三份 AI 摘要重试循环（§2） | 1 文件 | typecheck + test:blog |
| 4 | 收敛 env 读取器（§4） | 5 文件 | typecheck + lint |
| 5 | 抽 `readJsonLedger`（§5） | 4 文件 | typecheck + test:blog |
| 6 | **发布契约进注册表**（§1 第一刀） | 3 文件 | 全套 + build |
| 7 | 入账、取源、成文依次进注册表（§1 其余） | 4 文件 | 全套 + build |

第 1-5 步是纯收敛，风险低；第 6 步开始动跨模块契约，建议单独提交并在提交信息里点名它消掉的是
2026-08-14 那次 verify 断裂的复发路径。

---

## 9. 实施结果（2026-08-14 同日完成）

§8 的七步全部实施完毕。实际落点与计划的差异记录如下。

### 已完成

| 步 | 结果 |
| --- | --- |
| 1 | `parseJsonObject` 删除，三处调用改走 `parseModelJsonObject`（原计划漏了 `extractDescriptionFromJson` 那一处，typecheck 抓到） |
| 2 | `max_output_tokens` / `reasoning.effort` 两条断言删除 |
| 3 | `generateJsonStageWithRetries` 加 `jitterMs` / `onExhausted`，`summarizeRedditItem` 与 `summarizeMagazineItem` 塌缩成各自的 `parse` 回调；`redditRetryDelayMs` / `economistRetryDelayMs` 一并删除，抖动并入 `retryDelayMs(attempt, jitterMs)` |
| 4 | `blog_common` 新增 `envPositiveNumber`，`envPositiveInt` 加可选 `max`；删除 `envNumber` / `envFloat` / `envDurationMs` 与 mdblist、xyzrank、generate 里的五处手写 |
| 5 | `blog_common` 新增 `readJsonLedger` / `writeJsonLedger`，三个账本共用；「解析失败即抛错」这条规则现在只有一份实现 |
| 6 | 发布契约进 `BLOG_TASKS`：`bodyHeadingPattern` / `titleCarriesPrefix` / `sourceContract`。`verify_blog_generation.ts` 不再持有任何任务清单 |
| 7 | 成文表 `ARCHIVE_FORMATTERS`、取源表 `SOURCE_BUILDERS`、聚合表 `SOURCE_COMBINERS`、入账表 `LEDGER_APPENDERS`，四张全量 `Record<Task, T \| null>` |

`task === "..."` 的分支从 **4 文件 29 处降到 1 文件 9 处**，且 9 处全部在 `generateTask` 一个函数里，
按流水线顺序自上而下读。`astro_paper_archive.ts` 与 `verify_blog_generation.ts` 的 per-task 分支归零。

### 与计划的偏差

- **函数表没有放进 `blog_tasks.ts`。** 原方案想把取源/成文/入账都塞进注册表，实施时发现那会让
  `blog_tasks.ts` 引入 jsdom / adm-zip / sharp——而它被 checker、archive、verify 全都引用，
  等于把一整套 DOM 实现拖给所有人，正是 AGENTS.md 里已经写过的那条禁令。
  最终分法：**无依赖的数据与标志进注册表，需要引实现的函数留在已经引了那些依赖的文件里**，
  但一律写成全量 `Record<Task, T | null>`——漏一个任务是类型错误，`null` 是显式声明而非遗漏。
  这条分法已写进 AGENTS.md 的「任务注册表」一节。
- **`generateTask` 里保留了 9 处分支。** 它们是流程形状（reddit 一源多篇、magazine 用刊期而非运行日期
  判重、tech-daily 聚合后可能整批判空），不是 per-task 数据。做成表需要一个返回
  `ResultItem[] | {body, description, generation}` 的联合，读起来比现在的顺序 if 更难。停在这里。
- **顺带收进注册表的三个标志**：`episodeArticles`（替掉两个文件各写一份的 `isPodcastArticleTask`）、
  `weekLabelInTitle`（替掉 `taskTitle` 的 nyt-books 三元）、`wechatEnabled`（替掉 archive 里的
  `task === "tech-daily" || task === "nyt-books-weekly"`）。

### 没有新增任何测试

全部改动都是收敛与接线：行为不变，正确性由类型检查（四张全量 Record 是主力）、lint + checker、
以及已有的 41 条用例证明。合并后 `tests/ai-client.test.ts` 那条 JSON 重试用例现在同时覆盖
tech-daily、Reddit、magazine 三个调用点；`tests/ledgers.test.ts` 的「损坏即失败」现在覆盖三个账本。
按 `tests-earn-their-place.md` 的闸门，再补用例只会是同一段代码的重复穿越。

### 跑过的 gate（全绿）

```
pnpm run typecheck      # astro sync && tsc --noEmit
pnpm run lint           # eslint . && check_conventions.ts → convention check passed
pnpm run test:blog      # tests 41 / pass 41 / fail 0
pnpm run build          # astro check && astro build && pagefind
pnpm run format:check   # All matched files use Prettier code style!
```

环境：WSL 内 node v24.15.0 / pnpm 11.1.0。**未做真实发布验证**——上述都是本地 gate，
`verify_blog_generation.ts` 的改动要到下一次真实发布流水线跑过才算端到端证实。

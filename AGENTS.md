# AGENTS.md

本仓的工程约定。通用默认值（复用优先、测试必须挣得自己的位置）见 `engineering-defaults` skill；
这里只写那个 skill 明确不持有的、属于项目层的东西。**项目约定与通用 skill 冲突时，以本文件为准。**

## gate 命令

改动性质决定跑哪几个，不必每次跑全套。

| gate | 命令 | 什么时候必须跑 |
| --- | --- | --- |
| 类型检查 | `pnpm run typecheck` | 任何 `.ts` / `.astro` 改动 |
| lint + 结构化 checker | `pnpm run lint` | 任何源文件改动（含新增文件） |
| 格式 | `pnpm run format:check` | 提交前 |
| 测试 | `pnpm run test:blog` | 动了 `scripts/` 里的真实逻辑 |
| 构建 | `pnpm run build` | 动了模块边界、依赖、构建配置、产物形状 |

CI 分两个 workflow：`ci.yml` 跑 lint / format:check / build，`blog-generation-ci.yml` 跑 test:blog / typecheck。

**Node 环境**：仓库在 WSL 里，`node` / `pnpm` 由 nvm 提供。从 Windows 侧直接对 UNC 路径跑 `node` 会因为
pnpm 的符号链接解析失败（`Cannot find package 'tsx'`），必须在 WSL 内执行。

## 分层与依赖方向

依赖只能从下往上引，不能反向：

```
blog_common.ts          ← 无依赖的基础设施（fetch/重试/时区/CLI 参数/sleep/env 读取/账本读写外壳）
blog_tasks.ts           ← 任务注册表：每个任务的展示元数据 + 无依赖的行为标志与发布契约
markdown_text.ts        ← 纯文本与 Markdown 工具，只依赖 blog_common
compose_common.ts       ← compose 层共用解析工具，转出 markdown_text 的函数
*_source.ts             ← 抓取上游，产出证据 Markdown
*_compose.ts            ← 规则层：事实取自 source，模型只提供语义字段
*_ledger.ts             ← 跨运行去重账本
astro_paper_archive.ts  ← 归档层，写 frontmatter 与正文
generate_scheduled_post.ts ← 编排层
```

`astro_paper_archive.ts` 是 CLI 入口，且经 `magazine.ts` 拖入 adm-zip / jsdom / fast-xml-parser。
**不要从它引纯函数**——那会让每个 compose 模块和它们的测试都加载一整套 DOM 实现。纯函数在 `markdown_text.ts`。

## 任务注册表

一个任务的知识分两类，落点不同：

| 类别 | 落点 | 例子 |
| --- | --- | --- |
| 无依赖的数据与标志 | `blog_tasks.ts` 的 `BLOG_TASKS` | 标题/标签/文件名、`bodyHeadingPattern`、`titleCarriesPrefix`、`episodeArticles`、`wechatEnabled`、`sourceContract` |
| 需要引入实现的函数 | 各自的表，与依赖同文件 | `ARCHIVE_FORMATTERS`（archive）、`SOURCE_BUILDERS` / `SOURCE_COMBINERS` / `LEDGER_APPENDERS`（generate） |

**`blog_tasks.ts` 必须保持零第三方依赖**——它被 checker、archive、verify 全都引用，往里塞 builder
会把 jsdom 拖进所有人。函数表放在已经引了那些依赖的文件里，用**全量 `Record<Task, T | null>`**：
新增任务时漏掉某一阶段是类型错误，`null` 是显式声明「这一阶段不适用」，不是遗漏。

新增任务的完整清单：`BLOG_TASKS` 加一条 → 三张函数表各加一项（不需要就写 `null`）→
`SCHEDULED_TASK_INPUTS` 加排期。除此之外不应该再有第二处 `task === "..."`。

## 已装依赖与封装点

第三方库经内部封装使用，业务调用点不直接引。归属关系在 `scripts/check_conventions.ts` 的
`DEPENDENCY_OWNERS` 里，`pnpm run lint` 会强制：

| 包 | 唯一允许直接 import 的文件 |
| --- | --- |
| `jsdom` | `scripts/html_dom.ts` |
| `adm-zip` / `fast-xml-parser` | `scripts/magazine.ts` |
| `@mozilla/readability` | `scripts/hn_top10_source.ts` |
| `sharp` | `scripts/generate_scheduled_post.ts` |

新增调用点时加封装函数，不要加第二处 import。新增依赖前先确认 `package.json` 里已装的这批覆盖不了。

日期与时区一律用 `Intl.DateTimeFormat`（见 `blog_common.ts` 的 `bjtDateString` / `bjtTimestamp`），
不引日期库。

## 账本的两种形状

- `magazine_ledger.ts`：一期刊物一条（是否归档过）。`economist_weekly_ledger.ts` 是它的薄封装范例。
- `recommendation_ledger.ts`：一篇文章多条推荐（某作品是否推荐过）。`nyt_books_ledger.ts` 与
  `mdblist_weekly_ledger.ts` 是它的薄封装。

新任务需要去重时，套上面两个之一，**不要再抄一份 readLedger / append**。
三者的文件读写外壳统一走 `blog_common.ts` 的 `readJsonLedger` / `writeJsonLedger`，
身份与结构校验留在各自的 `validate` 回调里。
账本解析失败一律抛错，不得静默返回空账本——那会让去重集合清空并造成整批重复发布，
这条由 `readJsonLedger` 统一持有。

## 测试

runner 是 `node --test`，glob 是 `tests/*.test.ts`（新文件自动纳入，无需改脚本）。按层分文件：

| 文件 | 职责 | 允许出现具体数值吗 |
| --- | --- | --- |
| `tests/pure.test.ts` | 纯函数：排序、去重、日期窗口、分类 | 是，这里是数值的家 |
| `tests/ledgers.test.ts` | 跨运行不变量：幂等、指纹、损坏即失败 | 否 |
| `tests/sources.test.ts` | 上游异常反应：降级、丢弃、回退、契约拒收 | 否，断言分支走向 |
| `tests/compose.test.ts` | 规则层：事实取自 source、模型输出拒收、归档契约 | 否 |
| `tests/ai-client.test.ts` | AI 客户端重试与失败切换 | 否 |

fixture 放 `tests/fixtures/`，用 `fixture(...)` 读；共享 helper 放 `tests/helpers/`。
**不要为 source builder 断言渲染出来的中文句子**——那是文案快照，改一个字就红，抓不到回归。

删除或移动测试文件时无需改接线（glob 覆盖），但要确认没有别的脚本按路径点名它。

## prompts

`prompts/blog/**/*.md` 按 daily / weekly / podcast 分子目录，`resolvePromptFile` 先查根目录再查一层子目录。
文件名即任务名，或被脚本按字符串字面量点名（如 `"magazine-item-summary"`）。
下划线开头的是无条件拼接的公共片段。

孤儿模板（重命名任务后遗留）由 `pnpm run lint` 里的 checker 拦截——它不会让生成悄悄走别的分支。

## 发布契约

`scripts/verify_blog_generation.ts` 在发布流水线上校验一次运行的产出（frontmatter 字段、正文标题层级、
source 证据）。**它自己不持有任何任务清单**——要求写在 `BLOG_TASKS` 的 `bodyHeadingPattern` /
`titleCarriesPrefix` / `sourceContract` 里，和该任务的标题、标签住在一起，改输出结构时在同一屏内。

这条约定来自 2026-08-14 的事故：nyt-books 去掉 `##` 分节后，verify 仍硬要求 `^## `，
导致周日发布在写盘后失败。成因是同一任务的输出形状被写在两个文件里，而语言层没有东西把它们绑在一起；
compose 层的测试全绿也拦不住这种跨模块断裂。改 compose 输出结构时，**同步改注册表里那条契约**。

`scripts/check_conventions.ts` 与它分工不同：checker 在 lint 阶段扫仓库结构，不需要任何运行产物。

# AGENTS.md

本仓库是一个 Astro 博客（`src/`）加一组内容生成流水线（`scripts/`、`.github/workflows/`）。
这里只记不看代码看不出来的约定。通用的工程默认值（复用优先、测试要挣得自己的位置）在
`.agents/skills/engineering-defaults/`，本文件不重复它。

## 门禁

按改动类型跑，全部在 WSL 里跑（nvm 提供 node；UNC 路径会让 pnpm 的符号链接解析失败）：

| 改了什么                                             | 跑什么                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| 任何 `.ts` / `.astro`                                | `pnpm run typecheck`                                                          |
| 任何源码文件                                         | `pnpm run lint`（含 `scripts/check_conventions.ts`）、`pnpm run format:check` |
| `scripts/` 的真实逻辑                                | `pnpm run test:blog`                                                          |
| 模块边界、依赖、`astro.config.ts`、字体、内容 schema | `pnpm run build`                                                              |
| `.github/workflows/`                                 | 本地跑不了；推送后手动派发一次相关 workflow 看结果                            |

`scripts/wechat/` 是整棵搬进来的微信发布器，风格与依赖治理自成一套，不受 prettier 与 `check_conventions` 的 scripts 规则约束。

## scripts/ 的分层

依赖只能向下：
`blog_common` → `blog_tasks` → `markdown_text` / `compose_common` → `*_source` → `*_compose` → `*_ledger` → `astro_paper_archive` → `generate_scheduled_post`。

- `blog_tasks.ts` 不得引入第三方依赖。任务的展示元数据在 `BLOG_TASKS`；需要实现的阶段函数放在与依赖同处的 `Record<Task, T | null>` 表里。新任务 = 一条注册表记录 + 各表一项 + 一条 cron，不得新增 `task === "..."` 分支。
- `SCHEDULED_TASK_INPUTS`（cron → task + 时区）与 `.github/workflows/scheduled-publish.yml` 里的两份 cron→task 表必须一致，`check_conventions` 会比对。
- 第三方库经封装引用，封装文件列在 `check_conventions.ts` 的 `DEPENDENCY_OWNERS`（scripts）和 `SRC_DEPENDENCY_OWNERS`（src，目前 satori / sharp → `src/utils/renderPng.ts`）。
- 不引日期库；用 `Intl.DateTimeFormat`。
- 环境变量走 `blog_common` 的 `envBool` / `envPositiveInt` / `envPositiveNumber`，不手写真值表。
- AI JSON 阶段的重试只有一份实现：`ai_json_stage.ts` 的 `generateJsonStageWithRetries`。
- 归档稿的 frontmatter 只经 `blog_common.frontmatter()` 生成，`wechat` 块与额外顶层键走它的参数，不要对返回字符串做 `.replace`。

## 账本与交接

- 账本只有 `readJsonLedger` / `writeJsonLedger` 一个读写壳。解析失败必须抛，绝不静默返回空账本——那会让当天整批重复发布。
- 只消费父任务已提交产物的编排器（Reddit 人生稿、Reddit 图片消息、微博热搜微信稿）共用 `committed_handoff.ts`：`HEAD` 必须等于 `--upstream-sha`，交接路径不得有未提交改动。
- 图片消息的卡片 PNG 不进仓库：manifest 带 `release` 段，workflow 在提交 run.json 之前 `release_assets.ts upload`，同步前 `restore` 并核对 SHA-256。契约见 `scripts/release_assets.ts` 头部注释。

## workflows

- 微信同步只有 `wechat-sync.yml` 一份；调用方负责算出稿件路径列表传进去。
- 定时发布任务的唯一入口是 `scheduled-publish.yml`；单独补跑用 `scheduled-posts.yml` 传 task。
- `blog-publish.yml` 的并发组按 task 分；GitHub 同组只留一个排队运行，多余的会被静默 cancel，不要再把多个 cron 塞进一个组。
- 推送前先提交、rebase、再构建、再推送；不用 `-X theirs`。
- 管道后取退出码用 `${PIPESTATUS[0]}`，`run:` 默认 shell 没有 pipefail。
- cron 分钟数避开 0/5/10/15/30；调度延迟可达小时级，靠 `needs` 链而不是错开分钟来排序。

## 测试

- 一个行为一次证明，取能证明它的最低层。注册表里“某任务注册上了”不测，类型检查已经覆盖。
- 不断言生成器输出的中文散文；只断言结构、边界与幂等性。
- 需要 git 仓库的用例用 `tests/helpers/mocks.ts` 的 `tempDir` 起临时仓库。

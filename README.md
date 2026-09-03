# bhwa233 博客

基于 [AstroPaper](https://github.com/satnaing/astro-paper) v6 的中文技术博客，加上一组无人值守的内容生成流水线：站点部署在 Cloudflare Pages（<https://blog.bhwa233.com/>），文章由 GitHub Actions 定时抓取、由模型整理后提交进仓库，部分稿件同步到微信公众号草稿箱。

## 仓库结构

| 目录                 | 内容                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/`               | Astro 站点。文章在 `src/content/posts/zh-cn/`，`/en/` 路由树已就位但暂无英文内容                      |
| `scripts/`           | 内容流水线：取源、成文、账本、归档、微信同步。分层与约定见 `AGENTS.md`                                |
| `scripts/wechat/`    | 微信公众号发布器（整棵搬入，自成一套）                                                                |
| `video/`             | Remotion 工作区，渲染 Reddit 竖屏视频与图片消息卡片                                                   |
| `data/`              | 各流水线的归档与账本（run.json、ledger）。大体积产物走 GitHub Release，见 `scripts/release_assets.ts` |
| `docs/`              | 每条流水线一份说明                                                                                    |
| `.github/workflows/` | `scheduled-publish.yml` 是定时发布的唯一入口，`wechat-sync.yml` 是微信同步的唯一实现                  |
| `prompts/blog/`      | 模型提示词模板，每个模板必须被脚本或任务名引用                                                        |

## 本地开发

需要 Node 24 与 pnpm 11（版本以 `.github/actions/setup/action.yml` 为准）。在 WSL 里跑；Windows 侧经 UNC 路径会让 pnpm 的符号链接解析失败。

```sh
pnpm install
pnpm run dev            # http://localhost:4321
pnpm run search:index   # dev 下需要站内搜索时，先构建一次再跑这个生成索引
pnpm run build          # astro check + astro build + pagefind
```

门禁：

```sh
pnpm run typecheck
pnpm run lint           # eslint + scripts/check_conventions.ts
pnpm run format:check
pnpm run test:blog      # scripts/ 的单元与集成用例
pnpm run test:wechat    # scripts/wechat 的用例
```

站点配置在 `astro-paper.config.ts`；Google Site Verification 通过 `PUBLIC_GOOGLE_SITE_VERIFICATION` 环境变量注入。

## 流水线

每条流水线都是「取源 → 成文 → 归档提交 → （可选）微信同步」，由 `blog-publish.yml` 统一执行、`scripts/blog_tasks.ts` 注册任务。定时表在 `scheduled-publish.yml`，与 `blog_tasks.ts` 的 `SCHEDULED_TASK_INPUTS` 同步，lint 会核对。

手动补跑：`scheduled-posts.yml` 传任务名；单篇重推微信：`sync-wechat-draft.yml` 传稿件路径。

各流水线的细节与坑见 `docs/`。

## 部署

Cloudflare Pages 通过 GitHub App 监听 `main`，每次提交都会构建；带 `[skip ci]` 的账本提交除外。仓库里没有部署 workflow。

## 许可证

站点模板部分为 MIT（AstroPaper），其余为 PolyForm Noncommercial 1.0.0，见 `LICENSE`。

# 通用 Substack 长文翻译流水线技术方案

状态：已实现并投入生产
最后更新：2026-08-21

## 1. 背景

目标是把公开长文栏目的新文章自动转换为中文文章，并纳入 astro-paper 现有的生成、校验、归档和 CI 发布流程。栏目通过同一份受信注册表接入；其中需要补充外部来源或人工判断选题的栏目只允许手动 dispatch，不进入每日 `all`。

这不是“每加一个栏目就复制一套 task 和 workflow”的方案。仓库只增加一个固定任务 `substack-translation`，运行时传入 `publication` 栏目 key；栏目名称、作者、Feed、站点、标签和清洗规则统一从受信配置表解析。

文章必须在正文开头明确展示原作者、原栏目、原文链接和原始发布日期。署名与链接是产品要求，但不自动替代翻译转载授权；获得授权的栏目可额外显示“经授权翻译”。

## 2. 目标与非目标

目标：

- 一个通用任务支持任意数量的已登记 Substack 栏目
- CI 通过 `publication=<key|all>` 选择栏目，不接受任意远程 URL
- 一篇原文对应一篇中文文章，保留原文结构、引用、列表和图片；正文链接只保留锚文本
- 翻译忠于原文，不摘要、不扩写、不补充原文以外的事实
- 根据 canonical URL / GUID 跨运行去重，重跑不重复发布
- 单篇失败不阻断其他栏目；成功文章可以先归档，最终再报告部分失败
- 不依赖浏览器、Cookie 或登录态，只读取公开 RSS 的完整正文
- 原始正文只保留在短期 CI artifact，不提交进 Git 仓库

非目标：

- 不抓取付费文章、订阅者专享正文或私有 Feed
- 不绕过登录墙、paywall、Cloudflare challenge 或作者设置的访问限制
- 不把多个栏目合并成一篇日报
- 不由模型重新拟写观点、事实或文章结构
- 不默认镜像原文全部图片；图片策略由栏目配置显式决定
- 不允许 workflow input 直接传 `feedUrl`，避免 SSRF 和不可审计的数据源变化

## 3. 已验证的可行性

2026-08-20 至 2026-08-21 使用无 Cookie、无浏览器的普通 HTTP 请求实测：

| 栏目                    | Feed                                             | Feed 大小 | 条目数 | 最新正文纯文本 | 最新正文图片 | 结果                       |
| ----------------------- | ------------------------------------------------ | --------: | -----: | -------------: | -----------: | -------------------------- |
| The Marginalian         | `https://feeds.feedburner.com/brainpickings/rss` |    365 KB |     20 |    31,298 字符 |           17 | Feed、文章页、首图均为 200 |
| The Curiosity Chronicle | `https://sahilbloom.substack.com/feed`           |    299 KB |     20 |     9,190 字符 |            1 | Feed、文章页、首图均为 200 |
| After Babel             | `https://www.afterbabel.com/feed`                |    883 KB |     20 |    15,105 字符 |            2 | Feed、文章页、首图均为 200 |
| The Honest Broker       | `https://www.honest-broker.com/feed`             |    522 KB |     20 |    16,099 字符 |            3 | 完整 Substack Feed         |
| One Useful Thing        | `https://www.oneusefulthing.org/feed`            |    916 KB |     20 |    12,982 字符 |            9 | 完整 Substack Feed         |
| Where's Your Ed At      | `https://www.wheresyoured.at/rss/`               |    733 KB |     15 |    52,071 字符 |            3 | 完整 Ghost RSS             |
| Roots of Progress Institute | `https://rootsofprogress.org/feed/`           |     93 KB |     10 |     6,393 字符 |            2 | 完整 RSS                    |
| Experimental History    | `https://www.experimental-history.com/feed`      |  1,018 KB |     20 |    20,229 字符 |            9 | 完整 Substack Feed         |
| Noahpinion               | `https://www.noahpinion.blog/feed`               |  1,171 KB |     20 |    22,514 字符 |            3 | 完整 Substack Feed         |
| Construction Physics    | `https://www.construction-physics.com/feed`       |    586 KB |     20 |     3,851 字符 |            3 | 完整 Substack Feed         |
| The Intrinsic Perspective | `https://www.theintrinsicperspective.com/feed`  |  1,075 KB |     20 |    13,230 字符 |            7 | 完整 Substack Feed         |
| Astral Codex Ten        | `https://www.astralcodexten.com/feed`             |    707 KB |     20 |    10,454 字符 |            0 | 完整 Substack Feed         |
| SatPost                 | `https://www.readtrung.com/feed`                 |    3.4 MB |     20 |    43,976 字符 |           28 | Feed、文章页、首图均为 200 |

十三个 Feed 都在 `content:encoded` 中提供完整 HTML，而不是只有 `description` 摘要。Substack 的 XML 通常压成一行，SatPost 又包含大量图片属性，因此必须设置响应大小上限，不能沿用通用 `fetchText` 当前 1 MB 的默认值；上限由全局 `SUBSTACK_LIMITS.maxFeedBytes` 统一给出，取值覆盖最大的 SatPost。

解析命名空间交给 Feedsmith，标准字段读取 `item.content?.encoded`。不得静默回落到几十个字符的 `description`，否则会把摘要误判为完整正文。

The Marginalian 发文频率可能达到一天多篇；Curiosity Chronicle 近期约一周两篇；SatPost 的 Feed 最新文章停在 2026-06-26。CI 应采用“每日轮询 + 账本去重”，而不是假定所有栏目都按同一星期几更新。

## 4. 总体架构

```text
workflow input: publication=<key|all>
  -> 受信配置表解析栏目，不接受任意 URL
     -> 匿名 GET 公开 RSS
        -> Feedsmith 解析 + 来源契约校验
           -> canonical/GUID 与 ledger 去重
              -> content:encoded 栏目级 DOM 删除
                 -> Turndown 转 Markdown + 转换前后对账
                    -> 顶层块切分 + 链接占位符
                       -> token 预检 + 整篇单次忠实翻译
                          -> 文章级缓存 + 完成原因校验
                             -> 块 ID / 顺序 / 链接完整性校验
                                -> 保留事实链接，解开图片外层跳转
                                   -> Markdown 重组 + 署名来源块
                                      -> Astro frontmatter + 动态文件名
                                         -> 内容构建检查
                                            -> 更新 ledger
                                               -> Git commit / push
```

建议复用现有组件：

- `scripts/html_dom.ts`：`content:encoded` 的 HTML DOM 清洗；业务模块不直接 import jsdom
- `scripts/blog_common.ts`：日志、通用文本处理，以及 `readJsonLedger` / `writeJsonLedger`
- `scripts/restricted_fetch.ts`：原生 fetch 的逐跳 HTTPS/host 校验、流式响应上限和超时；Feed 代理响应与图片共用
- `scripts/blog_ai_client.ts`：主模型、fallback、冷却和超时处理
- `scripts/magazine_ledger.ts`：账本模块的形状模板（key 构造、路径解析、环境变量覆盖）
- `blog-publish.yml`：复用其 Node/pnpm、artifact、构建、提交与有限 push 重试方式，不把新任务塞进既有封闭 task union

新增 `scripts/substack_feed.ts` 作为 Feedsmith 的唯一封装点，新增 `scripts/html_to_markdown.ts` 作为 Turndown 的唯一封装点，并登记进 `scripts/check_conventions.ts` 的 `DEPENDENCY_OWNERS`。第三方库不能从业务编排模块直接 import。

不改动 `scripts/hn_top10_source.ts` 的 `@mozilla/readability`。HN 输入是完整网页，需要发现主内容；本任务的输入已经是 Feed 明确提供的 `content:encoded` 正文，两者职责不同。

### 4.1 开源库选型

| 能力             | 选型                    | 约束                                                                                 |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| RSS / Atom 解析  | `feedsmith@^2.9.6`      | 固定稳定版 2.x，不使用仍在 beta 的 3.x；只解析已受限抓取的字符串，不让库自行请求 URL |
| HTML 转 Markdown | `turndown@^7.2.4`       | JSDOM 完成栏目级删除后再转换；不承担 HTML 安全或正文发现                             |
| 运行时数据合同   | `zod@^4.4.3`            | 校验栏目配置、模型 JSON、ledger 与 result；作为脚本的直接依赖声明                    |
| 图片类型嗅探     | `file-type@^22.0.2`     | 只提供 magic-byte MIME/扩展名提示，必须再经过响应上限和 sharp 解码                   |
| 图片元数据与解码 | 已有 `sharp`            | 校验格式、宽高、像素总数，并实际解码；不新增第二个图像处理器                         |
| 模型调用与用量   | 已有 AI SDK             | 保留 `usage`、`totalUsage`、`finishReason`；模型 JSON 再由 Zod 做本地校验            |
| 跨运行缓存       | 已有 `actions/cache@v4` | 缓存内容寻址的完整文章响应，不引入本地缓存框架                                       |

未采用 Defuddle：它适合从完整网页发现并标准化主内容，但官方仍将其标为 work in progress，而且默认会删除与文章标题重复的首个标题、标准化 heading、展开部分响应式图片。对已是正文的 `content:encoded` 来说，这些行为会违反结构不改写合同。2026-08-20 对三个目标 Feed 的验证中，Turndown 保留了全部原始 heading 和 image 数量；Defuddle 默认把 Curiosity Chronicle 的 heading 从 3 个变成 2 个，把 SatPost 图片从 28 个变成 30 个。

未采用 `rss-parser`：它的最新 npm 发布停在 2023 年，`content:encoded` 需要额外 `customFields` 配置；Feedsmith 2.x 原生保留 Content namespace、类型定义完整，且已用三个真实 Feed 验证 `generator` 与 `item.content.encoded`。

不直接复用 `archivePost` 的动态文章归档。它目前假设 task 决定标题、标签和文件名，且 `episodeArticles` 的标题逻辑专属于播客。Substack 分支应使用专用 `archiveSubstackTranslation`，但返回与现有 archive result 兼容的结果结构。

## 5. 栏目配置

新增 `scripts/substack_publications.ts`，唯一对外标识是稳定的 `key`：

```ts
type PatternConfig = {
  source: string;
  flags?: string;
};

type NewsletterPublication = {
  key: string;
  kind: "substack" | "rss";
  displayName: string;
  author: string;
  feedUrl: string;
  siteUrl: string;
  feedHosts: string[];
  articleHosts: string[];
  imageHosts: string[];
  tag: string;
  focus?: string[];
  priority?: "high" | "medium" | "low";
  topics?: string[];
  selectionMode?: "automatic" | "manual";
  selectionRule?: string;
  enabled: boolean;
  startAt: string;
  imagePolicy: "none" | "remote" | "mirror";
  removeSelectors?: string[];
  cutBeforePatterns?: PatternConfig[];
  cutAfterPatterns?: PatternConfig[];
  dropPatterns?: PatternConfig[];
  excludeTitlePatterns?: PatternConfig[];
  extractionAudit?: {
    minTextRatio: number;
  };
  translationLengthRatio?: {
    warnMin: number;
    warnMax: number;
    failMin: number;
    failMax: number;
  };
  authorizedTranslation?: boolean;
};
```

`feedHosts`、`articleHosts`、`imageHosts` 分别约束 Feed 重定向、item/canonical URL 和图片请求，三者不能合并为一个白名单。正则以可序列化的 source/flags 保存，在配置加载阶段统一编译和校验；CI artifact 必须记录本次实际生效的配置。

`extractionAudit.minTextRatio` 是第 9.1 节提取对账的文本保留下限，默认 0.95；链接、图片、列表项和标题层级序列不设容差，必须完全一致。栏目实测后可按需放宽，但放宽值要写进配置而不是散落在代码里。

初始配置示意：

```ts
export const NEWSLETTER_PUBLICATIONS = {
  "curiosity-chronicle": {
    kind: "substack",
    displayName: "The Curiosity Chronicle",
    author: "Sahil Bloom",
    feedUrl: "https://sahilbloom.substack.com/feed",
    siteUrl: "https://sahilbloom.substack.com/",
    feedHosts: ["sahilbloom.substack.com"],
    articleHosts: ["sahilbloom.substack.com", "www.sahilbloom.com"],
    imageHosts: ["substackcdn.com", "substack-post-media.s3.amazonaws.com"],
    tag: "Curiosity Chronicle",
    cutBeforePatterns: [
      {
        source:
          "^Forwarded this email\\? Join [\\d,.]+(?:[KMB])?\\+ (?:other )?readers here\\.$",
        flags: "i",
      },
    ],
  },
  "after-babel": {
    kind: "substack",
    displayName: "After Babel",
    author: "Jon Haidt and Zach Rausch",
    feedUrl: "https://www.afterbabel.com/feed",
    siteUrl: "https://www.afterbabel.com/",
    feedHosts: ["www.afterbabel.com", "afterbabel.com"],
    articleHosts: ["www.afterbabel.com", "afterbabel.com"],
    imageHosts: ["substackcdn.com", "substack-post-media.s3.amazonaws.com"],
    tag: "After Babel",
    removeSelectors: [".button-wrapper"],
  },
  satpost: {
    kind: "substack",
    displayName: "SatPost",
    author: "Trung Phan",
    feedUrl: "https://www.readtrung.com/feed",
    siteUrl: "https://www.readtrung.com/",
    feedHosts: ["www.readtrung.com", "readtrung.com"],
    articleHosts: ["www.readtrung.com", "readtrung.com"],
    imageHosts: ["substackcdn.com", "substack-post-media.s3.amazonaws.com"],
    tag: "SatPost",
  },
  marginalian: {
    kind: "rss",
    displayName: "The Marginalian",
    author: "Maria Popova",
    feedUrl: "https://feeds.feedburner.com/brainpickings/rss",
    siteUrl: "https://www.themarginalian.org/",
    feedHosts: [
      "feeds.feedburner.com",
      "www.themarginalian.org",
      "themarginalian.org",
    ],
    articleHosts: ["www.themarginalian.org", "themarginalian.org"],
    imageHosts: [
      "www.themarginalian.org",
      "themarginalian.org",
      "i0.wp.com",
      "i1.wp.com",
      "i2.wp.com",
    ],
    tag: "The Marginalian",
  },
} as const;
```

实际配置必须填写所有安全与发布字段；上例只展示栏目差异。新增栏目只修改该表并补一个配置契约测试，不新增 task、source builder、archive formatter 或 workflow。

`kind: "substack"` 要求 Feed 的 `<generator>` 为 Substack；`kind: "rss"` 只使用通用 RSS 2.0 合同。The Marginalian、Where's Your Ed At 和 Roots of Progress Institute 走后者，不能在日志和文章中错误标为 Substack。`focus` 保存栏目关注方向，进入 effective config 和诊断 artifact；它不改变忠实翻译合同，也不用于删选或改写原文。

`publication=all` 只展开 `selectionMode=automatic` 的栏目，并按 `priority` 的 high、medium、low 顺序处理。`manual` 栏目仍可通过 workflow 的单栏目选项触发。`topics` 和 `selectionRule` 会写入 effective config 与 artifact，供人工选题审计；明确可机械判断的禁选类型同时写入 `excludeTitlePatterns`。忠实翻译任务不会自行检索资料，因此要求补充独立来源或主流研究的栏目必须设为 `manual`。

### 5.1 全局阈值

抓取与翻译的护栏不进栏目配置，集中在 `scripts/substack_contracts.ts` 的 `SUBSTACK_LIMITS`：

| 常量 | 值 | 作用 |
| --- | ---: | --- |
| `maxFeedBytes` | 16_000_000 | RSS 响应体上限，纯内存边界 |
| `maxImageBytes` | 12_000_000 | 单图响应体上限 |
| `maxImagePixels` | 40_000_000 | 解码后像素上限，防解压炸弹 |
| `maxPostsPerRun` | 1 | 每次运行每个栏目处理几篇 |
| `maxPostsPerRunCeiling` | 5 | 手动 `--max-posts` 的硬顶 |
| `maxEstimatedTokensPerArticle` | 200_000 | 单篇预估上限，只作跑飞护栏 |
| `publicationTokenBudget` | 400_000 | 每个栏目每次运行的 token 预算 |

这些拦的不是开销，而是 OOM、解压炸弹、paywall 残稿和上下文超限，所以取值一律按最宽松那个：误杀一篇本来能翻的文章，比多跑一次更糟。

`publicationTokenBudget` 必须 ≥ 2 × `maxEstimatedTokensPerArticle`——开 fallback 时按估算量的两倍预留，否则长文永远预留失败。

早期版本让每个栏目各带一份这些字段，13 条配置里 78 行只有三种取值，差异纯粹是按各自实测微调，没有语义分歧。收敛成常量后 `effective-config.json` 会额外快照一份 `limits`，保证事后仍能看到本次生效的上限。

## 6. CLI 与 workflow 输入

生成入口：

```text
node --import tsx scripts/generate_substack_translations.ts \
  --publication curiosity-chronicle \
  --run-date 2026-08-20 \
  --max-posts 1 \
  --token-budget 100000 \
  --artifacts-dir artifacts/substack
```

参数合同：

| 参数              | 含义                                                           |
| ----------------- | -------------------------------------------------------------- |
| `--publication`   | 必填；配置 key 或 `all`                                        |
| `--run-date`      | CI 运行归档日，不替代原文的 `pubDate`                          |
| `--max-posts`     | 可选；覆盖每次一篇的默认值，上限是 `maxPostsPerRunCeiling`（5）|
| `--force`         | 对已入账 canonical URL 重新翻译；仅手动运行开放                |
| `--backfill`      | 手动扩大候选窗口到最近 N 篇；定时任务禁止                      |
| `--token-budget`  | 可选；只能收紧每栏目 400,000 token 的预算                      |
| `--dry-run`       | 抓取、清洗、预估 token 和校验，但不调用模型、不写文章或 ledger |
| `--artifacts-dir` | 保存本次 source、prompt、模型响应、配置和用量                  |

新增 `.github/workflows/publish-substack-translations.yml`：

- `schedule` 每天轮询一次，传 `publication=all`
- `workflow_dispatch` 允许选择已登记 key、`all`、`force` 和 `backfill`
- 使用现有 `AI_*` / `AI_FALLBACK_*` secrets，不增加栏目级 secret
- 将现有 `REDDIT_SOURCE_API_URL` / `REDDIT_SOURCE_API_TOKEN` secrets 映射为 `SUBSTACK_FETCH_PROXY_URL` / `SUBSTACK_FETCH_PROXY_TOKEN`，统一复用已部署的 `yt-dlp-fastapi`
- concurrency 对所有栏目使用同一个 `substack-translation-${{ github.ref }}` group，避免 `all` 与手动单栏目运行同时写入；不取消正在翻译的长文
- timeout 建议 180 分钟；栏目顺序执行，单篇内部不并发打模型
- token 预算按栏目独立计，默认每栏目 400,000；CLI 只能调低，不能调高

生成器写入独立的 `substack-translation-result.json`。workflow 保持现有 partial-success 顺序：生成步骤保留退出码但不立即中断，先上传 artifact、构建并提交成功文章，最后汇总失败项并把 job 标红。

`publication` 仍是自由字符串输入，但生成器必须先查配置表；未知值在发出任何网络请求之前失败。

## 7. Feed 获取与来源契约

Feed 获取只允许通过带 Bearer 认证的 `yt-dlp-fastapi /v1/proxy`。不先尝试直连，也不保留 Substack API、文章页或其他第三方代理回退；`SUBSTACK_FETCH_PROXY_URL` 或 `SUBSTACK_FETCH_PROXY_TOKEN` 缺失时，必须在任何网络请求之前失败。

每个栏目依次执行以下检查：

1. `feedUrl` 必须是配置中的 HTTPS URL，不从 item 或重定向结果覆盖
2. 客户端在调用代理前校验 Feed 初始 URL 的 host 位于 `feedHosts`
3. 代理基址必须是无内嵌凭据的 HTTPS URL；客户端只向该 host 发送 Bearer token
4. 代理负责目标地址和每次重定向的公网 IP/SSRF 校验；客户端最多重试 3 次、单次 20 秒，并对代理响应继续执行 `maxFeedBytes` 流式硬限制
5. 最终响应为 2xx，`Content-Type` 接受 XML/RSS
6. RSS 至少有一个 `item`，每项必须有 title、GUID 或 link、合法 pubDate
7. `kind=substack` 时校验 `<generator>Substack</generator>`
8. item link 与 canonical URL 解析后的 host 必须在 `articleHosts`
9. 编译并应用 `excludeTitlePatterns`；命中的 item 跳过并记录具体规则
10. 只读取公开 `content:encoded`；缺失时跳过，不抓文章页补全。不设正文长度下限——短文同样是完整原文，按字符数拒稿会误杀真短篇；paywall 由截断标记识别，清洗误删由提取对账兜底
11. 命中付费、订阅者专享或截断标记时跳过，并输出明确原因

首次启用栏目时默认只处理 `startAt` 之后的最新一篇，不能把 Feed 内 20 篇历史文章一次性全部翻译。`--backfill N` 只把候选窗口扩大到最近 N 篇，不覆盖发布上限；实际处理数是 `min(N, --max-posts ?? maxPostsPerRun, 剩余 token 预算可容纳篇数)`，其中 `--max-posts` 本身受 `maxPostsPerRunCeiling` 约束。未传 `--backfill` 时仍按栏目正常候选规则执行。

## 8. 去重与账本

每个栏目独立使用现有 JSON ledger 约定：`data/substack-translations/<publication>/issues.json`。读写复用 `scripts/blog_common.ts` 的 `readJsonLedger` / `writeJsonLedger`，不再维护一份所有栏目共享的文件。

```json
{
  "version": 1,
  "issues": [
    {
      "guid": "https://sahilbloom.substack.com/p/example",
      "canonicalUrl": "https://sahilbloom.substack.com/p/example",
      "sourcePublishedAt": "2026-08-19T20:00:58Z",
      "sourceSha256": "...",
      "status": "published",
      "postPath": "src/content/posts/zh-cn/curiosity-chronicle-20260819-example.md",
      "translatedAt": "2026-08-20T00:00:00Z",
      "model": "...",
      "usage": {
        "inputTokens": 12000,
        "outputTokens": 16000,
        "totalTokens": 28000
      }
    }
  ]
}
```

身份规则：

- 主键是规范化 canonical URL；去掉 tracking query 和 fragment，但保留实际路径
- GUID 作为交叉检查，不能覆盖 canonical URL
- 同 URL、同 source hash：稳定跳过
- 同 URL、不同 source hash：默认记录 `source-changed` 警告但不覆盖已发布译文
- 只有显式 `--force` 才允许重新翻译，并更新原文章而不是创建第二篇
- ledger 与文章在同一个 Git commit 中更新；模型失败时不提前占位
- ledger 解析或版本不合法时立即失败，不能把损坏文件当作空账本覆盖

Feed 选择应按 `pubDate` 从旧到新处理，避免积压时先发布更新文章、后发布旧文章。达到 `maxPostsPerRun` 后停止，其余留给下一次轮询。

全局 workflow concurrency 是避免同分支并发写的第一道保护。push 前仍要 fetch/rebase 并有限次数重试；per-publication ledger 让不同栏目重试时只涉及彼此独立的文件。

## 9. HTML 清洗与中间块模型

清洗在模型调用之前完成，输入只来自 `content:encoded`。**高置信度删除由确定性规则做；只有边界推广块交给模型分类；格式转换交给 Turndown**：

1. 用 `parseHtml(contentEncoded, itemLink)` 构造 DOM，相对链接按 item URL 解析
2. 删除栏目专属噪音：Substack 订阅按钮、分享按钮、评论入口、publication footer，再应用栏目级 `removeSelectors`
3. 根据 `cutBeforePatterns` / `cutAfterPatterns` 去掉固定赞助、推荐和订阅尾巴，再用栏目级 `dropPatterns` 与通用高置信度模式删掉正文中间的推广块；删块后连排的分隔线折成一条，首尾的直接去掉
4. 删除通用危险或非正文标签，把清洗后的 DOM 交给 `scripts/html_to_markdown.ts` 调用 Turndown，得到 Markdown
5. **转换前后对账**（见 9.1），任一项超阈值直接判该篇失败
6. 按 Markdown 顶层块切分成中间块，URL 全部替换为带块归属的 `URL_BBBB_NNN` 占位符，拒绝 `javascript:`、`data:` 和未知协议
7. 给剩余的短订阅、捐赠、分享候选块标记 `mayDropPromo`；模型只能把这些候选块返回为空，其他空块一律拒绝

第 2、3 步必须跑在 Turndown 之前：订阅 CTA、赞助段和推荐尾巴会被当作普通正文保留；而一旦转成 Markdown，CSS 选择器就失效了，只能退回正则去猜。

通用标签删除（`script`、`style`、`form`、`button`、`svg`、iframe、播放器、跟踪像素）和相对 URL 转绝对仍由 JSDOM 封装负责；HTML 到 Markdown 的嵌套列表、行内链接、代码块和引用转换由 Turndown 负责，不自写转换器。Turndown 不负责安全校验，转换结果仍要进入受限 mdast/block 合同。

模型不直接接收原始 HTML。中间块示意：

```json
{
  "id": "b-0012",
  "kind": "paragraph",
  "markdown": "The original paragraph with [anchor](URL_0012_003).",
  "mayDropPromo": false
}
```

代码记录每个顶层块的 mdast `kind`，并把它作为模型上下文；模型响应只返回 ID 与 Markdown。heading / list / blockquote / code 的实际结构仍从 Markdown AST 重新计算，不能信任模型回传类型。

全部中间块会作为同一篇文章一次性提交给模型，而不是拆成多个翻译请求。翻译完成后代码恢复 URL，并验证：

- block ID 集合与顺序完全一致；只有 `mayDropPromo=true` 的块允许返回空内容
- 块类型标记（行首 `#`、`-`/`1.`、`>`、`![`、`---`）逐块一致
- `URL_*` 占位符数量和归属块完全一致
- 列表项数量不变
- 引用块仍是引用块
- 模型没有新增链接、标题或总结段；事实来源和脚注链接完整恢复

### 9.2 三类噪音与对应武器

| 噪音 | 位置 | 武器 |
| --- | --- | --- |
| 订阅组件、分享条、页脚 | 有稳定 class | `removeSelectors` |
| 捐赠段、订阅段、延伸阅读 | 文章尾部 | `cutAfterPatterns` |
| 订阅 CTA 标题 | **正文中间** | `dropPatterns` |

`dropPatterns` 是必需的第三种：截断类规则一旦命中正文中部就会砍掉后半篇，而中插 CTA 的标题往往没有 class。它只删命中的那个顶层块，不动前后。

三者都跑在 DOM 阶段、**翻译之前**，所以模式必须写**英文原文**，不是成稿里看到的中文译文。写成中文一条都命中不了。

已登记的两条实测规则：

- **marginalian**：`^Complement\b` 与 `^donating = loving`。2026-08-21 抓的 20 篇里 `donating = loving` 每篇都有且总在末尾；`Complement` 出现在其中 9 篇，每篇仅一次且紧挨在 donating 之前，因此拿它当截断点不会腰斩正文。
- **honest-broker**：`^Please support my work`。CTA 是 `<div><hr></div>` 夹着一个无 class 的 `h3`/`h4` 加一个 `.button-wrapper` 按钮；按钮走选择器，标题只能按文本删。

### 9.3 Substack 空提及

Substack 的 @提及在 RSS 里是**空的** `<span data-component-name="MentionToDOM">`，名字只存在于 `data-attrs` 的 JSON 里，由客户端渲染。不还原就会得到「参见 的《……》」这种缺主语的残句，而且译文里看不出少了东西——模型只会照着残缺的英文翻。

清洗阶段读 `data-attrs.name` 回填为文本。2026-08-21 实测 experimental-history 单个 Feed 就有 28 处。

### 9.1 转换对账

Turndown 是确定性的格式转换器，不做主内容评分，但未知标签、自定义 rule 或上游 HTML 变化仍可能丢失结构。这个失败模式必须在本节拦住：block ID 是在转换之后才编的，所以第 10 节之后的完整性校验无法发现转换前丢失。

对账项，比较第 3 步产物与第 4 步产物：

| 项             | 判定           |
| -------------- | -------------- |
| 可见文本字符数 | 低于容差即失败 |
| 链接数量       | 必须相等       |
| 图片数量       | 必须相等       |
| 列表项数量     | 必须相等       |
| 标题层级序列   | 必须完全一致   |

标题层级必须逐项比对，避免 converter rule 或上游标签变化把 heading 降成普通段落。

容差由栏目配置 `extractionAudit` 给出；对账结果无论通过与否都写进 artifact。

### 9.2 转换器验证结果

2026-08-20 使用三个真实 Feed 验证 Turndown 7.2.4：The Marginalian 的 3 个 heading / 17 张图片、Curiosity Chronicle 的 3 个 heading / 1 张图片、SatPost 的 7 个 heading / 28 张图片均在转换后保持数量。实现仍以缩减 fixture 固定结构合同，不把线上全文提交到仓库。

## 10. 整篇单次翻译

每篇文章只调用一次模型。请求同时包含来源元数据、标题、description 和清洗后的全部正文块，模型返回一份完整 JSON：

```json
{
  "title": "中文标题",
  "description": "中文简介",
  "blocks": [
    { "id": "b-0012", "markdown": "中文译文……[锚文本](URL_0012_003)。" }
  ]
}
```

`description` 是文章卡片上的一行完整主题短语，长度为 4–20 个码点，不以「本文」开头或标点结尾。提示词要求模型直接满足合同；若模型违约，代码从中文标题中选择一个完整短句兜底并记录 `warning`，不再按字符生硬截断。

提示词约束：

- 忠实完整翻译，不摘要、不删减、不扩写
- 保留人名、书名、机构名、数字、单位和不确定性
- 专有名词首次出现可使用“中文（English）”，后续保持一致
- 不把作者观点改写成编辑部观点
- 不添加“以下是翻译”“总结”“延伸阅读”等原文不存在的结构
- 只有输入标为 `mayDropPromo=true` 且确属操作性推广的块可以置空；不得删除观点、事实、例子、引文或脚注

不提供自动分块或截断降级。请求前必须估算输入 token、预期输出 token 和 JSON/提示词开销；预计超过模型上下文、模型最大输出或全局 `maxEstimatedTokensPerArticle` 时，直接把文章标记为 `article-token-limit` 并报警，不能只翻译前半篇。

### 10.1 Token 预算

- 单篇输入与输出的估算总量硬顶 `maxEstimatedTokensPerArticle`（200,000），超出记 `article-token-limit` 且不发请求
- 预算按栏目独立计，默认每栏目 `publicationTokenBudget`（400,000），fallback 和重试产生的 token 全部计入。**不是整次运行共享一份**：`all` 会串起十几个栏目，共享计数器会让排在前面的长文栏目把后面的全部饿死，而处理顺序按 `priority` 固定，饿死的永远是同一批
- 发起调用前先预留该文章的估算总量；该栏目剩余预算不足时停止处理它后续的文章，并记录 `publication-token-budget-exhausted`，不影响其他栏目
- 模型响应后用 provider 返回的实际 input/output/total usage 冲销预留值；provider 不返回 usage 时按预留量计费，不能按零处理
- 日志按文章、栏目和整次运行输出估算量及实际量；`result.json` 和 ledger 保存最终模型与实际 usage
- `--token-budget` 只能调低栏目预算；不能绕过单篇上限、模型上下文或最大输出限制

当前实测最长的 SatPost 正文为 43,976 字符，预期可以在一次调用中完成，但实现不能仅凭字符数假定安全，必须按实际模型及其上下文合同做预检。

### 10.2 文章级缓存与重试

完整成功响应按以下字段生成缓存 key：

```text
sourceSha256 + promptVersion + model + normalizedInputSha256
```

缓存存放在 `.cache/substack-translations/<publication>/`，由 `actions/cache` 跨 workflow run 恢复，并设置 30 天或 500 MB 的清理上限。CI artifact 用于审计，不等同于可复用缓存，也不能假定重跑时自动存在。

### 10.3 正文链接折叠

正文成稿只保留可读文字：`[锚文本](URL)` 折叠为 `锚文本`，图片 `![alt](URL)` 原样保留，被链接包裹的图片（Substack 的点击放大）剥掉外层链接后留下裸图片。

折叠位置是 `validateAndRestoreTranslation` 里、占位符还原**之前**：

- 跑在全部校验之后，所以块 ID、顺序、`URL_*` 占位符完整性这几条防线一条不少
- 此时 URL 位置仍是 `URL_BBBB_NNN`，不含括号，正则不会被真实 URL 里的 `)` 截断

文章开头的署名块由 `substack_archive.ts` 单独拼接，不参与折叠——原作者主页与原文链接是产品要求和版权表述的一部分，必须保留。

代价是「点击这里」「见这篇文章」这类锚文本会语义悬空，没有自动补救手段。

命中缓存后仍要按当前 schema 重新解析，并重新执行 block、链接、长度和完成原因校验；校验失败的缓存视为 miss。prompt、模型或规范化输入变化都会自然失效。只有通过全部校验的完整文章响应可以缓存，超时、截断或部分 JSON 不能写入缓存。

单次模型调用失败时允许按现有 AI client 策略重试一次或切换 fallback，但每次调用都要重新预留并累计实际 token。仍失败则整篇失败，不发布部分译文。由于没有分块，失败重试会重新翻译整篇；文章级缓存只避免已完成文章在相同输入下重复调用。

## 11. 图片策略

栏目配置必须显式选择：

- `none`：不保留原文图片；默认值
- `remote`：保留经过 host 和 MIME 校验的远程图片 URL，不下载
- `mirror`：按内容 SHA-256 下载到 `public/images/substack/<publication>/<hash>.<ext>`；栏目发布者负责确认并遵守原图许可条件

`remote` 会受到源站防盗链、URL 过期和历史文章失效影响；`mirror` 会增加仓库体积和图片授权责任。未选择同步原图的栏目使用 `none`，并由站内封面渲染器生成只包含中文标题、栏目名和作者名的原创文字封面。

`remote` 与 `mirror` 必须共用同一个受限图片获取器，不能因为最终不落盘或需要落盘而跳过校验：

1. 只允许 HTTPS；初始 URL、每次重定向及最终 URL 的 host 都必须在 `imageHosts`
2. 使用有响应体上限的流式 GET，超过 `maxImageBytes` 立即中止；不能只信任 `Content-Length` 或 HEAD
3. `Content-Type` 必须在允许的图片 MIME 列表中，并与文件 magic bytes 一致
4. 解码后像素尺寸必须合法且不超过 `maxImagePixels`，拒绝 SVG、HTML、脚本及伪装成图片的任意字节
5. `mirror` 的扩展名从实际 MIME 推导，不沿用远程路径后缀；落盘前计算 SHA-256，重复图片复用已有文件

`remote` 校验通过后才把最终 URL 写入文章；`mirror` 校验通过后才写入内容寻址路径。无论哪种策略，模型都不能生成或修改图片 URL。图片 caption 可以翻译，但必须绑定原 image block ID。

## 12. 文章归档格式

文件名：

```text
src/content/posts/zh-cn/<publication-key>-<YYYYMMDD>-<source-slug>.md
```

`source-slug` 优先取 Substack `/p/<slug>`；非法或冲突时使用标题 slug 加 canonical URL 的 8 位 hash。文件名不使用 CI 运行日期，避免延迟抓取改变文章身份。

文章标题只保存中文原标题，不再重复追加栏目名；栏目由标签和正文来源块展示。正文标题统一下移一级，保证页面标题是唯一 H1；若正文开头重复原标题，则直接移除该重复标题。

frontmatter 需要扩展 `src/content.config.ts`，增加可选 source 和 translation 元数据：

```yaml
---
author: bhwa233
pubDatetime: 2026-08-19T20:00:58Z
modDatetime: 2026-08-20T00:00:00Z
title: "为什么人生需要一条支线任务"
tags:
  - 海外长文
  - Curiosity Chronicle
description: "用支线任务打破人生惯性"
timezone: Asia/Shanghai
source:
  title: "Why You Need a Side Quest in Life"
  publication: "The Curiosity Chronicle"
  author: "Sahil Bloom"
  url: "https://sahilbloom.substack.com/p/example"
  publishedAt: "2026-08-19T20:00:58Z"
translation:
  model: "gpt-5.6-luna"
  translatedAt: "2026-08-20T00:00:00Z"
  authorized: false
---
```

不要把原文 URL 写入 `canonicalURL`。译文是独立语言页面，把 canonical 指向原文会让搜索引擎忽略本站页面；来源关系通过 `source.url` 和正文署名块表达。

frontmatter 的 `author` 保持站点发布者 `bhwa233`，不能写原作者。当前文章页、RSS 或 OG 等消费方把该字段理解为本站作者；原作者只写入 `source.author` 和正文署名块，避免让站点看起来像由原作者直接发布。

`src/content.config.ts` 当前使用非 strict 的 Zod object。若实现时没有显式加入 `source` 和 `translation`，未知字段不会让构建失败，而会被静默剥离。因此扩展 schema 是发布前置条件，并必须有一项通过 Astro content loader 读取示例文章、断言两个字段仍然存在的合同测试；仅运行 build 不能覆盖这个失败模式。

正文固定开头：

```markdown
> 原作者：[Sahil Bloom](作者或栏目主页)
> 原文：[Why You Need a Side Quest in Life](原文 URL)
> 原文发表于：2026-08-19 · The Curiosity Chronicle
> 本文为中文翻译；版权归原作者所有。
```

只有 `authorizedTranslation=true` 时，最后一行才改为“经原作者授权翻译发布”。不能仅因提供署名和链接就自动声明获得授权。

## 13. 校验与失败处理

单篇发布前必须通过：

- 来源 title、author、canonical URL、pubDate 和完整正文均存在
- Feedsmith 解析的 generator、title、author、pubDate 和 content namespace 通过来源合同
- 第 9.1 节转换对账全部通过：文本保留比达标，链接、图片、列表项数量与标题层级序列完全一致
- 中文标题非空，正文中文占比达到最低阈值
- 所有 source block ID 在译文中恰好出现一次
- 原始链接占位符全部恢复，没有新增模型链接；事实来源和脚注链接保留，图片外层远程跳转解开以使用站内 lightbox
- provider `finishReason` 明确表示正常完成，响应是完整且唯一的 JSON 对象
- 以去除 URL、占位符、代码和空白后的可见字符计算中英长度比：默认 0.40–0.60 之外警告，0.30–0.75 之外硬失败；栏目可按实测收紧或调整
- 署名块包含配置作者、栏目和 canonical URL
- frontmatter `author` 为站点发布者，`source.author` 为原作者，schema 加载后两个来源字段仍存在
- Markdown 不包含脚本、表单、订阅组件、模型解释或 JSON 残片
- 最终内容质量检查拒绝超长/残缺摘要、正文 H1、推广 CTA、孤立强调标记和缺失姓名的提及
- 生成文件通过 Astro content schema 和站点 build

失败分级：

| 失败                               | 处理                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| 代理配置缺失或无效                 | 在任何网络请求前失败，不尝试直连或其他回退                   |
| 代理 429/5xx/超时                  | 按现有 HTTP 策略重试；耗尽后该栏目失败                       |
| Feed 结构变化                      | 该栏目失败，不回落网页抓取                                   |
| 正文为空、过短或 paywall           | 跳过 item，记录原因                                          |
| 清洗后只剩推广内容                 | 跳过 item                                                    |
| 转换对账不通过                     | 该篇失败并输出逐项差值；不调用模型，不回落到未对账的转换结果 |
| 单篇预估超过上下文、输出或单篇预算 | 不调用模型；该篇失败并报告估算值和限制                       |
| 栏目剩余预算不足                   | 停止该栏目后续模型调用；其他栏目不受影响，已成功文章仍可归档，job 最终标记部分失败 |
| 整篇模型超时、截断或结构失败       | 累计本次 token 后重试一次；仍失败则整篇失败                  |
| fallback 模型成功                  | 允许发布，在 ledger 和 artifact 记录模型                     |
| 某篇失败、其他篇成功               | 先归档成功项，最终 job 标记部分失败                          |
| ledger 损坏                        | 整体失败，禁止以空账本继续运行                               |
| push non-fast-forward              | fetch/rebase 后有限次数重试，禁止 force push                 |

## 14. Artifact 与可审计性

每篇文章的 CI artifact：

```text
artifacts/substack/<publication>/<source-sha-prefix>/
├── feed-item.json
├── source.html
├── cleaned.html            # 栏目级删除之后、Turndown 之前
├── extracted.md            # Turndown 输出
├── extraction-audit.json   # 9.1 转换对账逐项差值
├── cleaned-blocks.json
├── effective-config.json
├── prompt.md
├── response.json
├── composed.md
├── usage.json
└── result.json
```

`result.json` 至少记录 status、错误分类、sourceSha256、cache hit/miss、模型、finishReason、估算 token、实际 input/output/total token 和本次运行累计量。这些文件用于排查清洗和翻译错误，保留期建议 7–14 天，不提交 Git。仓库只提交最终中文 Markdown、允许镜像的图片和 ledger。日志不得输出 AI key、Cookie、完整 Feed 或完整原文。

可复用缓存位于 `.cache/substack-translations/`，通过 `actions/cache` 管理，不能放进 Git，也不能把 artifact 当作缓存恢复机制。

## 15. 测试策略

需要测试的稳定合同：

1. Substack RSS 能从 `content:encoded` 读取完整 HTML，而不是 description
2. Feed 请求强制经过认证代理；缺 URL/token 时不发网络请求，配置完整时只请求 `/v1/proxy`
3. `feedHosts`、`articleHosts`、`imageHosts` 分别约束初始 URL、每次重定向和最终 URL
4. 配置 key 解析、`all` 展开、未知 key 与非法 pattern 在网络请求前失败；effective config 可序列化
5. `excludeTitlePatterns` 确实排除匹配 item，并留下可审计原因
6. canonical URL 规范化和 per-publication ledger 去重；损坏 ledger 不能按空文件覆盖
7. `--backfill N` 只扩大候选窗口，最终篇数仍取发布上限和 token 预算的最小值
8. 栏目级删除规则跑在 Turndown 之前，且确实删掉订阅/赞助/推荐尾巴，同时保留标题、段落、引用、列表和链接
9. 转换对账在文本被吞、链接丢失、列表项减少或标题层级被改写时判失败
10. 整篇请求包含全部 block；模型结果缺 block ID、乱序、丢链接或 finishReason 异常时失败
11. token 预留、实际 usage 冲销、无 usage 时按预留计费，以及 200,000 单篇 / 400,000 每栏目硬顶均可复现；一个栏目耗尽预算不影响后续栏目
12. 文章缓存命中不调用模型；source、promptVersion、model 或输入 hash 变化时缓存失效
13. 图片下载对 host、重定向、响应大小、MIME、magic bytes、像素和真实扩展名执行校验
14. 动态文件名在同日多篇和同标题场景下不冲突
15. partial success 只给成功项写各自栏目 ledger
16. `force` 更新原路径，不创建重复文章
17. Astro content loader 保留 `source` / `translation`，frontmatter 为本站作者且正文署名包含原作者与原文链接
18. 最终归档质量 gate 能拦截长摘要、重复 H1、推广 CTA、孤立 `**` 与「参见 的」残句

Fixture 使用经过缩减和匿名化的 RSS/HTML 结构，不把完整第三方长文提交为测试数据。网络可用性不放进单元测试；CI smoke test 只请求 Feed 元数据并限制响应体，不调用模型。

## 16. 实施顺序

1. 增加可序列化栏目配置、三类 host 白名单、Feed parser、来源合同和缩减 fixture 测试
2. 增加 DOM 清洗、中间块、链接占位符和受限图片获取器
3. 扩展 AI client usage 返回，增加整篇 token 预检、单次 JSON 翻译、文章级缓存与完整性校验
4. 增加动态 archiver、content schema 字段、schema 保留测试和 per-publication ledger
5. 新增接收 `publication` 与 token budget、使用全局 concurrency 的独立发布 workflow
6. 对单个栏目执行 `--dry-run`，人工检查 cleaned blocks、effective config 和 token 估算
7. 手动翻译每个栏目最新一篇，检查完整响应、结构、署名、链接、图片、构建和实际模型成本
8. 先启用 `publication=<单栏目>` 的手动运行，再启用每日 `all` 调度

## 17. 验收标准

- 新增一个 Substack 栏目只需增加一条配置和配置测试
- `publication=curiosity-chronicle` 只访问对应 `feedHosts`、`articleHosts` 和 `imageHosts`
- `publication=all` 会尝试所有 enabled 栏目，栏目间失败隔离
- `all` 与手动单栏目运行不能在同一分支并发执行
- 首次运行默认最多发布每栏目最新一篇，不批量倒灌历史文章
- 每个栏目只写 `data/substack-translations/<publication>/issues.json`，第二次运行同一 Feed 不产生文章、ledger 或 commit 变化
- 每篇中文文章首屏可见原作者、原栏目、原始发布日期和原文链接
- frontmatter `author` 保持 `bhwa233`，原作者保留在 `source.author` 和正文署名；schema 加载后来源字段不被静默剥离
- 整篇文章只发起一次正常模型调用；译文 block 数、顺序、引用、列表与链接通过代码级完整性校验
- 同一输入重跑命中文章级缓存，不重复调用模型；截断或部分响应不能进入缓存
- 单篇估算总量不超过 200,000 token，每个栏目每次运行不超过 400,000 token，实际用量写入日志、ledger 和 result.json
- `mirror` 只落盘通过 host、大小、MIME、magic bytes 和像素校验的图片
- 付费或截断正文不会进入模型和归档
- 原始 HTML、prompt 与 response 仅存在于短期 artifact
- 文章标题只使用中文原标题，栏目由标签与来源块展示；正文不含 H1
- 全部测试、类型检查、约定检查和 Astro build 通过后才提交生成文章

## 18. 当前产品决策

1. 首批启用 The Curiosity Chronicle、SatPost 与兼容 RSS 来源 The Marginalian
2. 执行完整忠实翻译，正文首部明确原作者、原栏目、原始发布日期和原文链接；`author` 仍为本站发布者
3. 首批栏目统一使用 `imagePolicy=mirror`，将通过完整安全校验的正文图片按内容哈希同步到本站；原作者、原文链接和图片许可责任不因镜像而改变
4. `startAt` 初值为 2026-08-20；历史内容只允许手动 `--backfill N`，且不覆盖每栏目单次发布上限
5. CI 自动归档为站内文章，不自动同步微信公众号；人工抽检每栏目首篇后再决定是否增加审核或公众号流程

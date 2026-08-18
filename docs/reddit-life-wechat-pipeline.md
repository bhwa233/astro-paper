# Reddit 人生精选微信草稿技术方案

状态：已实现（无模型调用版）  
最后更新：2026-08-17

## 1. 背景

`reddit-top20` 每天产出「人生与社会」栏目文章，其中每帖的正文已经是逐条故事的有序列表（一条回答一项，无小标题、无引用块）。微信侧要的正是这个形态，因此这条管线不再自己组织内容，只把上游排名第一那帖转成一篇微信草稿。

早期方案曾经深抓单帖评论树、逐讨论串调用模型、再综合成四段式文章（讨论背景 / 主流观点 / 回复补充 / 分歧边界）。上游正文改成故事集之后那套结构失去意义，已整体删除：**这条管线现在没有任何模型调用，也不请求 Reddit 深抓来源服务。**

## 2. 目标与非目标

目标：

- 每个归档日最多产出一篇微信草稿，内容与上游 life 文章第一帖完全一致
- 跨天不重复推荐同一个帖子
- 渲染结果必须落在微信正文长度上限内
- 归档可审计：保留上游文章快照与处理 manifest

非目标：

- 不重新选帖、不重排、不改写上游正文
- 不进入 Astro 内容集合（`data/` 下的文件不会生成页面）
- 不自动发布，只产出草稿供 `sync-wechat-draft` 手动同步

## 3. 数据流

```text
reddit-top20 (publish)
  └─ src/content/posts/zh-cn/reddit-<date>-life.md   ← 唯一输入
       └─ scripts/generate_reddit_life_wechat.ts     ← 纯规则转换，无 AI
            ├─ data/reddit-life-wechat/<date>/01-<postId>.md
            ├─ data/reddit-life-wechat/<date>/upstream-life.md
            ├─ data/reddit-life-wechat/<date>/run.json
            └─ data/reddit-life-wechat/recommended.json
```

workflow `reddit-life-wechat.yml` 由 `publish-reddit-life.yml` 在 publish 成功后调用，`upstream_sha` 传入父任务提交，保证读到的是已归档的那一版文章。

## 4. 选帖与内容转换

- **选帖**：`parseRedditLifeCandidates` 解析上游文章的 `## N.` 块，取 rank 1。subreddit 必须属于 life 栏目，否则报错。
- **正文**：事实 bullet 之后的全部内容原样搬运。上游契约保证它是从 1 开始的有序列表；解析不到列表时显式失败，不产出空稿。
- **描述**：取上游文章 frontmatter 的 `description`——它就是第一帖的一句话描述（`redditTop20Description` 取 `items[0].description`）。
- **标题**：`Reddit 热帖精选｜<上游中文标题>`。微信标题上限 64 字符且不可截断，超长会在渲染阶段显式失败。
- **页脚**：正文末尾附一行 `更多每日精选：https://blog.bhwa233.com/`。
- **frontmatter**：`tags: [Reddit人生讨论]`（在 `astro-wechat.config.mjs` 的 `eligibleTags` 内）、`wechat.enabled: true`、`wechat.sourceURL` 指向原帖，另附 `redditPostId` 与 `subreddit` 便于追溯。

## 5. 长度收口

微信正文上限是 20000 字符的 HTML，而一帖的故事条数不可控。`fitWechatContentLimit` 直接用 astro-wechat 的渲染器判定（`openProject` + `prepareArticle`，无网络无写入）：

1. 整篇能渲染就原样归档
2. 撞 `content-too-long` / `content-too-large` 时，二分找出最少需要删除的尾部故事条数
3. 删除只发生在正文末尾。编号从 1 递增，从尾部删不会留下断号；frontmatter 与页脚永不参与截断
4. 删掉的条数写进 `WARN` 日志，不静默截断

## 6. 存档模型

```text
data/reddit-life-wechat/
├── recommended.json
└── 2026-08-17/
    ├── run.json
    ├── upstream-life.md
    ├── cover.png          # 提交
    ├── qr.png             # 不提交，见下
    └── 01-<reddit-post-id>.md
```

`cover.png` 是这一篇的专属封面，由 `reddit_life_wechat_cover.ts` 用 satori 渲染后随稿子提交；缺失时 `astro-wechat` 回落到配置里的 `defaultCover`，因此渲染失败只降级不中断。

`qr.png` 指向博客首页，内容恒定，所以按 `.gitignore` 排除、每次运行重新生成，避免仓库里堆一份天天重复的二进制。代价是**已提交的稿子引用了一个没提交的文件**：CI 里由 `generate-and-archive` 上传成 artifact、`sync-wechat` 下载还原，两个 job 用的是同一份字节。绕开这条链路时必须先补上这张图，否则 `astro-wechat` 会以 `asset-not-found` 直接失败：

```bash
node --import tsx scripts/generate_reddit_life_wechat.ts --date <date> --upstream-sha <sha>
```

`run.json` 记录 manifest version、归档日期与时区、上游提交 SHA / workflow run / 文章路径、上游快照路径、运行状态（`processed` 或 `upstream-empty`），以及那一帖的事实字段、处理状态（`generated` 或 `duplicate`）、产物路径和内容 hash。

同一日期存在合法 manifest 时，重跑复用它而不重新转换。manifest 解析失败时抛错，不回退成空快照。上游文章不存在时写入 `status: upstream-empty` 的 manifest，不产出草稿也不报错。

`recommended.json` 用仓库通用的 `recommendation_ledger.ts`，身份是规范化的 Reddit post ID，不用标题或日期。**写入必须传该归档日 manifest 中全部 `generated` 帖子，而不是增量**——`appendRecommendations` 按 `postPath` 全量覆盖，只传增量会把上一次的记录静默删掉，导致该帖在后续日期重新变成「未推荐」并被重复出稿。

## 7. 微信同步

草稿放在 `data/reddit-life-wechat/` 下，不进内容集合，所以博客站点不会出现重复内容。`sync-wechat-draft.yml` 的路径校验同时接受 `src/content/posts/*.md` 与 `data/reddit-life-wechat/*.md`，手动触发时传入草稿路径即可创建微信草稿。

本地预览：

```bash
pnpm exec astro-wechat preview data/reddit-life-wechat/<date>/01-<postId>.md
```

## 8. 运行方式

```bash
node --import tsx scripts/generate_reddit_life_wechat.ts \
  --date 2026-08-17 --upstream-sha <sha> --artifacts-dir reddit-life-wechat-artifacts
```

`--upstream-sha` 必填：这条管线只读已提交的父任务交接结果，不接受任意工作区状态。

## 9. 启用状态

`publish-reddit-life.yml` 中该 job 目前是 `if: ${{ false }}`，需要人工验收后再打开。

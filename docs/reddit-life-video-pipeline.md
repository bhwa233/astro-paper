# Reddit 人生精选竖屏视频技术方案

状态：已实现（独立 cron + Remotion 竖屏渲染 + Release 保留 7 天）
最后更新：2026-08-28

## 1. 背景

`reddit-life-wechat.yml` 每天把 `r/AskReddit` / `r/askscience` 的问答精选转成两篇微信草稿，
落在 `data/reddit-life-wechat/<date>/`。那批中文译文已经过一次 AI 选题过滤，是现成的优质语料。

这条管线把同一份语料再做一次转换，产出一支 1080×1920 竖屏短视频，用于视频号 / 抖音这类
竖屏分发渠道。它只读微信归档的已提交结果，不重新请求 Reddit，也不改动微信侧任何产物。

参考样片是「黑底大字 + TTS 旁白 + Reddit 用户名」的英文搬运号风格。本方案**不照抄它**：

- 视觉沿用仓库现有的公众号卡片体系（平台色铺底 + 圆角浅色卡），换 Reddit 主题色，
  这样博客 OG 图、公众号封面、图片消息卡片和视频是同一套视觉语言
- 不做 TTS。没有旁白意味着屏上文字必须短，因此需要一个把回答压到 60 字以内的 AI 阶段
- 不显示 Reddit 用户名。上游归档是 AI 综合后的编号回答，本来就没有逐条作者，
  而新版式底部也没有作者位

## 2. 目标与非目标

目标：

- 每个归档日产出一支 1080×1920 / 30fps 的 mp4，固定 1 张封面卡 + 10 张内容卡
- 卡片版式与 `weibo_trending_wechat_cards.ts` 同构，配色取 `PLATFORM_THEMES.reddit`
- 每张内容卡有可见倒计时；最后 3 秒逐秒响一声柔和提示音
- 全片一条循环 BGM，音量固定
- 成片不进 git 历史；只保留 7 天
- 选卡决定可审计、可复现：`video.json` 提交，成片可按它重跑

非目标：

- 不做 TTS、不做字幕轨、不做人声
- 不重新抓取 Reddit，不让模型补造上游没有的内容
- 不自动上传到任何视频平台；这里只产出文件
- 不进 Astro 内容集合，不生成博客页面

## 3. 数据流

```text
reddit-life-wechat.yml（已有，10:00 UTC 链路）
  └─ data/reddit-life-wechat/<date>/0X-<postId>.md    ← 唯一内容输入
       └─ scripts/generate_reddit_life_video.ts
            ├─ 解析出全部候选回答（约 5 问 × 每问 20-30 条）
            ├─ [Gemini] 选 10 条 + 各压到 ≤60 字 + 各起一个 ≤14 字短标题
            └─ data/reddit-life-video/<date>/video.json    ← 提交
                 └─ video/（Remotion）
                      └─ out/reddit-life-<date>.mp4       ← 不提交
                           └─ GitHub Release `video-<date>`
                                └─ 删除 7 天前的 Release
```

`publish-reddit-life-video.yml` 是独立 cron（13:00 UTC），不是 `publish-reddit-life.yml` 的
子 workflow。上游 10:00 UTC 起跑，中间还有微信同步，留 3 小时余量。当天目录不存在时
直接跳过并成功退出，不让上游延迟把这条链路天天染红。

## 4. 内容选取

- **候选**：`parseRedditLifeVideoCandidates` 读当天全部 `0X-*.md`，按 `## ` 二级标题切出每个问题，
  再按 `N\.` 切出每条回答。候选携带所属问题标题与回答原文。
- **模型职责**：从全部候选里挑 10 条，并把每条压缩成一句 ≤60 字的中文，另起一个 ≤14 字短标题。
  压缩而不是节选：原回答动辄 200 字，直接截断会把结论砍掉。
- **硬约束**（校验不过就 JSON 重试）：恰好 10 条；`sourceIndex` 互不重复且都在候选范围内；
  `title` ≤14 字、`body` ≤60 字且都含中文；`body` 不得只是 `title` 的复述。
- **候选不足**：少于 10 条时按实际条数出片并记 `WARN`；少于 4 条则写 `status: insufficient-candidates`
  且不出片。上游正常运行时候选量在 100 条以上，这两条只是兜底。
- **提示词**：`prompts/blog/daily/reddit-life-video-cards.md`，与其他栏目同目录同命名习惯。

## 5. 版式

画布 1080×1920，30fps。底色 `PLATFORM_THEMES.reddit.bg` (`#FF4500`) 铺满，圆角浅色卡
(`#FFFDF8`) 浮在中间，与公众号图片消息卡片同构。

```text
┌────────────────────────────┐  1080×1920, #FF4500
│                            │
│   ⟨Reddit 问答精选⟩   08/28 │  笔圈品牌 + 日期，白字压橙底
│  ╭──────────────────────╮  │
│  │ 03    卡片短标题       │  │  accent #C42D00 序号 + 加粗标题
│  │ ──────────────────── │  │  1px #E8E8E8 分隔线
│  │ ▓▓▓▓▓▓▓░░░░░░░░░░░░░ │  │  倒计时进度条，最后 3s 转 accent 红
│  │                       │  │
│  │  正文，深灰 #343434    │  │  字号按字数自适应
│  │  最多三四行            │  │
│  │                       │  │
│  │  ③              03/10 │  │  最后 3s 出现的大数字 + 进度计数
│  ╰──────────────────────╯  │
│                            │
│      blog.bhwa233.com      │  低对比句柄
└────────────────────────────┘
```

- 封面卡沿用 `wechatCoverTree` 的信息层级：笔圈品牌 + 日期 + accent 短横 + `01–10` 编号标题列表
- 笔圈品牌的椭圆比例常量移到 `src/utils/platformTheme.ts`，satori 侧与 Remotion 侧共用一份，
  免得两边各调各的导致品牌行长歪
- 字号自适应用真实测量（Chromium 环境），不用 `cardFontSize()`——那条公式是给 satori 的估算，
  satori 不测量文本，Remotion 不需要迁就它

## 6. 时长与音频

- 封面卡 4s
- 内容卡 `clamp(5s, 1.5s + 字数 × 0.18s, 12s)`，按帧取整。60 字打满 12s，30 字约 6.9s
- 卡内两端各淡入淡出 9 帧 + 轻微上移，不做硬切；不引入 `@remotion/transitions`
- 2026-08-27 那期实测 3689 帧 / 123s / 11MB

音频（素材出处与许可见 `video/public/CREDITS.md`，两个都是 CC0）：

- `bgm.mp3`：24.5s 无缝循环，`loop` 播放，音量 0.18，片尾 1s 淡出
- `tick.wav`：54ms，在每张内容卡的 `D-3s`、`D-2s`、`D-1s` 各响一次，音量 0.35。
  内容卡下限 5s 保证这三下不会挤到卡片开头
- 10 张卡共 30 声。密度是否合适要看成片；`TICK_LEAD_SECONDS` 是常量，调它不动结构

## 7. 依赖与目录布局

Remotion 会拖进 `react` / `react-dom` / `@remotion/*`，渲染时还要下载 Chrome Headless Shell
（约 120MB）。本仓库其余部分是刻意的 satori 无浏览器路线，而 20 多个定时 workflow 全都跑
`pnpm install --frozen-lockfile`——把这些塞进根 `dependencies` 会拖慢每一个不相干的任务。

因此 Remotion 关在独立的 workspace 包里：

```text
pnpm-workspace.yaml      packages: [".", "video"]
video/
├── package.json         @remotion/* + react，只有视频 workflow 装
├── remotion.config.ts
├── public/              bgm.mp3 / tick.wav / CREDITS.md（staticFile() 的根）
├── scripts/render.ts    读 video.json → 出 mp4
└── src/
    ├── index.ts         registerRoot
    ├── Root.tsx         注册 composition，durationInFrames 由 calculateMetadata 推出
    ├── Video.tsx        卡片序列编排 + BGM + tick
    ├── Frame.tsx        每张卡共用的外壳与淡入
    ├── CoverCard.tsx
    ├── TopicCard.tsx
    ├── CircledBrand.tsx
    ├── layout.ts        画布与卡片几何常量、字号自适应
    ├── timing.ts        卡片时长公式，被 Root、Video 与渲染脚本共用
    ├── font.ts          按 text= 裁的中文字体子集
    └── contract.ts      video.json 的类型与解析
```

加了 `video` 之后，工作区根目录的 `pnpm install` 默认会把两个包都装上，那就等于
没有隔离。因此 `.github/actions/setup` 增加了 `filter` 输入，默认 `.`（只装根包，
与加 `video/` 之前的行为一致），只有这条视频 workflow 传 `./**` 把两个包都装上。

`check_conventions.ts` 的依赖单一 owner 规则只扫 `scripts/`，`video/` 天然不在范围内，
不需要额外排除。根 `tsconfig.json` 则要把 `video` 加进 `exclude`：那份配置继承
`astro/tsconfigs/strict`，没有 `jsx` 设置，扫到 `.tsx` 会报一堆与实际无关的错。

中文字体不用 `@remotion/google-fonts/NotoSansSC`：那个包把 `chinese-simplified` 展开成
120 个 chunk 子集（合计约 6MB），每个渲染标签页都要重跑这 120 个请求。改为在
`font.ts` 里按 `text=` 拉子集——与 `scripts/satori_font.ts` 同一个思路，一支视频只要两个
几十 KB 的请求。区别是这边跑在 Chromium 里，woff2 原生支持，不需要 satori 那套骗 UA 拿 ttf。

## 8. 存档与留存

```text
data/reddit-life-video/
└── 2026-08-27/
    ├── video.json        # 提交，几 KB，永久保留
    └── run.json          # 提交，记录上游归档、模型、候选数、状态
```

成片**不提交**。每天 4MB 的 mp4 进 git 意味着一年后 `.git` 多出 1.4GB，而 `git rm` 只清工作区、
blob 永远留在历史里——那等于没删。成片改为上传到 GitHub Release `video-<date>`，
CI 末尾删掉 7 天前的 Release，资产随之真正消失。

`video.json` 保留全部历史：它只有几 KB，是重跑成片的唯一输入，也是判断某天是否已处理的依据。
同一天重跑时若 `video.json` 已存在则直接复用，不重新调用模型；`--force` 才重新选卡。

## 9. 运行方式

```bash
# 选卡（调用模型，写 video.json）
node --import tsx scripts/generate_reddit_life_video.ts --date 2026-08-27

# 渲染（读 video.json，出 mp4）
pnpm --filter reddit-life-video render -- --date 2026-08-27

# 本地预览（Remotion Studio）
pnpm --filter reddit-life-video studio
```

`--date` 默认取美西当天，与微信归档的分日口径一致。

## 10. CI

`publish-reddit-life-video.yml`：

- `schedule: "0 13 * * *"` + `workflow_dispatch(date, force)`
- `actions/cache` 缓存 `~/.cache/remotion`，否则每天多下 120MB 的 Chrome Headless Shell
- 归档目录缺失 → 记 summary 后成功退出
- 选卡结果用 `.github/actions/archive-commit` 提交 `data/reddit-life-video`
- 成片 `gh release create video-<date>`，随后 `gh release delete` 掉 7 天前的
- 渲染量约 3700 帧全静态，预估 3–8 分钟

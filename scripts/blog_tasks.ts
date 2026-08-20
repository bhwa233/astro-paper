import path from "node:path";

// 发布时对 source 证据的要求。verify_blog_generation.ts 按这里的字段校验，不再自己维护第二份任务清单：
// 2026-08-14 那次事故（nyt-books 去掉 ## 分节，verify 仍硬要求 ^## ，写盘后才失败）的成因就是
// 同一任务的输出形状被写在两个文件里，而语言层没有任何东西把它们绑在一起。
export type PostSourceContract = {
  /** source 里 `## N.` / `### N.` 编号块的数量下限。 */
  minNumberedBlocks?: number;
  /** 必须原样出现的字符串。 */
  requiredTerms?: readonly string[];
  /** 必须命中的模式；label 只用于报错信息。 */
  requiredPatterns?: readonly { label: string; pattern: RegExp }[];
};

export type BlogTaskInfo = {
  titlePrefix: string;
  tag: string;
  description: string;
  fileName: string;
  /** 正文分节的标题层级。缺省 `##`；nyt-books 为微信排版去掉了分节 `##`，最高层级是每本书的 `###`。 */
  bodyHeadingPattern?: RegExp;
  /** frontmatter 标题是否必须含 titlePrefix。播客逐集文章标题是「节目名：本期中文标题」，不带前缀。 */
  titleCarriesPrefix?: boolean;
  /** 一次运行产出多篇（一集一篇），而不是一篇。编排、归档、发布校验三层都按它分流。 */
  episodeArticles?: boolean;
  /** 标题带 ISO 周次，例如「纽约时报书单精选｜2099年第2周」。 */
  weekLabelInTitle?: boolean;
  /** 日期放在标题最前，例如「2099-01-02 热搜」。与 weekLabelInTitle/dateInTitle 互斥。 */
  dateFirstTitle?: boolean;
  /** 标题带归档日期，例如「日报｜2099-01-02」。与 weekLabelInTitle/dateFirstTitle 互斥。 */
  dateInTitle?: boolean;
  /** AI 或栏目后缀前的分隔符，缺省为 `｜`。 */
  titleSuffixSeparator?: string;
  /** frontmatter 写入 `wechat.enabled`，进入公众号同步流水线。 */
  wechatEnabled?: boolean;
  sourceContract?: PostSourceContract;
};

/**
 * 一篇热搜稿至少要有几条选题。低于这个数就不发：凑不满的那天多半整个榜都在追当日新闻，
 * 硬发只会稀释专栏。来源层用它决定是否跳过当天，发布校验和归档成文用它兜底，
 * 三处共用一个常量，避免各自记一个数字后悄悄漂移。
 */
export const REDDIT_TRENDING_MIN_TOPICS = 3;

export const BLOG_TASKS = {
  "hn-top10": {
    titlePrefix: "HackerNews Top 10",
    tag: "HackerNews",
    description: "每日 Hacker News 热门文章 Top 10 中文整理，按当天归档并覆盖更新。",
    fileName: "hackernews-{date}.md",
    sourceContract: { requiredTerms: ["HN 讨论", "原文"] },
  },
  "github-trending-daily": {
    titlePrefix: "GitHub 项目日报",
    tag: "GitHub项目日报",
    description: "每日 GitHub Trending 项目中文整理，基于榜单元数据与 README 正文提炼开源项目趋势。",
    fileName: "GitHub项目日报-{date}.md",
    sourceContract: {
      minNumberedBlocks: 5,
      requiredTerms: ["GitHub Trending"],
      requiredPatterns: [{ label: "repository links", pattern: /https:\/\/github\.com\// }],
    },
  },
  "daily-podcasts": {
    titlePrefix: "每日播客笔记",
    tag: "播客",
    description: "每日海外 Podcasts 热门节目中文长文笔记。",
    fileName: "每日播客-{date}.md",
    titleCarriesPrefix: false,
    episodeArticles: true,
    sourceContract: {
      requiredPatterns: [
        { label: "podcast metadata", pattern: /节目|来源|音频|链接/ },
        { label: "transcript evidence", pattern: /transcript|转写|摘录|长文|内容/i },
      ],
    },
  },
  "xyzrank-top-episodes": {
    titlePrefix: "XYZ Rank 热门播客",
    tag: "中文播客榜",
    description: "每周 XYZ Rank 中文播客热门单集 Top 5 音频长文笔记。",
    fileName: "XYZRank热门播客-{date}.md",
    titleCarriesPrefix: false,
    episodeArticles: true,
    sourceContract: {
      minNumberedBlocks: 5,
      requiredTerms: ["XYZ Rank", "小宇宙", "音频"],
      requiredPatterns: [{ label: "episode audio links", pattern: /- 音频：https?:\/\// }],
    },
  },
  "apple-top-podcasts": {
    titlePrefix: "Apple 热门播客笔记",
    tag: "Apple播客榜",
    description: "每日 Apple Podcasts 美区 Top Shows 热门节目音频长文笔记。",
    fileName: "Apple热门播客-{date}.md",
    titleCarriesPrefix: false,
    episodeArticles: true,
  },
  "tech-daily": {
    titlePrefix: "技术日报",
    tag: "技术日报",
    description: "每日技术综合整理，基于文章级 AI 摘要动态聚合过去 24 小时的 AI、工程、安全、平台与科技商业变化。",
    fileName: "技术日报-{date}.md",
    wechatEnabled: true,
    sourceContract: { requiredPatterns: [{ label: "classified source link", pattern: /- 链接：https?:\/\// }] },
  },
  "mdblist-weekly": {
    titlePrefix: "每周影视推荐",
    tag: "每周影视推荐",
    description: "每周影视推荐专栏，基于 mdblist 聚合的 Trakt 趋势电影与剧集榜单，汇总本周值得看的作品并补充口碑观察。",
    fileName: "每周影视推荐-{date}.md",
  },
  "nyt-books-weekly": {
    titlePrefix: "纽约时报书单精选",
    tag: "每周图书推荐",
    description: "每周图书推荐专栏，基于纽约时报畅销书榜（小说与非虚构）筛选本周新上榜的图书并补充中文导读。",
    fileName: "每周图书推荐-{date}.md",
    // 正文为微信排版去掉了分节的 ##，最高层级是每本书的 ###。
    bodyHeadingPattern: /^#{2,3}\s+/m,
    weekLabelInTitle: true,
    wechatEnabled: true,
  },
  "economist-weekly": {
    titlePrefix: "经济学人精选导读",
    tag: "经济学人",
    description: "每周《经济学人》中文综合导读，精选本期文章并梳理共同主题与阅读路线。",
    fileName: "经济学人-{date}.md",
  },
  "new-yorker-weekly": {
    titlePrefix: "纽约客精选导读",
    tag: "杂志",
    description: "每周《纽约客》中文导读，逐篇精选本期文章并给出结构化中文摘要。",
    fileName: "纽约客-{date}.md",
  },
  "atlantic-monthly": {
    titlePrefix: "大西洋月刊精选导读",
    tag: "杂志",
    description: "每月《大西洋月刊》中文导读，逐篇精选本期文章并给出结构化中文摘要。",
    fileName: "大西洋月刊-{date}.md",
  },
  "wired-monthly": {
    titlePrefix: "连线精选导读",
    tag: "杂志",
    description: "每月《连线》（Wired）中文导读，逐篇精选本期文章并给出结构化中文摘要。",
    fileName: "连线-{date}.md",
  },
  "reddit-top20": {
    titlePrefix: "Reddit 每日精选",
    tag: "Reddit热门",
    description: "每日 Reddit 分类精选，按人生与社会、人物与问答、市场与价值投资三个独立栏目归档通过来源服务筛选的帖子。",
    fileName: "reddit-{date}.md",
  },
  "reddit-trending": {
    titlePrefix: "Reddit 全站热搜",
    tag: "Reddit热搜",
    description: "每日 Reddit 全站热榜精选，按讨论密度筛掉无人讨论的图帖，再挑出一个月后仍然成立的长尾话题，仅翻译原帖标题并保留热度与来源。",
    fileName: "Reddit热搜-{date}.md",
    sourceContract: {
      // 选题不足下限时 source 里一个编号块都没有，归档前就该被跳过，不该走到发布校验。
      minNumberedBlocks: REDDIT_TRENDING_MIN_TOPICS,
      requiredTerms: ["入选理由", "中文标题"],
      requiredPatterns: [{ label: "post links", pattern: /- \*\*帖子\*\*：https:\/\/www\.reddit\.com\// }],
    },
  },
  "weibo-trending": {
    titlePrefix: "热搜",
    tag: "微博热搜",
    description: "每日微博热搜短条目，基于当日榜单与逐话题微博智搜结论整理。",
    fileName: "wb-{compactDate}.md",
    dateFirstTitle: true,
    titleSuffixSeparator: " ｜ ",
    bodyHeadingPattern: /^## \d+\.\s+/m,
    sourceContract: {
      requiredTerms: ["微博智搜", "智搜摘要", "AI 标题"],
      // source 层始终写裸 URL，markdown 链接是 compose 之后的形态，由 formatWeiboTrending 单独校验。
      requiredPatterns: [{ label: "topic links", pattern: /- \*\*话题\*\*：https:\/\// }],
    },
  },
} as const satisfies Record<string, BlogTaskInfo>;

export type Task = keyof typeof BLOG_TASKS;
export type TaskInput = Task | "all";

export const TASKS = Object.keys(BLOG_TASKS) as Task[];

export const SCHEDULED_TASK_INPUTS: Record<string, { task: TaskInput; dateOffset?: number; dateTimeZone?: string }> = {
  "30 0 * * *": { task: "tech-daily", dateTimeZone: "America/Los_Angeles" },
  "30 1 * * *": { task: "daily-podcasts" },
  "0 6 * * *": { task: "hn-top10", dateTimeZone: "America/Los_Angeles" },
  "0 2 * * 1": { task: "xyzrank-top-episodes", dateTimeZone: "Asia/Shanghai" },
  "0 23 * * *": { task: "github-trending-daily", dateTimeZone: "America/Los_Angeles" },
  "0 2 * * 5": { task: "mdblist-weekly", dateTimeZone: "Asia/Shanghai" },
  "0 2 * * 0": { task: "nyt-books-weekly", dateTimeZone: "Asia/Shanghai" },
  "0 3 * * 6": { task: "economist-weekly", dateTimeZone: "Asia/Shanghai" },
  "0 5 * * 6": { task: "new-yorker-weekly", dateTimeZone: "Asia/Shanghai" },
  "0 6 * * 6": { task: "atlantic-monthly", dateTimeZone: "Asia/Shanghai" },
  "0 7 * * 6": { task: "wired-monthly", dateTimeZone: "Asia/Shanghai" },
  "0 10 * * *": { task: "reddit-top20", dateTimeZone: "America/Los_Angeles" },
  "5 10 * * *": { task: "reddit-top20", dateTimeZone: "America/Los_Angeles" },
  "10 10 * * *": { task: "reddit-top20", dateTimeZone: "America/Los_Angeles" },
  // 错开上面三个栏目：它们和热搜打的是同一个来源服务，热搜还要额外跑一次深挖作业。
  "30 11 * * *": { task: "reddit-trending", dateTimeZone: "America/Los_Angeles" },
  // 北京时间次日 00:20 读取前一天完整累积榜，避免当天中午只拿到半天热搜。
  "20 16 * * *": { task: "weibo-trending", dateOffset: -1, dateTimeZone: "Asia/Shanghai" },
};

export function isTask(value: string): value is Task {
  return value in BLOG_TASKS;
}

export function isTaskInput(value: string): value is TaskInput {
  return value === "all" || isTask(value);
}

export function taskInfo(task: string): BlogTaskInfo {
  if (!isTask(task)) throw new Error(`unsupported task: ${task}`);
  return BLOG_TASKS[task];
}

export function taskTags(task: Task): string[] {
  return [taskInfo(task).tag];
}

export function taskTitle(task: Task, date: string): string {
  const info = taskInfo(task);
  if (info.weekLabelInTitle) return `${info.titlePrefix}｜${isoWeekLabel(date)}`;
  if (info.dateFirstTitle) return `${date} ${info.titlePrefix}`;
  return info.dateInTitle ? `${info.titlePrefix}｜${date}` : info.titlePrefix;
}

export function taskTitleWithSuffix(task: Task, date: string, suffix = ""): string {
  return suffix ? `${taskTitle(task, date)}${taskInfo(task).titleSuffixSeparator ?? "｜"}${suffix}` : taskTitle(task, date);
}

/** 一次运行产出多篇（一集一篇）的任务。归档、编排、发布校验三层共用这一个判据。 */
export function isEpisodeArticleTask(task: string): boolean {
  return isTask(task) && Boolean(taskInfo(task).episodeArticles);
}

function isoWeekLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  const isoDay = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - isoDay);

  const isoYear = value.getUTCFullYear();
  const isoYearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((value.getTime() - isoYearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}年第${week}周`;
}

export function taskPostRelPath(task: Task, date: string): string {
  const fileName = taskInfo(task)
    .fileName.replace("{date}", date)
    .replace("{compactDate}", date.replaceAll("-", ""));
  return path.join("src/content/posts/zh-cn", fileName);
}

export function tasksForInput(input: TaskInput): Task[] {
  if (input === "all") return [...TASKS];
  return [input];
}

export function scheduledTaskInput(schedule: string): { task: TaskInput; dateOffset: number; dateTimeZone?: string } {
  const mapped = SCHEDULED_TASK_INPUTS[schedule];
  return { task: mapped?.task || "all", dateOffset: mapped?.dateOffset || 0, dateTimeZone: mapped?.dateTimeZone };
}

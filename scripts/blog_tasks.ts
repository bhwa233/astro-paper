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
  /** frontmatter 写入 `wechat.enabled`，进入公众号同步流水线。 */
  wechatEnabled?: boolean;
  sourceContract?: PostSourceContract;
};

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
    description: "每日 Reddit 分类精选，按人生、市场与人物问答三类整理通过来源服务热度与内容质量筛选的帖子。",
    fileName: "reddit-{date}.md",
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
  "0 8 * * *": { task: "reddit-top20", dateTimeZone: "America/Los_Angeles" },
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
  return info.weekLabelInTitle ? `${info.titlePrefix}｜${isoWeekLabel(date)}` : info.titlePrefix;
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
  return path.join("src/content/posts/zh-cn", taskInfo(task).fileName.replace("{date}", date));
}

export function tasksForInput(input: TaskInput): Task[] {
  if (input === "all") return [...TASKS];
  return [input];
}

export function scheduledTaskInput(schedule: string): { task: TaskInput; dateOffset: number; dateTimeZone?: string } {
  const mapped = SCHEDULED_TASK_INPUTS[schedule];
  return { task: mapped?.task || "all", dateOffset: mapped?.dateOffset || 0, dateTimeZone: mapped?.dateTimeZone };
}

// 发布元数据的契约层：栏目名、标签受控词表、一句话结论的字数边界。
//
// 这三个字段和选卡出自同一次 AI 调用——模型手上有它刚挑出的十条回答，写「核心结论」
// 才有依据；单独再开一次调用只能拿到标题和问题，要写出同样质量还得把卡片再喂一遍。
//
// 但严格度和选卡不同：选卡的校验器一抛错就重试整次调用，连带重新选题。标签用错一个词
// 不该让当天的选题重摇，所以这里的解析函数**从不抛错**，只降级并把原因记下来。
import { compact } from "./blog_common.ts";

/**
 * 固定栏目名。不进 AI，也不逐条存储，发布时直接写进 metadata.json。
 *
 * 和主题域标签「人性观察」只差一个字，读 publish.json 时容易看串：这里是栏目，那里是标签。
 */
export const REDDIT_LIFE_VIDEO_SERIES = "人生观察";

/**
 * 主题域。每条内容至少命中两个，保证「这条视频讲什么」始终有答案。
 *
 * 栏目名固定之后，标签是唯一的区分信号，所以主题域必须被覆盖，不能全靠情绪钩子凑数。
 */
export const REDDIT_LIFE_VIDEO_PRIMARY_TAGS = ["职场生存", "金钱消费", "婚姻情感", "家庭关系", "身心健康", "人性观察", "认知思维", "社会变迁"] as const;

/** 人群视角、内容形态、情绪钩子、实用向。用来补充主题域之外的检索面。 */
export const REDDIT_LIFE_VIDEO_SECONDARY_TAGS = [
  "医护视角",
  "从业者爆料",
  "中年人生",
  "年轻人困境",
  "富人世界",
  "普通人故事",
  "高赞问答",
  "亲身经历",
  "冷知识",
  "反常识",
  "避坑指南",
  "灵魂拷问",
  "离谱见闻",
  "破防瞬间",
  "后悔清单",
  "意想不到",
  "细思极恐",
  "省钱技巧",
  "生活妙招",
  "效率工具",
  "健康常识",
  "相处之道",
] as const;

export const REDDIT_LIFE_VIDEO_TAG_VOCABULARY: readonly string[] = [...REDDIT_LIFE_VIDEO_PRIMARY_TAGS, ...REDDIT_LIFE_VIDEO_SECONDARY_TAGS];

export const REDDIT_LIFE_VIDEO_TAG_MIN = 3;
export const REDDIT_LIFE_VIDEO_TAG_MAX = 5;
export const REDDIT_LIFE_VIDEO_PRIMARY_TAG_MIN = 2;

/**
 * 一句话结论的字数带。28 到 45 是目标区间，60 是硬顶。
 *
 * 标题上限 20 字，summary 只多十来个字就会被写成标题的同义改写，白占描述第一行；
 * 下限逼着模型写出完整结论而不是短语。超过 60 视为模型没听懂任务，整条降级。
 */
export const REDDIT_LIFE_VIDEO_SUMMARY_MIN_CHARS = 28;
export const REDDIT_LIFE_VIDEO_SUMMARY_MAX_CHARS = 45;
export const REDDIT_LIFE_VIDEO_SUMMARY_HARD_MAX_CHARS = 60;

/** 词表按组渲染进提示词。分组只影响可读性，校验只认扁平集合。 */
export function redditLifeVideoTagVocabularyPrompt(): string {
  return [
    `主题域（至少选 ${REDDIT_LIFE_VIDEO_PRIMARY_TAG_MIN} 个）：${REDDIT_LIFE_VIDEO_PRIMARY_TAGS.join(" / ")}`,
    `其他维度：${REDDIT_LIFE_VIDEO_SECONDARY_TAGS.join(" / ")}`,
  ].join("\n");
}

export type RedditLifeVideoTaxonomy = {
  status: "processed" | "failed";
  tags: string[];
  summary: string;
  /** 模型想用但不在词表里的词。攒几周就知道该往词表里补什么，不必拍脑袋扩表。 */
  droppedTags: string[];
  /** 落在 28–45 之外但没超过硬顶。接受，但记下来便于回看提示词效果。 */
  summaryOutOfBand: boolean;
  /** 降级原因。status 为 processed 时为空。 */
  problems: string[];
};

const PRIMARY_TAG_SET = new Set<string>(REDDIT_LIFE_VIDEO_PRIMARY_TAGS);
const TAG_SET = new Set<string>(REDDIT_LIFE_VIDEO_TAG_VOCABULARY);

/** 去掉平台习惯的井号和顿号空格，让「#职场生存」这类写法也能命中词表。 */
function normalizeTag(value: unknown): string {
  return compact(String(value ?? "")).replace(/^#+/, "");
}

/** 只比对中文字符，避免模型给 summary 加了书名号或句号就被判成照抄标题。 */
function comparable(text: string): string {
  return text.replace(/[^\p{Script=Han}\p{Letter}\p{Number}]/gu, "");
}

function resolveTags(raw: unknown, problems: string[], droppedTags: string[]): string[] {
  if (!Array.isArray(raw)) {
    problems.push("tags is not an array");
    return [];
  }

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    // 词表外的词丢弃而不是整条判失败：留住信号，也不浪费一次重试。
    if (TAG_SET.has(tag)) kept.push(tag);
    else droppedTags.push(tag);
  }

  if (kept.length < REDDIT_LIFE_VIDEO_TAG_MIN) {
    problems.push(`only ${kept.length} of ${REDDIT_LIFE_VIDEO_TAG_MIN} required tags survived the vocabulary check`);
    return [];
  }

  // 超出上限时先留主题域再补其他：直接截前 N 个可能把主题域截没，
  // 而主题域是栏目名固定之后唯一的区分信号。
  const primary = kept.filter(tag => PRIMARY_TAG_SET.has(tag));
  const secondary = kept.filter(tag => !PRIMARY_TAG_SET.has(tag));
  const tags = [...primary, ...secondary].slice(0, REDDIT_LIFE_VIDEO_TAG_MAX);

  const primaryCount = tags.filter(tag => PRIMARY_TAG_SET.has(tag)).length;
  if (primaryCount < REDDIT_LIFE_VIDEO_PRIMARY_TAG_MIN) {
    problems.push(`only ${primaryCount} of ${REDDIT_LIFE_VIDEO_PRIMARY_TAG_MIN} required primary tags present`);
    return [];
  }
  return tags;
}

function resolveSummary(raw: unknown, title: string, problems: string[]): { summary: string; outOfBand: boolean } {
  const summary = compact(String(raw ?? "")).replace(/^["“”「『]+|["“”」』]+$/g, "");
  if (!summary || !/[一-鿿]/.test(summary)) {
    problems.push("summary is empty or not Chinese");
    return { summary: "", outOfBand: false };
  }
  const length = [...summary].length;
  if (length > REDDIT_LIFE_VIDEO_SUMMARY_HARD_MAX_CHARS) {
    problems.push(`summary is ${length} characters, hard limit is ${REDDIT_LIFE_VIDEO_SUMMARY_HARD_MAX_CHARS}`);
    return { summary: "", outOfBand: false };
  }
  // 标题是问题钩子，summary 是帖子给出的答案。写成同一句话等于白占描述第一行。
  if (comparable(summary) === comparable(title)) {
    problems.push("summary restates the title instead of giving the conclusion");
    return { summary: "", outOfBand: false };
  }
  return { summary, outOfBand: length < REDDIT_LIFE_VIDEO_SUMMARY_MIN_CHARS || length > REDDIT_LIFE_VIDEO_SUMMARY_MAX_CHARS };
}

/**
 * 从选卡响应里取出发布元数据。任何问题都降级为 status: "failed"，绝不抛错。
 *
 * 抛错会让 generateJsonStageWithRetries 重试整次调用，而那次调用同时在选题选答——
 * 一个标签问题不该让当天的视频内容重摇一遍。宁可这天没有标签，也不要动内容。
 */
export function resolveRedditLifeVideoTaxonomy(raw: unknown, title: string): RedditLifeVideoTaxonomy {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const problems: string[] = [];
  const droppedTags: string[] = [];

  const tags = resolveTags(value.tags, problems, droppedTags);
  const { summary, outOfBand } = resolveSummary(value.summary, title, problems);

  if (!tags.length || !summary) return { status: "failed", tags: [], summary: "", droppedTags, summaryOutOfBand: false, problems };
  return { status: "processed", tags, summary, droppedTags, summaryOutOfBand: outOfBand, problems };
}

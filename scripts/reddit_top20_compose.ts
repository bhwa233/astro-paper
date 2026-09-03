// Reddit 分类精选规则层：模型只返回语义 JSON（中文标题 + Markdown 综合摘要），
// 事实字段（热度/来源/帖子链接）一律取自脚本抓取的 source，
// 由这里确定性地组装成 archive 层可消费的中间契约 Markdown。
import {
  ARCHIVE_PAYLOAD_MARKER,
  bulletValue,
  decodeMarkdownBlock,
  extractBullets,
  hasChinese,
  looksLowSignal,
  normalizeMarkdownBlock,
  parseModelJsonObject,
} from "./compose_common.ts";

// 单帖摘要下限；去掉空白后计长，避免模型退回一两句抽象概括。栏目可以各自覆盖：
// 讨论体量差得很远，一个数字压不住四个栏目。
const SUMMARY_MIN_CHARS = 300;

// 每个栏目逐帖调用模型综合正文与评论，产出标题 + 描述 + 摘要。抓取层不分栏目：
// 一个端点、一份 policy，只有 subreddits 不同，因此四个栏目拿到的 source block
// 形状完全一样，差别只在各自的提示词怎么读它。
export const REDDIT_CATEGORIES = [
  {
    key: "life",
    title: "问答精选",
    fileNameSuffix: "life",
    subreddits: ["AskReddit", "askscience"],
    sourceLimits: null,
    summaryMinChars: SUMMARY_MIN_CHARS,
    summaryFormat: "numbered",
  },
  {
    key: "life-discussions",
    title: "人生讨论",
    fileNameSuffix: "life-discussions",
    subreddits: ["confessions", "changemyview", "tifu"],
    sourceLimits: null,
    summaryMinChars: SUMMARY_MIN_CHARS,
    summaryFormat: "narrative",
  },
  {
    key: "markets",
    title: "市场与价值投资",
    fileNameSuffix: "markets",
    subreddits: ["stocks", "ValueInvesting", "investing", "wallstreetbets"],
    sourceLimits: null,
    // r/wallstreetbets 有大量梗图帖，评论区就是几句嘴炮。按 300 收，这些帖子会
    // 重试三次后整帖被丢，当期条目数明显缩水；它们本来就没有 300 字的料，
    // 下限该迁就内容，而不是让内容迁就下限。
    summaryMinChars: 150,
    summaryFormat: "numbered",
  },
  {
    key: "ama",
    title: "人物与问答",
    fileNameSuffix: "ama",
    subreddits: ["IAmA", "AMA", "casualiama"],
    sourceLimits: {
      topLevelCommentLimit: 60,
      directReplyLimit: 30,
      detailCommentLimit: 200,
    },
    summaryMinChars: SUMMARY_MIN_CHARS,
    summaryFormat: "numbered",
  },
] as const;

export type RedditCategoryKey = (typeof REDDIT_CATEGORIES)[number]["key"];
export type RedditCategory = (typeof REDDIT_CATEGORIES)[number];
export type RedditSummaryFormat = RedditCategory["summaryFormat"];

const CATEGORY_BY_KEY = new Map<RedditCategoryKey, RedditCategory>(REDDIT_CATEGORIES.map(category => [category.key, category]));
const CATEGORY_BY_SUBREDDIT = new Map<string, RedditCategoryKey>(
  REDDIT_CATEGORIES.flatMap(category => category.subreddits.map(subreddit => [subreddit.toLowerCase(), category.key] as const))
);

// description 只喂 frontmatter，不进正文；正文首段因此不必再兼任摘要句。
const DESCRIPTION_MAX_CHARS = 100;
// 提示词以吸引力与信息完整为目标，不要求模型刻意压缩标题。这里仅拦截异常长句：
// 下游微信稿直接拿第一帖标题当图文标题，50 字仍能和品牌后缀一起落在 64 字平台上限内。
const TITLE_MAX_CHARS = 50;

export type RedditModelItem = {
  rank: number;
  title_zh: string;
  description: string;
  summary: string;
};

export type RedditTitleTranslation = {
  rank: number;
  title_zh: string;
};

export type RedditSourceFact = {
  rank: number;
  category: RedditCategoryKey;
  subreddit: string;
  points: string;
  publishedAt: string;
  url: string;
};

export type RedditCategoryArticle = {
  category: RedditCategoryKey;
  title: string;
  fileNameSuffix: string;
  itemCount: number;
  markdown: string;
  description: string;
};

export function redditCategoryByKey(value: string): RedditCategory {
  const category = CATEGORY_BY_KEY.get(value as RedditCategoryKey);
  if (!category) throw new Error(`unsupported Reddit category: ${value || "(missing)"}`);
  return category;
}

function redditCategory(value: string, subreddit: string): RedditCategoryKey {
  const inferred = CATEGORY_BY_SUBREDDIT.get(subreddit.toLowerCase());
  // 栏目 bullet 是来源服务留下的旧标签；当前文章边界由本地 subreddit 注册表持有。
  // 来源 API 仍会按本次请求清单拒绝未请求社区，因此这里兼容旧标签不会放宽信任边界。
  if (inferred) return inferred;
  if (CATEGORY_BY_KEY.has(value as RedditCategoryKey)) {
    throw new Error(`Reddit source category ${value} does not match r/${subreddit || "(missing)"}`);
  }
  throw new Error(`Reddit source has an unsupported category/subreddit mapping: ${value || "(missing)"} / r/${subreddit || "(missing)"}`);
}

export function parseSourceFacts(source: string): RedditSourceFact[] {
  return sourceBlocks(source).map((block, index) => {
    const bullets = extractBullets(block);
    const subreddit = block.match(/^\d+\.\s*\[r\/([^\]]+)\]/)?.[1] ?? "";
    return {
      rank: index + 1,
      category: redditCategory(bulletValue(bullets, "栏目"), subreddit),
      subreddit,
      points:
        bullets
          .find(b => b.startsWith("⭐"))
          ?.replace(/^⭐\s*/, "")
          .trim() ?? "",
      publishedAt: bulletValue(bullets, "发布时间"),
      url: bulletValue(bullets, "帖子链接"),
    };
  });
}

// 整帖都落在排除主题上时模型只返回 {rank, skip:true}，该帖整块不进文章。
// 返回 null 表示丢弃；其余情况按正常摘要严格校验。
export function parseRedditItemOutcome(
  raw: string,
  expectedRank: number,
  minChars = SUMMARY_MIN_CHARS,
  summaryFormat: RedditSummaryFormat = "numbered"
): RedditModelItem | null {
  const payload = parseModelJsonObject(raw, "Reddit item summary");
  if (payload.skip === true) {
    const rank = Number(payload.rank);
    if (rank !== expectedRank) throw new Error(`Reddit item summary rank mismatch: ${rank} vs ${expectedRank}`);
    return null;
  }
  return parseRedditItemSummary(raw, expectedRank, minChars, summaryFormat);
}

export function parseRedditItemSummary(
  raw: string,
  expectedRank: number,
  minChars = SUMMARY_MIN_CHARS,
  summaryFormat: RedditSummaryFormat = "numbered"
): RedditModelItem {
  const payload = parseModelJsonObject(raw, "Reddit item summary");
  const rank = Number(payload.rank);
  const titleZh = String(payload.title_zh || "")
    .replace(/\s+/g, " ")
    .trim();
  const description = String(payload.description || "")
    .replace(/\s+/g, " ")
    .trim();
  const summary = normalizeMarkdownBlock(payload.summary);
  if (rank !== expectedRank) throw new Error(`Reddit item summary rank mismatch: ${rank} vs ${expectedRank}`);
  if (!titleZh || !hasChinese(titleZh)) throw new Error(`Reddit item ${expectedRank} needs a Chinese title`);
  if ([...titleZh].length > TITLE_MAX_CHARS) {
    throw new Error(`Reddit item ${expectedRank} title is too long: ${[...titleZh].length} > ${TITLE_MAX_CHARS}`);
  }
  if (!description || !hasChinese(description)) throw new Error(`Reddit item ${expectedRank} needs a Chinese description`);
  if ([...description].length > DESCRIPTION_MAX_CHARS) {
    throw new Error(`Reddit item ${expectedRank} description is too long: ${[...description].length} > ${DESCRIPTION_MAX_CHARS}`);
  }
  if (!summary || !hasChinese(summary) || looksLowSignal(summary)) {
    throw new Error(`Reddit item ${expectedRank} has empty or low-signal summary`);
  }
  if (/^\s{0,3}#{1,6}\s/m.test(summary)) throw new Error(`Reddit item ${expectedRank} summary must not use Markdown headings`);
  if (summaryFormat === "narrative" && /^(?:\s*\d+\\?\.|\s*[-*+]\s)/m.test(summary)) {
    throw new Error(`Reddit item ${expectedRank} narrative summary must not use lists`);
  }
  const length = summary.replace(/\s+/g, "").length;
  if (length < minChars) throw new Error(`Reddit item ${expectedRank} summary is too short: ${length} < ${minChars}`);
  return { rank, title_zh: titleZh, description, summary };
}

export function parseRedditTitleTranslation(raw: string, expectedRank: number): RedditTitleTranslation {
  const payload = parseModelJsonObject(raw, "Reddit title translation");
  const rank = Number(payload.rank);
  const titleZh = String(payload.title_zh || "")
    .replace(/\s+/g, " ")
    .trim();
  if (rank !== expectedRank) throw new Error(`Reddit title translation rank mismatch: ${rank} vs ${expectedRank}`);
  if (!titleZh || !hasChinese(titleZh)) throw new Error(`Reddit title translation ${expectedRank} needs a Chinese title`);
  if ([...titleZh].length > TITLE_MAX_CHARS) {
    throw new Error(`Reddit title translation ${expectedRank} is too long: ${[...titleZh].length} > ${TITLE_MAX_CHARS}`);
  }
  return { rank, title_zh: titleZh };
}

function sourceBlocks(source: string): string[] {
  const markerIndex = source.indexOf(ARCHIVE_PAYLOAD_MARKER);
  const body = markerIndex >= 0 ? source.slice(0, markerIndex) : source;
  return body
    .split(/(?=^\d+\.\s*\[r\/)/gm)
    .map(block => block.trim())
    .filter(block => /^\d+\.\s*\[r\//.test(block));
}

export function parseRedditItemSummaries(source: string, minChars = SUMMARY_MIN_CHARS, summaryFormat: RedditSummaryFormat = "numbered"): RedditModelItem[] {
  const blocks = sourceBlocks(source);
  if (!blocks.length) throw new Error("Reddit combined source has no item blocks");
  return blocks.map((block, index) => {
    const rank = Number(block.match(/^(\d+)\.\s*\[r\//)?.[1]);
    if (!Number.isInteger(rank) || rank !== index + 1) throw new Error(`Reddit combined source item ${index + 1} has invalid rank`);
    const bullets = extractBullets(block);
    return parseRedditItemSummary(
      JSON.stringify({
        rank,
        title_zh: bulletValue(bullets, "中文标题"),
        description: bulletValue(bullets, "一句话描述"),
        summary: decodeMarkdownBlock(bulletValue(bullets, "综合摘要")),
      }),
      rank,
      minChars,
      summaryFormat
    );
  });
}

// 摘要是多段 Markdown，放在事实 bullet 之后作为独立正文块；archive 层按同样的边界切回。
export function composeRedditBody(modelItems: RedditModelItem[], facts: RedditSourceFact[]): string {
  if (!facts.length) throw new Error("Reddit source produced no items to compose");
  const byRank = new Map(modelItems.map(item => [item.rank, item]));
  const blocks = facts.map(fact => {
    const model = byRank.get(fact.rank);
    if (!model) throw new Error(`Reddit model JSON is missing rank ${fact.rank}`);
    const lines = [`${fact.rank}. 🔴 ${model.title_zh}`];
    if (fact.points) lines.push(`- ⭐ ${fact.points}`);
    if (fact.subreddit) lines.push(`- 来源：r/${fact.subreddit}`);
    if (fact.url) lines.push(`- 帖子：${fact.url}`);
    lines.push("", model.summary);
    return lines.join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}

// frontmatter description 用首帖的专用字段；正文不再承担这一句，切首段会切出小标题和引用记号。
export function redditTop20Description(items: RedditModelItem[]): string {
  return items[0]?.description || "";
}

export function redditMarkdownFromItemSummaries(source: string): string {
  return composeRedditBody(parseRedditItemSummaries(source), parseSourceFacts(source));
}

export function redditCategoryArticleFromSource(source: string, category: RedditCategory): RedditCategoryArticle | null {
  const facts = parseSourceFacts(source);
  const sourceFacts = facts.filter(fact => fact.category === category.key);
  if (!sourceFacts.length) return null;
  const articleFacts = sourceFacts.map((fact, index) => ({ ...fact, rank: index + 1 }));
  const modelByRank = new Map(parseRedditItemSummaries(source, category.summaryMinChars, category.summaryFormat).map(item => [item.rank, item]));
  const articleItems = sourceFacts.map((fact, index) => {
    const item = modelByRank.get(fact.rank);
    if (!item) throw new Error(`Reddit model JSON is missing rank ${fact.rank}`);
    return { ...item, rank: index + 1 };
  });
  return {
    category: category.key,
    title: category.title,
    fileNameSuffix: category.fileNameSuffix,
    itemCount: articleItems.length,
    markdown: composeRedditBody(articleItems, articleFacts),
    description: redditTop20Description(articleItems),
  };
}

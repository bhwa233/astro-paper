// Reddit 分类精选规则层：模型只返回语义 JSON（中文标题 + Markdown 综合摘要），
// 事实字段（热度/来源/帖子链接）一律取自脚本抓取的 source，
// 由这里确定性地组装成 archive 层可消费的中间契约 Markdown。
import { ARCHIVE_PAYLOAD_MARKER, bulletValue, decodeMarkdownBlock, extractBullets, hasChinese, looksLowSignal, normalizeMarkdownBlock, parseModelJsonObject } from "./compose_common.ts";

// 单帖摘要下限；去掉空白后计长，避免模型退回一两句抽象概括。
const SUMMARY_MIN_CHARS = 300;

export const REDDIT_CATEGORIES = [
  {
    key: "life",
    title: "人生与社会",
    fileNameSuffix: "life",
    subreddits: ["AskReddit", "confessions", "changemyview", "tifu"],
  },
  {
    key: "markets",
    title: "市场与价值投资",
    fileNameSuffix: "markets",
    subreddits: ["stocks", "ValueInvesting", "investing", "wallstreetbets"],
  },
  {
    key: "ama",
    title: "人物与问答",
    fileNameSuffix: "ama",
    subreddits: ["IAmA", "AMA", "casualiama"],
  },
] as const;

export type RedditCategoryKey = (typeof REDDIT_CATEGORIES)[number]["key"];
export type RedditCategory = (typeof REDDIT_CATEGORIES)[number];

const CATEGORY_BY_KEY = new Map<RedditCategoryKey, RedditCategory>(REDDIT_CATEGORIES.map(category => [category.key, category]));
const CATEGORY_BY_SUBREDDIT = new Map<string, RedditCategoryKey>(
  REDDIT_CATEGORIES.flatMap(category => category.subreddits.map(subreddit => [subreddit.toLowerCase(), category.key] as const)),
);

// description 只喂 frontmatter，不进正文；正文首段因此不必再兼任摘要句。
const DESCRIPTION_MAX_CHARS = 100;

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
  if (inferred && (!value || value === inferred)) return inferred;
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
      points: bullets.find(b => b.startsWith("⭐"))?.replace(/^⭐\s*/, "").trim() ?? "",
      publishedAt: bulletValue(bullets, "发布时间"),
      url: bulletValue(bullets, "帖子链接"),
    };
  });
}

// 整帖都落在排除主题上时模型只返回 {rank, skip:true}，该帖整块不进文章。
// 返回 null 表示丢弃；其余情况按正常摘要严格校验。
export function parseRedditItemOutcome(raw: string, expectedRank: number): RedditModelItem | null {
  const payload = parseModelJsonObject(raw, "Reddit item summary");
  if (payload.skip === true) {
    const rank = Number(payload.rank);
    if (rank !== expectedRank) throw new Error(`Reddit item summary rank mismatch: ${rank} vs ${expectedRank}`);
    return null;
  }
  return parseRedditItemSummary(raw, expectedRank);
}

export function parseRedditItemSummary(raw: string, expectedRank: number): RedditModelItem {
  const payload = parseModelJsonObject(raw, "Reddit item summary");
  const rank = Number(payload.rank);
  const titleZh = String(payload.title_zh || "").replace(/\s+/g, " ").trim();
  const description = String(payload.description || "").replace(/\s+/g, " ").trim();
  const summary = normalizeMarkdownBlock(payload.summary);
  if (rank !== expectedRank) throw new Error(`Reddit item summary rank mismatch: ${rank} vs ${expectedRank}`);
  if (!titleZh || !hasChinese(titleZh)) throw new Error(`Reddit item ${expectedRank} needs a Chinese title`);
  if (!description || !hasChinese(description)) throw new Error(`Reddit item ${expectedRank} needs a Chinese description`);
  if ([...description].length > DESCRIPTION_MAX_CHARS) {
    throw new Error(`Reddit item ${expectedRank} description is too long: ${[...description].length} > ${DESCRIPTION_MAX_CHARS}`);
  }
  if (!summary || !hasChinese(summary) || looksLowSignal(summary)) {
    throw new Error(`Reddit item ${expectedRank} has empty or low-signal summary`);
  }
  if (/^\s{0,3}#{1,6}\s/m.test(summary)) throw new Error(`Reddit item ${expectedRank} summary must not use Markdown headings`);
  const length = summary.replace(/\s+/g, "").length;
  if (length < SUMMARY_MIN_CHARS) throw new Error(`Reddit item ${expectedRank} summary is too short: ${length} < ${SUMMARY_MIN_CHARS}`);
  return { rank, title_zh: titleZh, description, summary };
}

export function parseRedditTitleTranslation(raw: string, expectedRank: number): RedditTitleTranslation {
  const payload = parseModelJsonObject(raw, "Reddit title translation");
  const rank = Number(payload.rank);
  const titleZh = String(payload.title_zh || "").replace(/\s+/g, " ").trim();
  if (rank !== expectedRank) throw new Error(`Reddit title translation rank mismatch: ${rank} vs ${expectedRank}`);
  if (!titleZh || !hasChinese(titleZh)) throw new Error(`Reddit title translation ${expectedRank} needs a Chinese title`);
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

export function parseRedditItemSummaries(source: string): RedditModelItem[] {
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

function composeRedditTitleOnlyBody(items: RedditTitleTranslation[], facts: RedditSourceFact[]): string {
  if (!facts.length) throw new Error("Reddit source produced no items to compose");
  const byRank = new Map(items.map(item => [item.rank, item]));
  const blocks = facts.map(fact => {
    const item = byRank.get(fact.rank);
    if (!item) throw new Error(`Reddit title translation is missing rank ${fact.rank}`);
    const lines = [`${fact.rank}. 🔴 ${item.title_zh}`];
    if (fact.points) lines.push(`- ⭐ ${fact.points}`);
    if (fact.subreddit) lines.push(`- 来源：r/${fact.subreddit}`);
    if (fact.url) lines.push(`- 帖子：${fact.url}`);
    return lines.join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}

function parseRedditTitleTranslations(source: string): RedditTitleTranslation[] {
  const blocks = sourceBlocks(source);
  if (!blocks.length) throw new Error("Reddit combined source has no item blocks");
  return blocks.map((block, index) => {
    const rank = Number(block.match(/^(\d+)\.\s*\[r\//)?.[1]);
    if (!Number.isInteger(rank) || rank !== index + 1) throw new Error(`Reddit combined source item ${index + 1} has invalid rank`);
    return parseRedditTitleTranslation(JSON.stringify({ rank, title_zh: bulletValue(extractBullets(block), "中文标题") }), rank);
  });
}

export function redditCategoryArticleFromSource(source: string, category: RedditCategory): RedditCategoryArticle | null {
  const facts = parseSourceFacts(source);
  const sourceFacts = facts.filter(fact => fact.category === category.key);
  if (!sourceFacts.length) return null;
  const articleFacts = sourceFacts.map((fact, index) => ({ ...fact, rank: index + 1 }));
  if (category.key === "life") {
    const modelByRank = new Map(parseRedditItemSummaries(source).map(item => [item.rank, item]));
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
  const translations = parseRedditTitleTranslations(source);
  const articleItems = sourceFacts.map((fact, index) => {
    const item = translations.find(translation => translation.rank === fact.rank);
    if (!item) throw new Error(`Reddit title translation is missing rank ${fact.rank}`);
    return { ...item, rank: index + 1 };
  });
  return {
    category: category.key,
    title: category.title,
    fileNameSuffix: category.fileNameSuffix,
    itemCount: articleItems.length,
    markdown: composeRedditTitleOnlyBody(articleItems, articleFacts),
    description: "",
  };
}

// Reddit Top 20 规则层：模型只返回语义 JSON（中文标题 + Markdown 综合摘要），
// 事实字段（热度/来源/帖子链接）一律取自脚本抓取的 source，
// 由这里确定性地组装成 archive 层可消费的中间契约 Markdown。
import { ARCHIVE_PAYLOAD_MARKER } from "./astro_paper_archive.ts";
import { bulletValue, decodeMarkdownBlock, extractBullets, hasChinese, looksLowSignal, normalizeMarkdownBlock, parseModelJsonObject } from "./compose_common.ts";

// 单帖摘要下限；去掉空白后计长，避免模型退回一两句抽象概括。
const SUMMARY_MIN_CHARS = 300;

export type RedditModelItem = {
  rank: number;
  title_zh: string;
  summary: string;
};

export type RedditSourceFact = {
  rank: number;
  subreddit: string;
  points: string;
  url: string;
};

export function parseSourceFacts(source: string): RedditSourceFact[] {
  return sourceBlocks(source).map((block, index) => {
    const bullets = extractBullets(block);
    return {
      rank: index + 1,
      subreddit: block.match(/^\d+\.\s*\[r\/([^\]]+)\]/)?.[1] ?? "",
      points: bullets.find(b => b.startsWith("⭐"))?.replace(/^⭐\s*/, "").trim() ?? "",
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
  const summary = normalizeMarkdownBlock(payload.summary);
  if (rank !== expectedRank) throw new Error(`Reddit item summary rank mismatch: ${rank} vs ${expectedRank}`);
  if (!titleZh || !hasChinese(titleZh)) throw new Error(`Reddit item ${expectedRank} needs a Chinese title`);
  if (!summary || !hasChinese(summary) || looksLowSignal(summary)) {
    throw new Error(`Reddit item ${expectedRank} has empty or low-signal summary`);
  }
  if (/^\s{0,3}#{1,6}\s/m.test(summary)) throw new Error(`Reddit item ${expectedRank} summary must not use Markdown headings`);
  const length = summary.replace(/\s+/g, "").length;
  if (length < SUMMARY_MIN_CHARS) throw new Error(`Reddit item ${expectedRank} summary is too short: ${length} < ${SUMMARY_MIN_CHARS}`);
  return { rank, title_zh: titleZh, summary };
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

// frontmatter description 只取首帖摘要的第一段，避免把列表记号和加粗小标题拼进摘要行。
export function redditTop20Description(items: RedditModelItem[]): string {
  return (items[0]?.summary || "")
    .split(/\n\s*\n/)[0]
    .replace(/^[>\s]*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/[`*_>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function redditMarkdownFromItemSummaries(source: string): string {
  return composeRedditBody(parseRedditItemSummaries(source), parseSourceFacts(source));
}

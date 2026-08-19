import { bulletValue, decodeMarkdownBlock, extractBullets, hasChinese, looksLowSignal, normalizeMarkdownBlock, parseModelJsonObject } from "./compose_common.ts";

const TITLE_MAX_CHARS = 50;
const SUMMARY_MIN_CHARS = 300;

export type RedditTrendingItemSummary = {
  rank: number;
  titleZh: string;
  summary: string;
};

type RedditTrendingSourceFact = {
  rank: number;
  subreddit: string;
  points: string;
  comments: string;
  url: string;
};

function sourceBlocks(source: string): string[] {
  return source
    .split(/(?=^##\s+\d+\.\s+)/gm)
    .map(block => block.trim())
    .filter(block => /^##\s+\d+\.\s+/.test(block));
}

function parseSourceFacts(source: string): RedditTrendingSourceFact[] {
  const blocks = sourceBlocks(source);
  if (!blocks.length) throw new Error("Reddit trending combined source has no item blocks");
  return blocks.map((block, index) => {
    const rank = Number(block.match(/^##\s+(\d+)\.\s+/m)?.[1]);
    if (!Number.isInteger(rank) || rank !== index + 1) throw new Error(`Reddit trending source item ${index + 1} has an invalid rank`);
    const bullets = extractBullets(block);
    const heat = bulletValue(bullets, "**热度**").match(/^(\d+) points · (\d+) 评论/);
    const subreddit = bulletValue(bullets, "**来源**").match(/^\[r\/([^\]]+)\]/)?.[1] || "";
    const url = bulletValue(bullets, "**帖子**");
    if (!heat || !subreddit || !/^https:\/\/www\.reddit\.com\//.test(url)) {
      throw new Error(`Reddit trending source item ${rank} is missing its factual metadata`);
    }
    return { rank, subreddit, points: heat[1], comments: heat[2], url };
  });
}

export function parseRedditTrendingItemSummary(raw: string, expectedRank: number): RedditTrendingItemSummary {
  const payload = parseModelJsonObject(raw, "Reddit trending item summary");
  const rank = Number(payload.rank);
  const titleZh = String(payload.title_zh || "").replace(/\s+/g, " ").trim();
  const summary = normalizeMarkdownBlock(String(payload.summary || ""));
  if (rank !== expectedRank) throw new Error(`Reddit trending item summary rank mismatch: ${rank} vs ${expectedRank}`);
  if (!titleZh || !hasChinese(titleZh)) throw new Error(`Reddit trending item ${expectedRank} needs a Chinese title`);
  if ([...titleZh].length > TITLE_MAX_CHARS) {
    throw new Error(`Reddit trending item ${expectedRank} title is too long: ${[...titleZh].length} > ${TITLE_MAX_CHARS}`);
  }
  if (!summary || !hasChinese(summary) || looksLowSignal(summary)) {
    throw new Error(`Reddit trending item ${expectedRank} has empty or low-signal summary`);
  }
  if (/^\s{0,3}#{1,6}\s/m.test(summary)) throw new Error(`Reddit trending item ${expectedRank} summary must not use Markdown headings`);
  if (/https?:\/\/|\]\([^)]*\)/.test(summary)) throw new Error(`Reddit trending item ${expectedRank} summary must not include links`);
  const length = summary.replace(/\s+/g, "").length;
  if (length < SUMMARY_MIN_CHARS) throw new Error(`Reddit trending item ${expectedRank} summary is too short: ${length} < ${SUMMARY_MIN_CHARS}`);
  return { rank, titleZh, summary };
}

export function redditTrendingMarkdownFromItemSummaries(source: string): string {
  const facts = parseSourceFacts(source);
  const summaries = sourceBlocks(source).map((block, index) => {
    const bullets = extractBullets(block);
    return parseRedditTrendingItemSummary(
      JSON.stringify({
        rank: index + 1,
        title_zh: bulletValue(bullets, "**中文标题**"),
        summary: decodeMarkdownBlock(bulletValue(bullets, "**综合摘要**")),
      }),
      index + 1,
    );
  });
  const byRank = new Map(summaries.map(summary => [summary.rank, summary]));
  const titles = new Set<string>();
  const blocks = facts.map(fact => {
    const summary = byRank.get(fact.rank);
    if (!summary) throw new Error(`Reddit trending model summary is missing rank ${fact.rank}`);
    const titleKey = summary.titleZh.toLowerCase();
    if (titles.has(titleKey)) throw new Error(`Reddit trending model summary reuses title: ${summary.titleZh}`);
    titles.add(titleKey);
    return `${fact.rank}. 🔴 ${summary.titleZh}\n- ⭐ ${fact.points} points · ${fact.comments} 评论\n- 来源：r/${fact.subreddit}\n- 帖子：${fact.url}\n\n${summary.summary}`;
  });
  return `${blocks.join("\n\n")}\n`;
}

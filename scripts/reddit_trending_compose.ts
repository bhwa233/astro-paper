import { bulletValue, extractBullets } from "./compose_common.ts";
import { parseRedditTitleTranslation } from "./reddit_top20_compose.ts";

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

export function redditTrendingMarkdownFromTitleTranslations(source: string): string {
  const facts = parseSourceFacts(source);
  const translations = sourceBlocks(source).map((block, index) => {
    const bullets = extractBullets(block);
    return parseRedditTitleTranslation(
      JSON.stringify({
        rank: index + 1,
        title_zh: bulletValue(bullets, "**中文标题**"),
      }),
      index + 1
    );
  });
  const byRank = new Map(translations.map(translation => [translation.rank, translation]));
  const titles = new Set<string>();
  const blocks = facts.map(fact => {
    const translation = byRank.get(fact.rank);
    if (!translation) throw new Error(`Reddit trending title translation is missing rank ${fact.rank}`);
    const titleKey = translation.title_zh.toLowerCase();
    if (titles.has(titleKey)) throw new Error(`Reddit trending title translation reuses title: ${translation.title_zh}`);
    titles.add(titleKey);
    return `${fact.rank}. 🔴 ${translation.title_zh}\n- ⭐ ${fact.points} points · ${fact.comments} 评论\n- 来源：r/${fact.subreddit}\n- 帖子：${fact.url}`;
  });
  return `${blocks.join("\n\n")}\n`;
}

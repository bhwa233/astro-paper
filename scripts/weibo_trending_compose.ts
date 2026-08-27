import { bulletValue, decodeMarkdownBlock, extractBullets, normalizeMarkdownBlock, numberedBlocks } from "./compose_common.ts";
import {
  extractWeiboTrendingTitleSuffix,
  extractWeiboTrendingWechatDescription,
  extractWeiboTrendingWechatTitle,
} from "./weibo_trending_title.ts";

/** 将已固化的榜单事实和逐条 AI 摘要渲染成短条目，避免整篇二次生成。 */
export function weiboTrendingArticleFromSummaries(source: string): {
  markdown: string;
  titleSuffix: string;
  wechatTitle: string;
  wechatDescription: string;
} {
  const blocks = numberedBlocks(source);
  if (!blocks.length) throw new Error("Weibo trending combined source has no item blocks");
  const titles = new Set<string>();
  const markdown = `${blocks.map((block, index) => {
    const heading = block.match(/^##\s+(\d+)\.\s+(.+)$/m);
    if (!heading || Number(heading[1]) !== index + 1) throw new Error(`Weibo trending source item ${index + 1} has an invalid heading`);
    const title = heading[2].trim();
    const titleKey = title.toLowerCase();
    if (!title || titles.has(titleKey)) throw new Error(`Weibo trending source item ${index + 1} has a duplicate or empty title`);
    titles.add(titleKey);
    const bullets = extractBullets(block);
    const url = bulletValue(bullets, "**话题**");
    const summary = normalizeMarkdownBlock(decodeMarkdownBlock(bulletValue(bullets, "**智搜摘要**")));
    if (!/^https:\/\//.test(url) || !summary) throw new Error(`Weibo trending source item ${index + 1} is missing its topic URL or summary`);
    return `## ${index + 1}. ${title}\n\n- **话题**：[在微博查看](${url})\n- **摘要**：${summary}`;
  }).join("\n\n")}\n`;
  return {
    markdown,
    titleSuffix: extractWeiboTrendingTitleSuffix(source),
    wechatTitle: extractWeiboTrendingWechatTitle(source),
    wechatDescription: extractWeiboTrendingWechatDescription(source),
  };
}

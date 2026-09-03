// 微博微信稿的规则层：唯一输入是已经归档的站点文章，本模块不拉榜、不调用模型。
import path from "node:path";
import { compact, frontmatter } from "./blog_common.ts";
import { bulletValue, extractBullets, numberedBlocks } from "./compose_common.ts";
import { validateWeiboTrendingWechatDescription, validateWeiboTrendingWechatTitle } from "./weibo_trending_title.ts";

export const WEIBO_TRENDING_WECHAT_IMAGE_LIMIT = 20;
export const WEIBO_TRENDING_WECHAT_ITEM_LIMIT = 10;
export const WEIBO_TRENDING_WECHAT_TAG = "微博热搜";
const BLOG_URL = "https://blog.bhwa233.com/";

// ------------------------------------------------------------------ A/B 开关
//
// 图片消息没有图文页脚，唯一可用的站外入口是「阅读原文」。保留独立开关，避免改动
// Reddit 的实验状态；翻转时在这里记录日期与意图。
//   2026-08-25 关闭，作为无站外入口的基线。
export const WEIBO_TRENDING_WECHAT_SHOW_SOURCE_URL = false;

export function weiboTrendingArticleUrl(articlePath: string): string {
  const slug = path.basename(articlePath, ".md");
  if (!slug) throw new Error(`cannot derive a blog URL from ${articlePath || "an empty path"}`);
  return `${BLOG_URL}posts/${encodeURIComponent(slug)}/`;
}

export function weiboTrendingWechatSyncId(archiveDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) {
    throw new Error(`invalid Weibo trending WeChat archive date: ${archiveDate || "missing"}`);
  }
  return `weibo-trending-${archiveDate}`;
}

export type WeiboTrendingWechatItem = {
  rank: number;
  title: string;
  summary: string;
};

export function parseWeiboTrendingArticleTitle(markdown: string): string {
  const encoded = markdown.match(/^title:\s*(.+)$/m)?.[1]?.trim() || "";
  if (!encoded) throw new Error("Weibo trending article is missing its frontmatter title");
  try {
    const title = encoded.startsWith('"')
      ? JSON.parse(encoded)
      : encoded.startsWith("'") && encoded.endsWith("'")
        ? encoded.slice(1, -1).replaceAll("''", "'")
        : encoded;
    if (typeof title !== "string" || !compact(title)) throw new Error("empty title");
    return compact(title);
  } catch {
    throw new Error("Weibo trending article has an invalid frontmatter title");
  }
}

export function parseWeiboTrendingArticleWechatTitle(markdown: string): string {
  const block = markdown.match(/^wechat:\s*\n((?: {2}.+(?:\n|$))*)/m)?.[1] || "";
  const encoded = block.match(/^ {2}title:\s*(.+)$/m)?.[1]?.trim() || "";
  if (!encoded) throw new Error("Weibo trending article is missing wechat.title");
  try {
    const title = encoded.startsWith('"')
      ? JSON.parse(encoded)
      : encoded.startsWith("'") && encoded.endsWith("'")
        ? encoded.slice(1, -1).replaceAll("''", "'")
        : encoded;
    return validateWeiboTrendingWechatTitle(title, "Weibo trending article wechat.title");
  } catch {
    throw new Error("Weibo trending article has an invalid wechat.title");
  }
}

export function parseWeiboTrendingArticleDescription(markdown: string): string {
  const encoded = markdown.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "";
  if (!encoded) throw new Error("Weibo trending article is missing its frontmatter description");
  try {
    const description = encoded.startsWith('"')
      ? JSON.parse(encoded)
      : encoded.startsWith("'") && encoded.endsWith("'")
        ? encoded.slice(1, -1).replaceAll("''", "'")
        : encoded;
    return validateWeiboTrendingWechatDescription(description, "Weibo trending article description");
  } catch {
    throw new Error("Weibo trending article has an invalid frontmatter description");
  }
}

export function parseWeiboTrendingArticle(markdown: string): WeiboTrendingWechatItem[] {
  const blocks = numberedBlocks(markdown);
  if (!blocks.length) throw new Error("Weibo trending article has no numbered topic blocks");
  return blocks.map((block, index) => {
    const heading = block.match(/^##\s+(\d+)\.\s+(.+)$/m);
    const title = compact(heading?.[2]);
    const summary = compact(bulletValue(extractBullets(block), "**摘要**"));
    if (!heading || Number(heading[1]) !== index + 1) throw new Error(`Weibo trending article block ${index + 1} has a non-contiguous rank`);
    if (!title) throw new Error(`Weibo trending article block ${index + 1} has an empty title`);
    if (!summary) throw new Error(`Weibo trending article block ${index + 1} has an empty summary`);
    return { rank: index + 1, title, summary };
  });
}

export function weiboTrendingWechatCardFile(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= WEIBO_TRENDING_WECHAT_IMAGE_LIMIT) {
    throw new Error(`invalid Weibo trending WeChat card index: ${index}`);
  }
  return `card-${String(index).padStart(2, "0")}.png`;
}

// sourceURL 由 A/B 开关决定：它变成草稿的 content_source_url，也就是「阅读原文」。
// 生成文件固定名为 01.md，不能把 canonical URL 当作草稿身份，否则跨日会被误判为同一篇。
// syncId 按归档日期区分，而 sourceURL 仍只控制读者是否能看到「阅读原文」；翻转 A/B 开关
// 不会让同一天的稿子被当作一篇新草稿。
export function renderWeiboTrendingWechatMarkdown({
  itemCount,
  archiveDate,
  title,
  description,
  articleUrl,
  showSourceUrl = WEIBO_TRENDING_WECHAT_SHOW_SOURCE_URL,
}: {
  itemCount: number;
  archiveDate: string;
  title: string;
  description: string;
  articleUrl: string;
  showSourceUrl?: boolean;
}): string {
  if (!description) throw new Error("Weibo trending WeChat article needs a description");
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > WEIBO_TRENDING_WECHAT_ITEM_LIMIT) {
    throw new Error(`Weibo trending WeChat article needs 1-${WEIBO_TRENDING_WECHAT_ITEM_LIMIT} items`);
  }
  title = validateWeiboTrendingWechatTitle(title, "Weibo trending WeChat article title");
  description = validateWeiboTrendingWechatDescription(description, "Weibo trending WeChat article description");
  if (!articleUrl) throw new Error("Weibo trending WeChat article needs the upstream article URL");
  const metadata = frontmatter({
    title,
    date: archiveDate,
    description,
    tags: [WEIBO_TRENDING_WECHAT_TAG],
    ogImage: weiboTrendingWechatCardFile(0),
    wechat: {
      enabled: true,
      syncId: weiboTrendingWechatSyncId(archiveDate),
      articleType: "newspic",
      sourceURL: showSourceUrl ? articleUrl : undefined,
    },
  });
  const images = Array.from({ length: itemCount + 1 }, (_, index) => `![](${weiboTrendingWechatCardFile(index)})`);
  return `${metadata}${description}\n\n${images.join("\n\n")}\n`;
}

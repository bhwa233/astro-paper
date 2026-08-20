// 微博微信稿的规则层：唯一输入是已经归档的站点文章，本模块不拉榜、不调用模型。
import path from "node:path";
import { compact, frontmatter } from "./blog_common.ts";
import { taskTitle } from "./blog_tasks.ts";
import { bulletValue, extractBullets, numberedBlocks } from "./compose_common.ts";

export const WEIBO_TRENDING_WECHAT_ITEM_LIMIT = 30;
export const WEIBO_TRENDING_WECHAT_TAG = "微博热搜";
export const WEIBO_TRENDING_WECHAT_DESCRIPTION_LIMIT = 120;
export const WEIBO_TRENDING_WECHAT_QR_FILE = "qr.png";

const BLOG_URL = "https://blog.bhwa233.com/";
export const WEIBO_TRENDING_WECHAT_QR_URL = BLOG_URL;

export type WeiboTrendingWechatItem = {
  rank: number;
  title: string;
  summary: string;
};

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

export function weiboTrendingWechatBody(items: WeiboTrendingWechatItem[]): string {
  if (!items.length) throw new Error("Weibo trending WeChat article needs at least one item");
  return items
    .slice(0, WEIBO_TRENDING_WECHAT_ITEM_LIMIT)
    .map((item, index) => `## ${index + 1}. ${compact(item.title)}\n\n${compact(item.summary)}`)
    .join("\n\n");
}

function descriptionWithTitles(items: WeiboTrendingWechatItem[], titleCount: number): string {
  return `${items
    .slice(0, titleCount)
    .map(item => compact(item.title))
    .join("、")}……等 ${items.length} 个话题。`;
}

export function weiboTrendingWechatDescription(items: WeiboTrendingWechatItem[]): string {
  if (!items.length) throw new Error("Weibo trending WeChat description needs at least one item");
  for (let titleCount = Math.min(3, items.length); titleCount >= 1; titleCount -= 1) {
    const description = descriptionWithTitles(items, titleCount);
    if ([...description].length <= WEIBO_TRENDING_WECHAT_DESCRIPTION_LIMIT) return description;
  }
  const description = descriptionWithTitles(items, 1);
  return `${[...description].slice(0, WEIBO_TRENDING_WECHAT_DESCRIPTION_LIMIT - 1).join("")}…`;
}

// 微信正文里的外链会被拆成尾注，因此正文只保留二维码这个固定出口。
// 卡片沿用 Reddit 微信稿验证过的 table 结构，避免微信编辑器破坏 flex 布局。
function qrCard(): string {
  return [
    '<section style="margin:24px 0 0;padding:16px 18px;background:#f7f7f7;border-radius:6px;">',
    '<table style="width:100%;min-width:0;margin:0;border-collapse:collapse;">',
    "<tbody><tr>",
    '<td style="border:none;padding:0;vertical-align:middle;">',
    '<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#8a8a8a;">长按识别二维码，在博客阅读更多内容</p>',
    `<p style="margin:0;font-size:13px;line-height:1.5;color:#576b95;word-break:break-all;">${BLOG_URL}</p>`,
    "</td>",
    '<td style="border:none;width:96px;padding:0 0 0 14px;vertical-align:middle;">',
    `<img src="${WEIBO_TRENDING_WECHAT_QR_FILE}" alt="博客二维码" width="96" height="96" />`,
    "</td>",
    "</tr></tbody></table>",
    "</section>",
  ].join("\n");
}

export function weiboTrendingWechatFooter(): string {
  return qrCard();
}

export function weiboTrendingArticleUrl(articlePath: string): string {
  const slug = path.basename(articlePath, ".md");
  if (!slug) throw new Error(`cannot derive a blog URL from ${articlePath || "an empty path"}`);
  return `${BLOG_URL}posts/${encodeURIComponent(slug)}/`;
}

export function renderWeiboTrendingWechatMarkdown({
  items,
  archiveDate,
  description,
  footer,
  articleUrl,
  coverFile = "",
}: {
  items: WeiboTrendingWechatItem[];
  archiveDate: string;
  description: string;
  footer: string;
  articleUrl: string;
  coverFile?: string;
}): string {
  if (!description) throw new Error("Weibo trending WeChat article needs a description");
  if (!items.length) throw new Error("Weibo trending WeChat article needs at least one item");
  const metadata = frontmatter({
    title: taskTitle("weibo-trending", archiveDate),
    date: archiveDate,
    description,
    tags: [WEIBO_TRENDING_WECHAT_TAG],
    ogImage: coverFile,
    wechatEnabled: true,
  }).replace("wechat:\n  enabled: true", `wechat:\n  enabled: true\n  sourceURL: "${articleUrl}"`);
  return `${metadata}${weiboTrendingWechatBody(items)}\n\n${footer}\n`;
}

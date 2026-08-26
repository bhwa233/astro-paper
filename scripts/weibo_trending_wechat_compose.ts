// 微博微信稿的规则层：唯一输入是已经归档的站点文章，本模块不拉榜、不调用模型。
import path from "node:path";
import { compact, frontmatter } from "./blog_common.ts";
import { bulletValue, extractBullets, numberedBlocks } from "./compose_common.ts";

export const WEIBO_TRENDING_WECHAT_ITEM_LIMIT = 30;
export const WEIBO_TRENDING_WECHAT_TAG = "微博热搜";
export const WEIBO_TRENDING_WECHAT_DESCRIPTION_LIMIT = 120;
export const WEIBO_TRENDING_WECHAT_QR_FILE = "qr.png";

const BLOG_URL = "https://blog.bhwa233.com/";

// ------------------------------------------------------------------ A/B 开关
//
// 与 Reddit 那条线同样的两个站外引流入口，但**独立取值**：让一条开着、另一条关着，
// 才能在同一时间窗内形成对照。前后期对比会被这期间任何别的改动污染。
// 改动时在下面记一行日期与意图。
//   2026-08-25 两项同时关闭，作为无引流入口的基线。
export const WEIBO_TRENDING_WECHAT_SHOW_SOURCE_URL = false;
export const WEIBO_TRENDING_WECHAT_SHOW_QR = false;

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

// 卡片沿用 Reddit 微信稿验证过的 table 结构，避免微信编辑器破坏 flex 布局。
function qrCard(target: string): string {
  return [
    '<section style="margin:24px 0 0;padding:16px 18px;background:#f7f7f7;border-radius:6px;">',
    '<table style="width:100%;min-width:0;margin:0;border-collapse:collapse;">',
    "<tbody><tr>",
    '<td style="border:none;padding:0;vertical-align:middle;">',
    '<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#8a8a8a;">长按识别二维码查看更多热搜话题</p>',
    `<p style="margin:0;font-size:13px;line-height:1.5;color:#576b95;word-break:break-all;">${target}</p>`,
    "</td>",
    '<td style="border:none;width:96px;padding:0 0 0 14px;vertical-align:middle;">',
    `<img src="${WEIBO_TRENDING_WECHAT_QR_FILE}" alt="微博热搜原文二维码" width="96" height="96" />`,
    "</td>",
    "</tr></tbody></table>",
    "</section>",
  ].join("\n");
}

/** 二维码关闭时返回空串，稿子就没有页脚。开关做成默认参数，测试才能跑到两种状态。 */
export function weiboTrendingWechatFooter(articleUrl: string, showQr = WEIBO_TRENDING_WECHAT_SHOW_QR): string {
  if (!showQr) return "";
  return qrCard(articleUrl);
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

// sourceURL 由 A/B 开关决定：它变成草稿的 content_source_url，也就是文末的「阅读原文」，
// 和二维码卡片是同一类站外引流，两者各自可关。
// 生成文件固定名为 01.md，不能把 canonical URL 当作草稿身份，否则跨日会被误判为同一篇。
// syncId 按归档日期区分，而 sourceURL 仍只控制读者是否能看到「阅读原文」；翻转 A/B 开关
// 不会让同一天的稿子被当作一篇新草稿。
export function renderWeiboTrendingWechatMarkdown({
  items,
  archiveDate,
  title,
  description,
  articleUrl,
  footer = "",
  coverFile = "",
  showSourceUrl = WEIBO_TRENDING_WECHAT_SHOW_SOURCE_URL,
}: {
  items: WeiboTrendingWechatItem[];
  archiveDate: string;
  title: string;
  description: string;
  articleUrl: string;
  footer?: string;
  coverFile?: string;
  showSourceUrl?: boolean;
}): string {
  if (!description) throw new Error("Weibo trending WeChat article needs a description");
  if (!items.length) throw new Error("Weibo trending WeChat article needs at least one item");
  if (!title) throw new Error("Weibo trending WeChat article needs a title");
  if (!articleUrl) throw new Error("Weibo trending WeChat article needs the upstream article URL");
  const wechatFields = [`  syncId: "${weiboTrendingWechatSyncId(archiveDate)}"`];
  if (showSourceUrl) wechatFields.push(`  sourceURL: "${articleUrl}"`);
  const metadata = frontmatter({
    title,
    date: archiveDate,
    description,
    tags: [WEIBO_TRENDING_WECHAT_TAG],
    ogImage: coverFile,
    wechatEnabled: true,
  }).replace("wechat:\n  enabled: true", ["wechat:", "  enabled: true", ...wechatFields].join("\n"));
  return `${metadata}${[weiboTrendingWechatBody(items), footer].filter(Boolean).join("\n\n")}\n`;
}

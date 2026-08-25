// 微博微信稿的规则层：唯一输入是已经归档的站点文章，本模块不拉榜、不调用模型。
import { compact, frontmatter } from "./blog_common.ts";
import { bulletValue, extractBullets, numberedBlocks } from "./compose_common.ts";

export const WEIBO_TRENDING_WECHAT_ITEM_LIMIT = 30;
export const WEIBO_TRENDING_WECHAT_TAG = "微博热搜";
export const WEIBO_TRENDING_WECHAT_DESCRIPTION_LIMIT = 120;

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

// 刻意不写 wechat.sourceURL：它会变成草稿的 content_source_url，也就是文末的「阅读原文」。
// 那和已经撤掉的二维码卡片是同一类站外引流，一并去掉。没有它时 astro-wechat 的同步身份
// 退回稿子的仓库相对路径，这条线一天只出一篇，路径天然唯一。
// 代价：上一次同步中断留下 pending 记录时，无法再去微信侧核对草稿是否建成，
// astro-wechat 会抛 reconcile-impossible 要求人工确认，而不是自动恢复。
export function renderWeiboTrendingWechatMarkdown({
  items,
  archiveDate,
  title,
  description,
  coverFile = "",
}: {
  items: WeiboTrendingWechatItem[];
  archiveDate: string;
  title: string;
  description: string;
  coverFile?: string;
}): string {
  if (!description) throw new Error("Weibo trending WeChat article needs a description");
  if (!items.length) throw new Error("Weibo trending WeChat article needs at least one item");
  if (!title) throw new Error("Weibo trending WeChat article needs a title");
  const metadata = frontmatter({
    title,
    date: archiveDate,
    description,
    tags: [WEIBO_TRENDING_WECHAT_TAG],
    ogImage: coverFile,
    wechatEnabled: true,
  });
  return `${metadata}${weiboTrendingWechatBody(items)}\n`;
}

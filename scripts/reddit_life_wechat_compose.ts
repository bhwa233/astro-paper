// 规则层：微信稿完全由上游 life 文章转换而来，没有模型参与。
// 上游每帖的正文已经是「一条回答一个普通文本编号段」的故事集，这里只做选帖、改标题和长度收口。
import { createHash } from "node:crypto";
import { compact, frontmatter } from "./blog_common.ts";
import { type RedditLifeRecommendation, redditPostRecommendationKey } from "./reddit_life_wechat_ledger.ts";
import { REDDIT_LIFE_SUBREDDITS } from "./reddit_life_wechat_source.ts";

export const REDDIT_LIFE_WECHAT_TAG = "Reddit人生讨论";
export const REDDIT_LIFE_WECHAT_TITLE_BRAND = "Reddit 热帖精选";
// 微信图文标题上限 64 字符。品牌与期号在末尾，正是最该固定露出的部分，所以超长时只截帖子标题那段。
// 提示词已经把译名压到 30 字，这里只是模型不守约时的兜底，正常永远不触发。
const WECHAT_TITLE_LIMIT = 64;
const TITLE_ELLIPSIS = "…";
export const REDDIT_LIFE_WECHAT_QR_FILE = "qr.png";
export const REDDIT_LIFE_WECHAT_QR_TARGET = "https://blog.bhwa233.com/";
const QR_CAPTION = "长按识别二维码，查看更多每日精选";

// 微信正文里的外链点不动（astro-wechat 会把 <a> 拆成文字加尾注），二维码是唯一能把读者送出去的通道。
// 两栏用 table 而不是 flex：微信编辑器对 flex 支持不稳，table 在 doocs-default 主题里本来就有样式。
// 这段同时充当正文与页脚的分割哨兵（splitWechatMarkdown 靠 lastIndexOf 找它），所以必须逐字不变，
// 内部也不能出现空行——markdown-it 的 html_block 遇到空行就结束，后半段会被当成普通段落。
const FOOTER = [
  '<section style="margin:24px 0 0;padding:16px 18px;background:#f7f7f7;border-radius:6px;">',
  // 主题会给 table/td 补上外边距和格线，这里逐条覆盖回去；内联样式后写的胜出。
  '<table style="width:100%;min-width:0;margin:0;border-collapse:collapse;">',
  "<tbody><tr>",
  '<td style="border:none;padding:0;vertical-align:middle;">',
  `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#8a8a8a;">${QR_CAPTION}</p>`,
  `<p style="margin:0;font-size:13px;line-height:1.5;color:#576b95;word-break:break-all;">${REDDIT_LIFE_WECHAT_QR_TARGET}</p>`,
  "</td>",
  '<td style="border:none;width:96px;padding:0 0 0 14px;vertical-align:middle;">',
  // img 不写 style：CSS 内联会剥掉尾分号再追加主题样式，把最后一条声明粘坏。尺寸走属性。
  `<img src="${REDDIT_LIFE_WECHAT_QR_FILE}" alt="bhwa233 博客二维码" width="96" height="96" />`,
  "</td>",
  "</tr></tbody></table>",
  "</section>",
].join("\n");

export type RedditLifeCandidate = {
  rank: number;
  postId: string;
  title: string;
  subreddit: string;
  points: string;
  numComments: number;
  permalink: string;
  // 上游那一帖的正文，逐条故事的有序列表，原样搬运。
  body: string;
};

function redditId(url: string): string {
  const match = url.match(/reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]{5,12})(?:\/|$)/i);
  if (!match) throw new Error(`Reddit life article has an invalid post URL: ${url || "missing"}`);
  return match[1].toLowerCase();
}

function sourceBlocks(markdown: string): string[] {
  return markdown
    .split(/(?=^##\s+\d+\.\s+)/gm)
    .map(block => block.trim())
    .filter(block => /^##\s+\d+\.\s+/.test(block));
}

// 上游文章的 frontmatter description 就是排名第一那帖的一句话描述（redditTop20Description 取 items[0]）。
export function parseRedditLifeDescription(markdown: string): string {
  const description = markdown.match(/^description:\s*"((?:[^"\\]|\\.)*)"\s*$/m)?.[1];
  if (!description) throw new Error("Reddit life article is missing its frontmatter description");
  return compact(description.replaceAll('\\"', '"'));
}

export function parseRedditLifeCandidates(markdown: string): RedditLifeCandidate[] {
  const blocks = sourceBlocks(markdown);
  if (!blocks.length) throw new Error("Reddit life article has no numbered post blocks");
  return blocks.slice(0, 3).map((block, index) => {
    const heading = block.match(/^##\s+(\d+)\.\s+(.+)$/m);
    const source = block.match(/^- (?:\*\*)?来源(?:\*\*)?：\[r\/([^\]]+)\]\([^\n]+\)$/m);
    const url = block.match(/^- (?:\*\*)?帖子(?:\*\*)?：\s*(https:\/\/[^\s]+)\s*$/m)?.[1] || "";
    const heat = block.match(/^- \*\*热度\*\*：\s*([^\n]+)$/m)?.[1] || block.match(/^- ⭐\s*(.+)$/m)?.[1] || "";
    if (!heading || Number(heading[1]) !== index + 1 || !source || !url) throw new Error(`Reddit life article block ${index + 1} violates the handoff contract`);
    const subreddit = source[1];
    if (!REDDIT_LIFE_SUBREDDITS.some(item => item.toLowerCase() === subreddit.toLowerCase())) throw new Error(`Reddit life article has an unsupported subreddit: ${subreddit}`);
    const commentMatch = heat.match(/(?:·|\s)([\d,]+)\s*评论/i);
    const numComments = Number((commentMatch?.[1] || "0").replaceAll(",", ""));
    if (!Number.isInteger(numComments) || numComments < 0) throw new Error(`Reddit life article has an invalid comment count for rank ${index + 1}`);
    return {
      rank: index + 1,
      postId: redditId(url),
      title: compact(heading[2].replace(/^🔴\s*/, "")),
      subreddit,
      points: compact(heat),
      numComments,
      permalink: url,
      body: postBody(block, index + 1),
    };
  });
}

// 事实 bullet 之后的一切都是正文；新契约以 `1\.` 转义 Markdown 列表，旧归档的 `1.` 仍可读取。
function postBody(block: string, rank: number): string {
  const lines = block.split("\n");
  const start = lines.findIndex((line, index) => index > 0 && /^\d+\\?\.\s/.test(line));
  const body = start < 0 ? "" : lines.slice(start).join("\n").trim();
  if (!body) throw new Error(`Reddit life article block ${rank} has no story list`);
  return body;
}

function storyItems(body: string): string[] {
  return body
    .split(/\n+(?=\d+\\?\.\s)/)
    .map(item => item.trim())
    .filter(Boolean);
}

// 草稿一律写成普通文本编号段：避免 Markdown 列表在微信编辑器中被拆成空编号项，
// 同时把旧归档的未转义编号规范成新契约的 `1\.` 形式。
function plainStoryText(body: string): string {
  return storyItems(body)
    .map(item => item.replace(/^(\d+)\.\s/, "$1\\. "))
    .join("\n\n");
}

// 微信正文有 20000 字符的 HTML 上限，而一帖的故事条数不可控。超限时从末尾往回删故事，
// 编号本来就是从 1 递增，删尾部不会留下断号；页脚的项目地址永远保留。
export function dropTrailingStories(markdown: string, drop: number): string {
  if (drop <= 0) return markdown;
  const { front, body, footer } = splitWechatMarkdown(markdown);
  const items = storyItems(body);
  if (drop >= items.length) throw new Error(`Reddit life WeChat markdown has fewer than ${drop} droppable stories`);
  return `${front}\n${plainStoryText(items.slice(0, items.length - drop).join("\n\n"))}\n\n${footer}\n`;
}

export function countDroppableStories(markdown: string): number {
  return storyItems(splitWechatMarkdown(markdown).body).length;
}

function splitWechatMarkdown(markdown: string): { front: string; body: string; footer: string } {
  const frontEnd = markdown.indexOf("\n---\n", markdown.indexOf("---\n") + 1);
  if (!markdown.startsWith("---\n") || frontEnd < 0) throw new Error("Reddit life WeChat markdown is missing frontmatter");
  const footerIndex = markdown.lastIndexOf(`\n${FOOTER}`);
  if (footerIndex < 0) throw new Error("Reddit life WeChat markdown is missing its footer");
  const front = markdown.slice(0, frontEnd + "\n---\n".length);
  return { front, body: markdown.slice(front.length, footerIndex).trim(), footer: markdown.slice(footerIndex + 1).trim() };
}

export function redditLifeWechatTitle(title: string, issue: number): string {
  if (!Number.isInteger(issue) || issue < 1) throw new Error(`invalid Reddit life WeChat issue number: ${issue}`);
  const headline = compact(title);
  if (!headline) throw new Error("Reddit life WeChat article needs a title");
  const suffix = `｜${REDDIT_LIFE_WECHAT_TITLE_BRAND} #${issue}`;
  const budget = WECHAT_TITLE_LIMIT - suffix.length;
  if (budget <= TITLE_ELLIPSIS.length) throw new Error(`Reddit life WeChat issue number leaves no room for a title: #${issue}`);
  // 按码点切，不按 UTF-16 单元，否则表情之类的代理对会被截成半个字符。
  const chars = [...headline];
  return `${chars.length <= budget ? headline : `${chars.slice(0, budget - TITLE_ELLIPSIS.length).join("")}${TITLE_ELLIPSIS}`}${suffix}`;
}

// coverFile 为空时不写 ogImage，astro-wechat 会回落到配置里的 defaultCover。
// 路径按相对写法：astro-wechat 先相对 Markdown 所在目录解析，封面就躺在稿子旁边，不必往 public/ 里塞。
export function renderRedditLifeWechatMarkdown(candidate: RedditLifeCandidate, description: string, archiveDate: string, issue: number, coverFile = ""): string {
  if (!description) throw new Error("Reddit life WeChat article needs a description");
  const metadata = frontmatter({
    title: redditLifeWechatTitle(candidate.title, issue),
    date: archiveDate,
    description,
    tags: [REDDIT_LIFE_WECHAT_TAG],
    ogImage: coverFile,
    wechatEnabled: true,
  })
    .replace("wechat:\n  enabled: true", `wechat:\n  enabled: true\n  sourceURL: "${candidate.permalink}"`)
    .replace("---\n\n", [`redditPostId: "${candidate.postId}"`, `subreddit: "${candidate.subreddit}"`, "---", ""].join("\n"));
  return `${metadata}${plainStoryText(candidate.body)}\n\n${FOOTER}\n`;
}

export function markdownSha256(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

export function recommendationForCandidate(candidate: { postId: string; title: string; issue?: number }): RedditLifeRecommendation {
  return { key: redditPostRecommendationKey(candidate.postId), postId: candidate.postId, title: candidate.title, issue: candidate.issue };
}

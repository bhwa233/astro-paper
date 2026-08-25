// 规则层：正文完全由上游 life 文章转换而来，本模块自身不调用模型。
// 上游每帖的正文已经是「一条回答一个普通文本编号段」的故事集，这里只做选帖、截断、拼接和长度收口。
// 标题与摘要由编排层传进来：标题是选后第一帖，摘要列出本篇收录的标题。
import { createHash } from "node:crypto";
import path from "node:path";
import { compact, frontmatter } from "./blog_common.ts";
import { REDDIT_LIFE_SUBREDDITS } from "./reddit_life_wechat_source.ts";

export const REDDIT_LIFE_WECHAT_TAG = "Reddit人生讨论";
export const REDDIT_LIFE_WECHAT_TITLE_BRAND = "Reddit 问答精选";
// 微信图文标题上限 64 字符。品牌在末尾，超长时只截帖子标题那段。
const WECHAT_TITLE_LIMIT = 64;
const TITLE_ELLIPSIS = "…";
// 一卷收录五帖，每帖最多保留前 30 条回答。
// 30 只是上界：五帖各 30 条渲染出来会撞上微信 20000 字符上限，实际条数由编排层
// （generate_reddit_life_wechat.ts 的 fitWechatContentLimit）用渲染器二分出来，五帖统一压低同一个值。
// 实测量级（2026-08-17 归档）：每条故事约 124 字符 HTML，固定开销约 2400，因此收敛值通常在每帖 26-28 条。
export const REDDIT_LIFE_WECHAT_POST_LIMIT = 5;
export const REDDIT_LIFE_WECHAT_REPLY_LIMIT = 30;

// AI 会评估上游文章里的全部帖子，最多选十帖；一篇稿子收录五帖，因此分成两卷推送。
// 卷号只作内部身份，不展示给读者。
export const REDDIT_LIFE_WECHAT_VOLUMES = ["v1", "v2"] as const;
export type RedditLifeVolume = (typeof REDDIT_LIFE_WECHAT_VOLUMES)[number];
export const REDDIT_LIFE_WECHAT_TOTAL_POSTS = REDDIT_LIFE_WECHAT_VOLUMES.length * REDDIT_LIFE_WECHAT_POST_LIMIT;

// ------------------------------------------------------------------ A/B 开关
//
// 两个站外引流入口各自可开关，用来测它们是否影响微信的推荐分发。开关刻意做成模块
// 常量而不是环境变量：A/B 要能回答「哪天跑的是哪套配置」，一次 commit 就是一条
// 精确到日期的记录，而环境变量改了不留痕。
//
// 每条管线各自持有一份，因此可以让 Reddit 开着、微博关着形成同期对照——前后期对比
// 会被这期间任何别的改动污染。
//
// 改动这两个值时，请在下面记一行日期与意图，别让实验区间只能靠 git log 反推。
//   2026-08-25 两项同时关闭，作为无引流入口的基线。
export const REDDIT_LIFE_WECHAT_SHOW_SOURCE_URL = false;
export const REDDIT_LIFE_WECHAT_SHOW_QR = false;

export const REDDIT_LIFE_WECHAT_QR_FILE = "qr.png";
const BLOG_URL = "https://blog.bhwa233.com/";

/** 那天 life 文章的博客地址。slug 就是文件名，站点按 /posts/:slug/ 出页。 */
export function redditLifeArticleUrl(lifeArticlePath: string): string {
  const slug = path.basename(lifeArticlePath, ".md");
  if (!slug) throw new Error(`cannot derive a blog URL from ${lifeArticlePath || "an empty path"}`);
  return `${BLOG_URL}posts/${slug}/`;
}

/**
 * 这一卷在台账里的身份。
 *
 * 不能用 canonical URL：两卷的「阅读原文」都指向同一天那篇 life 文章，共用一个身份
 * 会让后续卷被判 already-synchronized 静默跳过。日期加卷次天生唯一，且与文件名、
 * 与开关状态都无关——开关翻转不该让同一卷变成一篇新稿子。
 */
export function redditLifeWechatSyncId(archiveDate: string, volume: RedditLifeVolume): string {
  const index = REDDIT_LIFE_WECHAT_VOLUMES.indexOf(volume);
  if (index < 0) throw new Error(`invalid Reddit life WeChat volume: ${volume || "missing"}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) throw new Error(`invalid Reddit life WeChat archive date: ${archiveDate || "missing"}`);
  return `reddit-life-${archiveDate}-v${index + 1}`;
}

// 微信正文里的外链点不动（astro-wechat 会把 <a> 拆成文字加尾注），二维码是唯一能把读者送出去的通道。
// 两栏用 table 而不是 flex：微信编辑器对 flex 支持不稳，table 在 doocs-default 主题里本来就有样式。
// 卡片内不能出现空行——markdown-it 的 html_block 遇到空行就结束，后半段会被当成普通段落。
function qrCard(caption: string, target: string): string {
  return [
    '<section style="margin:24px 0 0;padding:16px 18px;background:#f7f7f7;border-radius:6px;">',
    // 主题会给 table/td 补上外边距和格线，这里逐条覆盖回去；内联样式后写的胜出。
    '<table style="width:100%;min-width:0;margin:0;border-collapse:collapse;">',
    "<tbody><tr>",
    '<td style="border:none;padding:0;vertical-align:middle;">',
    `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#8a8a8a;">${caption}</p>`,
    `<p style="margin:0;font-size:13px;line-height:1.5;color:#576b95;word-break:break-all;">${target}</p>`,
    "</td>",
    '<td style="border:none;width:96px;padding:0 0 0 14px;vertical-align:middle;">',
    // img 不写 style：CSS 内联会剥掉尾分号再追加主题样式，把最后一条声明粘坏。尺寸走属性。
    `<img src="${REDDIT_LIFE_WECHAT_QR_FILE}" alt="Reddit 问答精选原文二维码" width="96" height="96" />`,
    "</td>",
    "</tr></tbody></table>",
    "</section>",
  ].join("\n");
}

/**
 * 二维码关闭时返回空串，稿子就没有页脚。清单已经撤掉：两卷覆盖 10 帖，不再靠列标题钓扫码。
 *
 * 开关做成默认参数而不是直接读常量，测试才能把两种状态都跑到。生产调用一律不传。
 */
export function redditLifeWechatFooter(articleUrl: string, showQr = REDDIT_LIFE_WECHAT_SHOW_QR): string {
  if (!showQr) return "";
  return qrCard("长按识别二维码，在博客看全部热帖", articleUrl);
}

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

export function parseRedditLifeCandidates(markdown: string, limit = Number.POSITIVE_INFINITY): RedditLifeCandidate[] {
  const blocks = sourceBlocks(markdown);
  if (!blocks.length) throw new Error("Reddit life article has no numbered post blocks");
  return blocks.slice(0, limit).map((block, index) => {
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

// 每帖只取前 limit 条：全量渲染出的 HTML 会撞上微信 20000 字符上限。
// 编号是上游给的顺序，截前 N 条不会留下断号。
function limitedStoryText(body: string, limit = REDDIT_LIFE_WECHAT_REPLY_LIMIT): string {
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`invalid Reddit life reply limit: ${limit}`);
  return storyItems(body)
    .slice(0, limit)
    .map(item => item.replace(/^(\d+)\.\s/, "$1\\. "))
    .join("\n\n");
}

// 每个问题用二级标题分隔，和其他微信日报的条目层级保持一致。
function postHeading(title: string): string {
  return `## ${compact(title)}`;
}

const HEADING_BLOCK = /^##\s+\S.*$/;

// 正文由「二级标题」和「编号故事」两种块交替组成，块之间空一行。上游契约保证一条回答就是一段，
// 段内不再分段，因此按空行切就是按块切。
function bodyBlocks(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);
}

export function redditLifeWechatBody(candidates: RedditLifeCandidate[], limit = REDDIT_LIFE_WECHAT_REPLY_LIMIT): string {
  if (!candidates.length) throw new Error("Reddit life WeChat article needs at least one post");
  return candidates.map(candidate => `${postHeading(candidate.title)}\n\n${limitedStoryText(candidate.body, limit)}`).join("\n\n");
}

// 微信正文有 20000 字符的 HTML 上限，而回答长度不可控。超限时从末尾往回删故事。
// 删到某帖一条不剩时，它的标题也要跟着走——留一个后面没有内容的标题比少一帖更难看。
export function dropTrailingStories(markdown: string, drop: number): string {
  if (drop <= 0) return markdown;
  const { front, body, footer } = splitWechatMarkdown(markdown);
  const blocks = bodyBlocks(body);
  const stories = blocks.filter(block => !HEADING_BLOCK.test(block));
  if (drop >= stories.length) throw new Error(`Reddit life WeChat markdown has fewer than ${drop} droppable stories`);
  let remaining = drop;
  const kept: string[] = [];
  for (const block of [...blocks].reverse()) {
    if (remaining > 0 && !HEADING_BLOCK.test(block)) {
      remaining -= 1;
      continue;
    }
    // 尾部只剩标题说明它下面的故事已经删光，这个标题也没有存在意义。
    if (!kept.length && HEADING_BLOCK.test(block)) continue;
    kept.unshift(block);
  }
  return `${front}\n${[kept.join("\n\n"), footer].filter(Boolean).join("\n\n")}\n`;
}

export function countDroppableStories(markdown: string): number {
  return bodyBlocks(splitWechatMarkdown(markdown).body).filter(block => !HEADING_BLOCK.test(block)).length;
}

// 二维码卡片开着时它排在正文之后，必须留在截断范围之外——撞长度上限时该删的是回答，
// 而卡片正好在末尾，不圈出来就会先被啃掉，正好把要测的那个变量删掉。
// 用卡片自身的 `<section` 当边界而不是某行固定文案：文案会改，标签不会；
// 关掉二维码时找不到它，页脚为空，正文末尾就是可删区的末尾。
const FOOTER_MARKER = "\n<section ";

function splitWechatMarkdown(markdown: string): { front: string; body: string; footer: string } {
  const frontEnd = markdown.indexOf("\n---\n", markdown.indexOf("---\n") + 1);
  if (!markdown.startsWith("---\n") || frontEnd < 0) throw new Error("Reddit life WeChat markdown is missing frontmatter");
  const front = markdown.slice(0, frontEnd + "\n---\n".length);
  const rest = markdown.slice(front.length);
  const footerIndex = rest.lastIndexOf(FOOTER_MARKER);
  if (footerIndex < 0) return { front, body: rest.trim(), footer: "" };
  return { front, body: rest.slice(0, footerIndex).trim(), footer: rest.slice(footerIndex + 1).trim() };
}

export function redditLifeWechatTitle(title: string): string {
  const headline = compact(title);
  if (!headline) throw new Error("Reddit life WeChat article needs a title");
  const suffix = `｜${REDDIT_LIFE_WECHAT_TITLE_BRAND}`;
  const budget = WECHAT_TITLE_LIMIT - suffix.length;
  if (budget <= TITLE_ELLIPSIS.length) throw new Error("Reddit life WeChat title brand leaves no room for a title");
  // 按码点切，不按 UTF-16 单元，否则表情之类的代理对会被截成半个字符。
  const chars = [...headline];
  return `${chars.length <= budget ? headline : `${chars.slice(0, budget - TITLE_ELLIPSIS.length).join("")}${TITLE_ELLIPSIS}`}${suffix}`;
}

// coverFile 为空时不写 ogImage，astro-wechat 会回落到配置里的 defaultCover。
// 路径按相对写法：astro-wechat 先相对 Markdown 所在目录解析，封面就躺在稿子旁边，不必往 public/ 里塞。
//
// headline 是本卷第一帖的标题，只占标题前半段，品牌由 redditLifeWechatTitle 拼上。
//
// wechat.syncId 无条件写入，wechat.sourceURL 由 A/B 开关决定。两者必须分开：
// sourceURL 变成草稿的 content_source_url（「阅读原文」），两卷都该落在同一天那篇 life 文章上，
// 而台账身份必须两卷各不相同，否则后续卷被判 already-synchronized 静默跳过。
// 身份走 syncId 之后，开关翻转只改变读者看不看得到「阅读原文」，不会让同一卷变成一篇新稿子。
//
// 不给锚点：落到文章顶部就够了，锚点还要赌 Astro 给标题生成的 id，赌输了也只是落到同一处。
// redditPostId / subreddit 仍记本卷第一帖，用于追溯。
export function renderRedditLifeWechatMarkdown({
  candidates,
  headline,
  description,
  archiveDate,
  volume,
  articleUrl,
  footer = "",
  coverFile = "",
  replyLimit = REDDIT_LIFE_WECHAT_REPLY_LIMIT,
  showSourceUrl = REDDIT_LIFE_WECHAT_SHOW_SOURCE_URL,
}: {
  candidates: RedditLifeCandidate[];
  headline: string;
  description: string;
  archiveDate: string;
  volume: RedditLifeVolume;
  articleUrl: string;
  footer?: string;
  coverFile?: string;
  replyLimit?: number;
  showSourceUrl?: boolean;
}): string {
  if (!description) throw new Error("Reddit life WeChat article needs a description");
  if (!candidates.length) throw new Error("Reddit life WeChat article needs at least one post");
  if (!articleUrl) throw new Error("Reddit life WeChat article needs the upstream article URL");
  const [primary] = candidates;
  const wechatFields = [`  syncId: "${redditLifeWechatSyncId(archiveDate, volume)}"`];
  if (showSourceUrl) wechatFields.push(`  sourceURL: "${articleUrl}"`);
  const metadata = frontmatter({
    title: redditLifeWechatTitle(headline),
    date: archiveDate,
    description,
    tags: [REDDIT_LIFE_WECHAT_TAG],
    ogImage: coverFile,
    wechatEnabled: true,
  })
    .replace("wechat:\n  enabled: true", ["wechat:", "  enabled: true", ...wechatFields].join("\n"))
    .replace("---\n\n", [`redditPostId: "${primary.postId}"`, `subreddit: "${primary.subreddit}"`, "---", ""].join("\n"));
  return `${metadata}${[redditLifeWechatBody(candidates, replyLimit), footer].filter(Boolean).join("\n\n")}\n`;
}

export function markdownSha256(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

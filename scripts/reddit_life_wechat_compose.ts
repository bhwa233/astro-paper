// 规则层：上游 life 文章只提供排序与事实；单帖深抓结果和模型语义在此组成微信归档正文。
import { createHash } from "node:crypto";
import { compact, frontmatter } from "./blog_common.ts";
import { hasChinese, normalizeMarkdownBlock, parseModelJsonObject } from "./compose_common.ts";
import { redditPostRecommendationKey } from "./reddit_life_wechat_ledger.ts";
import { REDDIT_LIFE_SUBREDDITS, type RedditLifeEvidence } from "./reddit_life_wechat_source.ts";

export const REDDIT_LIFE_WECHAT_TAG = "Reddit人生讨论";

export type RedditLifeCandidate = { rank: number; postId: string; title: string; subreddit: string; points: string; numComments: number; permalink: string };
export type RedditThreadSummary = { parentId: string; claims: string; replyRelation: string; minorityOrBoundary: string };
export type RedditLifeArticle = { titleZh: string; intro: string; mainstream: string; replies: string; minority: string; description: string };

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
    const postId = redditId(url);
    return { rank: index + 1, postId, title: compact(heading[2].replace(/^🔴\s*/, "")), subreddit, points: compact(heat), numComments, permalink: url };
  });
}

export function evidenceThreads(evidence: RedditLifeEvidence[]): Array<{ evidence: RedditLifeEvidence; parent: string; replies: string[] }> {
  return evidence.flatMap(item =>
    item.topComments.map(parent => ({ evidence: item, parent: parent.id, replies: item.replies.filter(reply => reply.parentId === parent.id).map(reply => reply.id) })),
  );
}

export function renderThreadEvidence(evidence: RedditLifeEvidence, parentId: string): string {
  const parent = evidence.topComments.find(comment => comment.id === parentId);
  if (!parent) throw new Error(`missing Reddit parent comment ${parentId}`);
  const replies = evidence.replies.filter(reply => reply.parentId === parentId);
  return [
    `- 顶层评论 ID：${parent.id}`,
    `- 顶层评论赞数：${parent.score ?? "未显示"}`,
    `- 顶层评论：${parent.text}`,
    ...replies.flatMap(reply => [`- 直接回复 ID：${reply.id}`, `- 直接回复赞数：${reply.score ?? "未显示"}`, `- 直接回复：${reply.text}`]),
  ].join("\n");
}

function chineseText(value: unknown, label: string, min = 20): string {
  const text = normalizeMarkdownBlock(value);
  if (text.length < min || !hasChinese(text) || /^\s{0,3}#{1,6}\s/m.test(text)) throw new Error(`Reddit life WeChat ${label} is empty, non-Chinese, or uses headings`);
  return text;
}

export function parseRedditThreadSummary(raw: string, parentId: string): RedditThreadSummary {
  const payload = parseModelJsonObject(raw, "Reddit life thread summary");
  if (payload.parent_id !== parentId) throw new Error(`Reddit life thread summary parent mismatch: ${String(payload.parent_id)} vs ${parentId}`);
  return {
    parentId,
    // 短评论可能只有一个完整判断；强行要求 20 个字符会把可用证据误判为模型故障。
    claims: chineseText(payload.claims, "thread claims", 1),
    replyRelation: chineseText(payload.reply_relation, "thread reply relation", 8),
    minorityOrBoundary: normalizeMarkdownBlock(payload.minority_or_boundary),
  };
}

export function parseRedditLifeArticle(raw: string): RedditLifeArticle {
  const payload = parseModelJsonObject(raw, "Reddit life article");
  const titleZh = compact(String(payload.title_zh || ""));
  if (!titleZh || !hasChinese(titleZh)) throw new Error("Reddit life article needs a Chinese title");
  const article = {
    titleZh,
    intro: chineseText(payload.intro, "intro"),
    mainstream: chineseText(payload.mainstream, "mainstream"),
    replies: chineseText(payload.replies, "replies"),
    minority: chineseText(payload.minority, "minority"),
    description: compact(String(payload.description || "")),
  };
  if (!article.description || !hasChinese(article.description)) article.description = article.intro.replace(/\s+/g, " ").slice(0, 90);
  return article;
}

export function renderRedditLifeWechatMarkdown(candidate: RedditLifeCandidate, evidence: RedditLifeEvidence, article: RedditLifeArticle, archiveDate: string): string {
  if (candidate.postId !== evidence.postId || candidate.subreddit.toLowerCase() !== evidence.subreddit.toLowerCase()) {
    throw new Error("Reddit life source facts do not match the selected upstream post");
  }
  const metadata = frontmatter({ title: article.titleZh, date: archiveDate, description: article.description, tags: [REDDIT_LIFE_WECHAT_TAG], wechatEnabled: true })
    .replace("wechat:\n  enabled: true", `wechat:\n  enabled: true\n  sourceURL: "${candidate.permalink}"`)
    .replace("---\n\n", [
      `redditPostId: "${candidate.postId}"`,
      `subreddit: "${candidate.subreddit}"`,
      `redditScore: ${evidence.score}`,
      `redditComments: ${evidence.numComments}`,
      `redditFetchedAt: "${evidence.fetchedAt}"`,
      `redditSourceSha256: "${evidence.sourceSha256}"`,
      `redditPolicySha256: "${evidence.policySha256}"`,
      "---",
      "",
    ].join("\n"));
  return `${metadata}## 讨论背景\n\n${article.intro}\n\n## 主流观点\n\n${article.mainstream}\n\n## 回复带来的补充与质疑\n\n${article.replies}\n\n## 分歧与适用边界\n\n${article.minority}\n\n## 来源\n\n- Reddit 原帖：${candidate.permalink}\n- 社区：r/${candidate.subreddit}\n- 热度快照：${candidate.points || `${evidence.score} points · ${evidence.numComments} 评论`}\n`;
}

export function markdownSha256(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

export function recommendationForCandidate(candidate: RedditLifeCandidate) {
  return { key: redditPostRecommendationKey(candidate.postId), postId: candidate.postId, title: candidate.title };
}

#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { bjtTimestamp, compact, frontmatter, parseArgs, readStdin, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { REDDIT_TRENDING_MIN_TOPICS, type Task, isTask, taskInfo, taskPostRelPath, taskTags, taskTitle } from "./blog_tasks.ts";
import { ARCHIVE_PAYLOAD_MARKER } from "./compose_common.ts";
import { bulletValue, extractBullets, hasChinese, isCompactProperNameOrModelTitle, looksLowSignal, normalizeMarkdownBlock } from "./markdown_text.ts";

const HN_DEFAULT_OG_IMAGE = "../../../../public/images/hn-cover.svg";

type HnPayloadItem = {
  rank?: number;
  title?: string;
  url?: string;
  hn_link?: string;
  topic?: string;
  score?: number;
  comments?: number;
  content_summary?: string;
  comment_summary?: string;
  original_excerpt?: string;
  hn_comment_excerpt?: string;
};

type ArchiveResult = {
  task: string;
  path: string;
  title: string;
  created: boolean;
  skipped: boolean;
  updated_at_bjt: string;
  commit: string;
  push: string;
  tags: string[];
};

function stripHeaders(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^#+\s*Final response\s*\n/i, "")
    .replace(/^\*\*Final response\*\*\s*\n/i, "")
    .trim();
}

function rejectFailureText(text: string): void {
  if (!text.trim()) throw new Error("upstream content is empty");
  for (const pattern of [/Script not found:/i, /归档失败/i, /Traceback \(most recent call last\)/i, /command failed:/i, /BLOCKED:/i]) {
    if (pattern.test(text)) throw new Error(`upstream content appears to be an error message: ${pattern.source}`);
  }
}

function normalizeMarkdown(text: string): string {
  const cleaned = stripHeaders(text).replace(/\n{3,}/g, "\n\n").trim();
  rejectFailureText(cleaned);
  return `${cleaned}\n`;
}

function sanitizeGeneratedText(text = ""): string {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+.+$/gm, "")
    .replace(/[А-Яа-яЁё]+/g, "")
    .replace(/[`*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+([，。！？；：,.!?;:])/g, "$1");
  if (!cleaned) return "";
  return /[。！？!?]$/.test(cleaned) ? cleaned : `${cleaned}。`;
}

function extractPayload(text: string): { body: string; items: HnPayloadItem[] } {
  const index = text.indexOf(ARCHIVE_PAYLOAD_MARKER);
  if (index < 0) return { body: text, items: [] };
  const body = text.slice(0, index).trim();
  const raw = text.slice(index + ARCHIVE_PAYLOAD_MARKER.length).trim();
  try {
    const payload = JSON.parse(raw) as { items?: HnPayloadItem[] };
    return { body, items: payload.items || [] };
  } catch {
    return { body, items: [] };
  }
}

function normalizeParagraph(text: string): string {
  return sanitizeGeneratedText(text);
}

function assertHnTitleUsesChinese(title: string): void {
  if (!hasChinese(title) && !isCompactProperNameOrModelTitle(title)) {
    throw new Error(`HN item title should use a Chinese title: ${title}`);
  }
}

function formatHnTop10(text: string): { markdown: string; ogImage: string } {
  const { body, items: payloadItems } = extractPayload(text);
  const blocks = body
    .split(/(?=^\d+\.\s*🔥?\s+)/gm)
    .map(block => block.trim())
    .filter(block => /^\d+\.\s*🔥?\s+/.test(block) && !/今日 HackerNews 热门文章 Top 10/.test(block));
  const formattedItems: { topic: string; block: string }[] = [];
  blocks.forEach((block, index) => {
    const rank = index + 1;
    const title = block.match(/^\d+\.\s*🔥?\s*(.+)$/m)?.[1]?.trim() || payloadItems[index]?.title || `Item ${rank}`;
    assertHnTitleUsesChinese(title);
    const bullets = extractBullets(block);
    const payload = payloadItems[index] || {};
    const points = bullets.find(bullet => bullet.startsWith("⭐"))?.replace(/^⭐\s*/, "") || `${payload.score || 0} points · ${payload.comments || 0} 评论`;
    const topic = bulletValue(bullets, "主题") || payload.topic || "技术 / 观察";
    const link = bulletValue(bullets, "原文") || payload.url || "";
    const hnLink = bulletValue(bullets, "HN 讨论") || payload.hn_link || "";
    let contentSummary = bulletValue(bullets, "内容总结");
    let commentSummary = bulletValue(bullets, "评论总结");
    if ((!contentSummary || looksLowSignal(contentSummary)) && payload.content_summary) contentSummary = payload.content_summary;
    if ((!commentSummary || looksLowSignal(commentSummary)) && payload.comment_summary) commentSummary = payload.comment_summary;
    if (!contentSummary && payload.original_excerpt) contentSummary = `原文主要信息：${payload.original_excerpt}`;
    if (!commentSummary && payload.hn_comment_excerpt) commentSummary = `HN 评论样本显示：${payload.hn_comment_excerpt}`;
    contentSummary = normalizeParagraph(contentSummary);
    commentSummary = normalizeParagraph(commentSummary);
    if (!contentSummary) return;
    const out = [`## ${rank}. ${title}`, ""];
    if (points) out.push(`- **热度**：${points}`);
    if (link) out.push(`- **原文**：${link}`);
    if (hnLink) out.push(`- **HN 讨论**：${hnLink}`);
    out.push("", contentSummary, "");
    if (commentSummary) out.push(commentSummary, "");
    formattedItems.push({ topic, block: out.join("\n").trim() });
  });
  if (!formattedItems.length) throw new Error("HN source produced no publishable items");
  return {
    markdown: formattedItems.map(item => item.block).join("\n\n"),
    ogImage: HN_DEFAULT_OG_IMAGE,
  };
}

function formatRedditTop20(text: string): string {
  const blocks = text
    .split(/(?=^\d+\.\s*🔴\s+)/gm)
    .map(block => block.trim())
    .filter(block => /^\d+\.\s*🔴\s+/.test(block));
  if (!blocks.length) throw new Error("Reddit Top 20 source produced no publishable items");
  const formatted = blocks.map(block => {
    const lines = block.split("\n");
    const rank = Number(lines[0].match(/^(\d+)\.\s*🔴/)?.[1] ?? "0");
    const title = lines[0].match(/^\d+\.\s*🔴\s+(.+)$/)?.[1]?.trim() ?? `帖子 ${rank}`;
    if (!hasChinese(title)) throw new Error(`Reddit Top 20 item title should use Chinese: ${title}`);
    // 事实 bullet 是标题后紧邻的连续 "- " 行；其后整块都是保留段落与列表结构的 Markdown 摘要，
    // 因此不能用 extractBullets 扫全块——摘要里的 "- " 列表项会被误当成事实字段。
    let bodyStart = 1;
    while (bodyStart < lines.length && lines[bodyStart].trim().startsWith("- ")) bodyStart += 1;
    const bullets = extractBullets(lines.slice(1, bodyStart).join("\n"));
    // life 以外的分类只翻译标题、不生成摘要（composeRedditTitleOnlyBody），所以空摘要是合法形态：
    // 条目退化为标题 + 事实 bullet，不再抛错。
    const summary = normalizeMarkdownBlock(lines.slice(bodyStart).join("\n"));
    const points = bullets.find(b => b.startsWith("⭐"))?.replace(/^⭐\s*/, "") ?? "";
    const subreddit = bulletValue(bullets, "来源");
    const url = bulletValue(bullets, "帖子");
    const out = [`## ${rank}. ${title}`, ""];
    if (points) out.push(`- **热度**：${points}`);
    if (subreddit) out.push(`- **来源**：[${subreddit}](https://www.reddit.com/${subreddit}/)`);
    if (url) out.push(`- **帖子**：${url}`);
    if (summary) out.push("", summary, "");
    return out.join("\n").trim();
  });
  return `${formatted.join("\n\n")}\n`;
}

function normalizedPodcastBlocks(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map(block => block.replace(/^[-*]\s+/gm, "").replace(/\s+/g, " ").trim())
    .filter(block => block.length >= 80 && !block.startsWith("---") && !block.startsWith("《"));
}

function rejectRepeatedPodcastContent(markdown: string): void {
  const headings = (markdown.match(/^##\s+(.+)$/gm) || []).map(heading => heading.replace(/^##\s+/, "").trim().toLowerCase());
  const duplicateHeading = headings.find((heading, index) => headings.indexOf(heading) !== index);
  if (duplicateHeading) throw new Error(`foreign tech podcast contains duplicate episode heading: ${duplicateHeading}`);
  const seen = new Set<string>();
  for (const block of normalizedPodcastBlocks(markdown)) {
    if (seen.has(block)) throw new Error(`foreign tech podcast contains repeated summary content: ${block.slice(0, 80)}`);
    seen.add(block);
  }
}

const DESCRIPTION_MARKER = "DESCRIPTION:";

function extractPodcastDescription(text: string): { text: string; description?: string } {
  const newlineIndex = text.indexOf("\n");
  const firstLine = newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;
  if (!firstLine.startsWith(DESCRIPTION_MARKER)) return { text, description: undefined };
  const description = firstLine.slice(DESCRIPTION_MARKER.length).trim().slice(0, 30) || undefined;
  return { text: newlineIndex >= 0 ? text.slice(newlineIndex + 1) : "", description };
}

function normalizePodcastHeadingDepth(markdown: string): string {
  if (/^##\s+/m.test(markdown) || !/^###\s+/m.test(markdown)) return markdown;
  return markdown.replace(/^(#{3,6})(\s+)/gm, (_match, hashes: string, spacing: string) => `${hashes.slice(1)}${spacing}`);
}

// daily-podcasts 一篇只讲一期，校验保持最小集：禁止合辑小节、至少一个 ## 标题、无重复内容、长度下限。
function formatPodcastEpisode(text: string): { markdown: string; description?: string } {
  const { text: bodyText, description } = extractPodcastDescription(text);
  const normalized = normalizePodcastHeadingDepth(normalizeMarkdown(bodyText));
  for (const marker of ["## 今日总览", "## 今日播客清单"]) {
    if (normalized.includes(marker)) throw new Error(`daily podcasts contains forbidden section: ${marker}`);
  }
  if (!/^##\s+/m.test(normalized)) throw new Error("daily podcasts missing episode heading");
  rejectRepeatedPodcastContent(normalized);
  if (normalized.trim().length < 800) throw new Error(`daily podcasts note is too short (${normalized.trim().length} < 800)`);
  return { markdown: `${normalized.trim()}\n`, description };
}

// 标题取「节目名：本期中文标题」，比通用「笔记｜日期」更具体。
function podcastEpisodeTitle(body: string): string {
  const heading = body.match(/^#{2,3}\s+(.+?)\s*$/m)?.[1]?.trim();
  const show = body.match(/^\s*-\s*(?:\*\*)?节目(?:\*\*)?[：:]\s*(.+?)\s*$/m)?.[1]?.trim();
  if (heading && show && show !== "未标明") return `${show}：${heading}`;
  return heading || "";
}

function rejectPureTutorialWeekly(markdown: string): void {
  const forbidden = [/一文[读看搞]懂/, /从零(?:开始)?/, /入门教程/, /基础教程/, /面试题/, /API\s*详解/i, /使用教程/];
  for (const pattern of forbidden) {
    if (pattern.test(markdown)) throw new Error(`tech weekly contains pure tutorial language: ${pattern.source}`);
  }
}

function stripLeadingTitleHeading(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]+\n{2,}/, "");
}

function rejectDuplicateLinksAndHeadings(markdown: string, label: string): void {
  const links = (markdown.match(/https?:\/\/\S+/g) || []).map(link => link.replace(/[)）.,，。]+$/, "").toLowerCase());
  if (new Set(links).size !== links.length) throw new Error(`${label} contains duplicate links`);
  const headings = (markdown.match(/^###\s+(.+)$/gm) || []).map(heading => heading.replace(/^###\s+/, "").replace(/\]\(.+\)/, "]").trim().toLowerCase());
  if (new Set(headings).size !== headings.length) throw new Error(`${label} contains duplicate headings`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionBody(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m").exec(markdown);
  if (!match) throw new Error(`missing section: ${heading}`);
  const rest = markdown.slice(match.index + match[0].length);
  const next = rest.search(/\n##\s+/);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function assertTechDailyBriefOverview(markdown: string): void {
  const overview = sectionBody(markdown, "今日总览");
  if (/^[-*]\s+/m.test(overview)) throw new Error("tech daily overview must be one short paragraph, not a list");
  const paragraphs = overview
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length !== 1) throw new Error(`tech daily overview must be exactly one paragraph, got ${paragraphs.length}`);
  const length = compact(paragraphs[0]).length;
  if (length > 140) throw new Error(`tech daily overview is too long (${length} > 140)`);
}

function assertLinkedHeadingsUseChinese(markdown: string, label: string): void {
  for (const match of markdown.matchAll(/^###\s+\[([^\]]+)\]\(https?:\/\/[^)]+\)\s*$/gm)) {
    const title = match[1].trim();
    if (!hasChinese(title)) throw new Error(`${label} linked heading should use a Chinese title: ${title}`);
  }
}

function formatTechDaily(text: string): string {
  const normalized = stripLeadingTitleHeading(normalizeMarkdown(text));
  rejectPureTutorialWeekly(normalized);
  rejectDuplicateLinksAndHeadings(normalized, "tech daily");
  assertTechDailyBriefOverview(normalized);
  assertLinkedHeadingsUseChinese(normalized, "tech daily");
  const links = normalized.match(/https?:\/\/\S+/g) || [];
  if (links.length < 1) throw new Error(`tech daily needs source links, got ${links.length}`);
  if (!/影响|取舍|风险|迁移|适合|代价|工程|实践|架构|版本|安全/.test(normalized)) throw new Error("tech daily lacks engineering judgement language");
  return `${normalized.trim()}\n`;
}

function assertGitHubTrendingStats(markdown: string): void {
  const headings = [...markdown.matchAll(/^#{2,3}\s+(?:\d+\.\s+)?\[[^\]]+\]\(https:\/\/github\.com\/[^)]+\)\s*$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const start = match.index || 0;
    const end = index + 1 < headings.length ? headings[index + 1].index || markdown.length : markdown.length;
    const block = markdown.slice(start, end);
    for (const label of ["项目总结", "技术栈", "使用场景", "Stars", "Forks", "今日新增 Stars"]) {
      if (!new RegExp(`^- ${label}：\\S+`, "m").test(block)) throw new Error(`GitHub trending daily item missing ${label} metadata: ${match[0]}`);
    }
  }
}

function formatGitHubTrendingDaily(text: string): string {
  const normalized = stripLeadingTitleHeading(normalizeMarkdown(text));
  rejectDuplicateLinksAndHeadings(normalized, "GitHub trending daily");
  assertGitHubTrendingStats(normalized);
  return `${normalized.trim()}\n`;
}

// 热搜稿复用 Reddit 分类稿的编号标题与事实列表版式；摘要保留在元数据之后。
// 格式化完成后仍单独校验热搜的最低条数和逐帖事实完整性。
function formatRedditTrending(text: string): string {
  const normalized = formatRedditTop20(text);
  const blocks = normalized
    .split(/(?=^##\s+\d+\.\s+)/gm)
    .map(block => block.trim())
    .filter(block => /^##\s+\d+\.\s+/.test(block));
  const topics = blocks.length;
  if (topics < REDDIT_TRENDING_MIN_TOPICS) throw new Error(`Reddit trending needs at least ${REDDIT_TRENDING_MIN_TOPICS} topics, got ${topics}`);
  const headings = blocks.map(block => block.match(/^##\s+\d+\.\s+(.+)$/m)?.[1]?.trim() ?? "");
  for (const heading of headings) {
    if (!hasChinese(heading)) throw new Error(`Reddit trending topic heading should use Chinese: ${heading}`);
  }
  if (new Set(headings.map(heading => heading.toLowerCase())).size !== headings.length) {
    throw new Error("Reddit trending contains duplicate topic headings");
  }
  for (const block of blocks) {
    if (!/^- \*\*热度\*\*：[\d,]+ points · [\d,]+ 评论$/m.test(block)) {
      throw new Error("Reddit trending needs a heat line per topic");
    }
    if (!/^- \*\*来源\*\*：\[r\/[^\]]+\]\(https:\/\/www\.reddit\.com\/r\/[^\s)]+\/\)$/m.test(block)) {
      throw new Error("Reddit trending needs a subreddit source per topic");
    }
    if (!/^- \*\*帖子\*\*：https:\/\/www\.reddit\.com\/\S+$/m.test(block)) {
      throw new Error("Reddit trending needs a post link per topic");
    }
  }
  // 入选理由是给写稿模型的内部提示，照抄进正文等于把编辑流程漏给读者。
  if (/入选理由/.test(normalized)) throw new Error("Reddit trending must not echo the selection rationale");
  for (const pattern of [/引发热议/, /众说纷纭/, /值得关注/, /持续关注/, /本文将/]) {
    if (pattern.test(normalized)) throw new Error(`Reddit trending contains forbidden language: ${pattern.source}`);
  }
  return `${normalized.trim()}\n`;
}

function formatWeiboTrending(text: string): string {
  const normalized = stripLeadingTitleHeading(normalizeMarkdown(text));
  const entries = normalized.match(/^## \d+\.\s+.+$/gm) || [];
  if (!entries.length) throw new Error("Weibo trending needs at least one topic entry");
  const topicLinks = normalized.match(/^- \*\*话题\*\*：\[[^\]]+\]\(https:\/\/[^\s)]+\)$/gm) || [];
  const summaries = normalized.match(/^- \*\*摘要\*\*：\S.+$/gm) || [];
  if (topicLinks.length !== entries.length || summaries.length !== entries.length) {
    throw new Error(`Weibo trending needs a topic link and summary per entry: ${topicLinks.length}/${summaries.length} vs ${entries.length}`);
  }
  return `${normalized.trim()}\n`;
}

function formatMdblistWeekly(text: string): string {
  const normalized = stripLeadingTitleHeading(normalizeMarkdown(text));
  const sections = ["电影推荐", "剧集推荐"].filter(section => new RegExp(`^##\\s+${section}\\s*$`, "m").test(normalized));
  if (!sections.length) throw new Error("mdblist weekly needs at least one of 电影推荐 or 剧集推荐");
  const works = (normalized.match(/^###\s+.+$/gm) || []).length;
  if (works < 1) throw new Error("mdblist weekly needs at least one title entry");
  const count = (label: string): number => (normalized.match(new RegExp(`^####\\s+${label}\\s*$`, "gm")) || []).length;
  if (count("基本信息") !== works) throw new Error(`mdblist weekly each work needs a 基本信息 block: ${count("基本信息")} vs ${works} works`);
  for (const label of ["剧情概要", "推荐理由", "评论总结"]) {
    if (count(label) < works) throw new Error(`mdblist weekly missing ${label} block for some works: ${count(label)} < ${works}`);
  }
  const posters = (normalized.match(/^!\[[^\]]*\]\(https:\/\/image\.tmdb\.org\/[^)]+\)\s*$/gm) || []).length;
  if (posters < works - 1) throw new Error(`mdblist weekly needs a poster per work, got ${posters} for ${works} works`);
  if (!/IMDb/.test(normalized)) throw new Error("mdblist weekly 基本信息 lacks IMDb rating");
  for (const pattern of [/待补充/, /示例/, /信息不足/, /无法判断/, /本文将/]) {
    if (pattern.test(normalized)) throw new Error(`mdblist weekly contains forbidden language: ${pattern.source}`);
  }
  return `${normalized.trim()}\n`;
}

function formatNytBooksWeekly(text: string): { markdown: string; ogImage: string } {
  const normalized = stripLeadingTitleHeading(normalizeMarkdown(text));
  const ogImage = normalized.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)?.[1] || "";
  return { markdown: `${normalized.trim()}\n`, ogImage };
}

function formatMagazineWeekly(text: string): { markdown: string; ogImage: string } {
  const normalized = stripLeadingTitleHeading(normalizeMarkdown(text));
  const articles = normalized.match(/^##\s+\S.+$/gm) || [];
  if (articles.length < 3) throw new Error(`economist weekly needs at least three articles, got ${articles.length}`);
  for (const label of ["一句话摘要", "核心观点", "内容总结"]) {
    const count = (normalized.match(new RegExp(`^###\\s+${label}\\s*$`, "gm")) || []).length;
    if (count !== articles.length) throw new Error(`economist weekly needs ${label} for every article: ${count} vs ${articles.length}`);
  }
  return { markdown: `${normalized.trim()}\n`, ogImage: "" };
}

function formatEconomistWeekly(text: string): { markdown: string; ogImage: string } {
  const formatted = formatMagazineWeekly(text);
  const articleCount = (formatted.markdown.match(/^##\s+\S.+$/gm) || []).length;
  const imageCount = (formatted.markdown.match(/^!\[.*\]\(\/images\/magazine\/economist\/\d{4}-\d{2}-\d{2}\/\d{2,}\.(?:avif|gif|jpe?g|png|webp)\)$/gm) || []).length;
  if (imageCount !== articleCount) throw new Error(`economist weekly needs one local image per article: ${imageCount} vs ${articleCount}`);
  return formatted;
}

// 每个任务的成文函数。写成全量 Record：漏掉一个任务是类型错误，而不是运行到归档那一刻才抛
// 「no archive formatter」。formatter 住在这里而不是 blog_tasks.ts——后者必须保持无第三方依赖，
// 否则每个 compose 模块和它们的测试都会被拖进一整套 DOM 实现。
type ArchiveFormatter = (body: string) => { markdown: string; ogImage?: string; description?: string };

const ARCHIVE_FORMATTERS: Record<Task, ArchiveFormatter> = {
  "hn-top10": formatHnTop10,
  "reddit-top20": body => ({ markdown: formatRedditTop20(body) }),
  "reddit-trending": body => ({ markdown: formatRedditTrending(body) }),
  "weibo-trending": body => ({ markdown: formatWeiboTrending(body) }),
  "daily-podcasts": formatPodcastEpisode,
  "apple-top-podcasts": formatPodcastEpisode,
  "xyzrank-top-episodes": formatPodcastEpisode,
  "tech-daily": body => ({ markdown: formatTechDaily(body) }),
  "github-trending-daily": body => ({ markdown: formatGitHubTrendingDaily(body) }),
  "mdblist-weekly": body => ({ markdown: formatMdblistWeekly(body) }),
  "nyt-books-weekly": formatNytBooksWeekly,
  "economist-weekly": formatEconomistWeekly,
  "new-yorker-weekly": formatMagazineWeekly,
  "atlantic-monthly": formatMagazineWeekly,
  "wired-monthly": formatMagazineWeekly,
};

export function archivePost({
  task,
  date,
  repo,
  body,
  force,
  fileNameSuffix = "",
  titleSuffix = "",
  ogImage = "",
  description: providedDescription,
}: {
  task: string;
  date: string;
  repo: string;
  body: string;
  force: boolean;
  fileNameSuffix?: string;
  titleSuffix?: string;
  ogImage?: string;
  description?: string;
}): ArchiveResult {
  if (!isTask(task)) throw new Error(`unsupported task: ${task}`);
  const info = taskInfo(task);
  const relPath = fileNameSuffix ? taskPostRelPath(task, `${date}-${fileNameSuffix}`) : taskPostRelPath(task, date);
  const title = info.episodeArticles ? podcastEpisodeTitle(body) || taskTitle(task, date) : titleSuffix ? `${taskTitle(task, date)}｜${titleSuffix}` : taskTitle(task, date);
  const absPath = path.join(repo, relPath);
  if (!force && fs.existsSync(absPath)) {
    return { task, path: relPath, title, created: false, skipped: true, updated_at_bjt: bjtTimestamp(), commit: "", push: "", tags: taskTags(task) };
  }
  const formatted = ARCHIVE_FORMATTERS[task](body);
  const description = formatted.description ?? providedDescription ?? info.description;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const existed = fs.existsSync(absPath);
  fs.writeFileSync(
    absPath,
    `${frontmatter({
      title,
      date,
      description,
      tags: taskTags(task),
      ogImage: formatted.ogImage || ogImage,
      wechatEnabled: Boolean(info.wechatEnabled),
    })}${formatted.markdown.trim()}\n`,
    "utf8",
  );
  return { task, path: relPath, title, created: !existed, skipped: false, updated_at_bjt: bjtTimestamp(), commit: "", push: "", tags: taskTags(task) };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const task = stringArg(args, "task");
  const date = stringArg(args, "date") || stringArg(args, "period");
  const repo = path.resolve(stringArg(args, "repo", repoRoot()));
  if (!task || !date) throw new Error("--task and --date are required");
  const result = archivePost({ task, date, repo, body: readStdin(), force: args.force === true || args["no-overwrite"] !== true });
  writeStdout(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(`ERROR: ${message}`);
    process.exit(1);
  });
}

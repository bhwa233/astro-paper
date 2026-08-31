import { ARCHIVE_PAYLOAD_MARKER } from "./compose_common.ts";
import { clipText, envPositiveInt, fetchJson, fetchText, mapWithConcurrency } from "./blog_common.ts";
import { parseHtml } from "./html_dom.ts";
import { htmlNodeToMarkdown } from "./html_to_markdown.ts";
import { restrictedFetch } from "./restricted_fetch.ts";

export const FORUM_TOP10_CONTRACT_VERSION = "forum-top10-source.v1";
export const FORUM_TOP10_LIMIT = 10;
const FIVE_CH_RANKING_URL = "https://headline.5ch.io/ikioig/";
const DC_INSIDE_RANKING_URL = "https://gall.dcinside.com/board/lists/?id=dcbest";
const DC_INSIDE_COMMENT_URL = "https://gall.dcinside.com/board/comment/";
const FIVE_CH_REPLY_LIMIT = 200;
const DC_INSIDE_COMMENT_LIMIT = 100;

export type ForumPlatform = "5ch" | "DC Inside";

export type ForumTop10Item = {
  itemId: number;
  platform: ForumPlatform;
  rank: number;
  title: string;
  url: string;
  board: string;
  snapshotAt: string;
  views: number | null;
  recommendations: number | null;
  commentCount: number | null;
  body: string;
  comments: string[];
  imagesIgnored: number;
  detailError: string;
  summary?: string;
  summaryError?: string;
};

export type ForumTop10Payload = {
  contract_version: typeof FORUM_TOP10_CONTRACT_VERSION;
  snapshot_at: string;
  items: ForumTop10Item[];
};

type DcComment = {
  memo?: unknown;
  del_yn?: unknown;
};

type DcCommentResponse = {
  comments?: unknown;
};

function normalizedText(value = ""): string {
  return value.replace(/[\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

function markdownWithoutImages(element: Element | null): { markdown: string; imageCount: number } {
  if (!element) return { markdown: "", imageCount: 0 };
  const clone = element.cloneNode(true) as HTMLElement;
  const imageCount = clone.querySelectorAll("img, video").length;
  clone.querySelectorAll("img, video, script, style, template, noscript, form, button").forEach(node => node.remove());
  return { markdown: htmlNodeToMarkdown(clone).trim(), imageCount };
}

function assertFiveChUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".5ch.io") || !/^\/test\/read\.cgi\/[A-Za-z0-9]+\/\d+\/?$/.test(url.pathname)) {
    throw new Error(`5ch ranking returned an invalid thread URL: ${raw}`);
  }
  return url.href;
}

function assertDcInsideUrl(raw: string, base = DC_INSIDE_RANKING_URL): string {
  const url = new URL(raw, base);
  if (url.protocol !== "https:" || url.hostname !== "gall.dcinside.com" || url.pathname !== "/board/view/" || url.searchParams.get("id") !== "dcbest") {
    throw new Error(`DC Inside ranking returned an invalid post URL: ${raw}`);
  }
  return url.href;
}

export function parseFiveChRankingHtml(html: string, snapshotAt: string): ForumTop10Item[] {
  const document = parseHtml(html, FIVE_CH_RANKING_URL);
  const cards = [...document.querySelectorAll(".card")];
  const items = cards.slice(0, FORUM_TOP10_LIMIT).map((card, index) => {
    const link = card.querySelector<HTMLAnchorElement>("a[href*='/test/read.cgi/']");
    const title = normalizedText(link?.textContent || "");
    if (!link || !title) throw new Error(`5ch ranking item ${index + 1} is missing title or link`);
    return {
      itemId: index + 1,
      platform: "5ch" as const,
      rank: index + 1,
      title,
      url: assertFiveChUrl(link.href),
      board: normalizedText(card.querySelector(".tag")?.textContent || ""),
      snapshotAt,
      views: null,
      recommendations: null,
      commentCount: null,
      body: "",
      comments: [],
      imagesIgnored: 0,
      detailError: "",
    };
  });
  if (items.length !== FORUM_TOP10_LIMIT) throw new Error(`5ch ranking returned ${items.length} posts; expected ${FORUM_TOP10_LIMIT}`);
  return items;
}

function numericText(value = ""): number | null {
  const normalized = value.replaceAll(",", "").match(/\d+/)?.[0];
  return normalized ? Number(normalized) : null;
}

export function parseDcInsideRankingHtml(html: string, snapshotAt: string): ForumTop10Item[] {
  const document = parseHtml(html, DC_INSIDE_RANKING_URL);
  const rows = [...document.querySelectorAll<HTMLTableRowElement>("tr.ub-content.us-post[data-no]")];
  const items = rows.slice(0, FORUM_TOP10_LIMIT).map((row, index) => {
    const link = row.querySelector<HTMLAnchorElement>(".gall_tit > a:not(.reply_numbox)");
    const title = normalizedText(link?.textContent || "");
    if (!link || !title) throw new Error(`DC Inside ranking item ${index + 1} is missing title or link`);
    return {
      itemId: FORUM_TOP10_LIMIT + index + 1,
      platform: "DC Inside" as const,
      rank: index + 1,
      title,
      url: assertDcInsideUrl(link.getAttribute("href") || ""),
      board: title.match(/^\[([^\]]+)\]/)?.[1] || "실시간 베스트",
      snapshotAt,
      views: numericText(row.querySelector(".gall_count")?.textContent || ""),
      recommendations: numericText(row.querySelector(".gall_recommend")?.textContent || ""),
      commentCount: numericText(row.querySelector(".reply_num")?.textContent || ""),
      body: "",
      comments: [],
      imagesIgnored: 0,
      detailError: "",
    };
  });
  if (items.length !== FORUM_TOP10_LIMIT) throw new Error(`DC Inside ranking returned ${items.length} posts; expected ${FORUM_TOP10_LIMIT}`);
  return items;
}

function evidenceRangeUrl(url: string): string {
  return `${url.replace(/\/$/, "")}/1-${FIVE_CH_REPLY_LIMIT + 1}`;
}

async function fetchFiveChDetail(item: ForumTop10Item): Promise<ForumTop10Item> {
  try {
    const url = evidenceRangeUrl(item.url);
    const response = await restrictedFetch(url, {
      allowedHosts: [new URL(url).hostname],
      maxBytes: 3_000_000,
      timeoutMs: 30_000,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const html = new TextDecoder("shift_jis").decode(response.bytes);
    const document = parseHtml(html, url);
    const posts = [...document.querySelectorAll(".post")].slice(0, FIVE_CH_REPLY_LIMIT + 1);
    if (!posts.length) throw new Error("thread returned no readable posts");
    const evidence = posts.map(post => markdownWithoutImages(post.querySelector(".post-content")));
    const body = clipText(evidence[0]?.markdown || "", 8_000);
    const comments = evidence.slice(1).map((entry, index) => `${index + 2}. ${clipText(entry.markdown, 1_200)}`).filter(line => !/^\d+\.\s*$/.test(line));
    const totalComments = numericText(document.querySelector(".pagestats .metastats")?.textContent || "");
    return {
      ...item,
      body,
      comments,
      imagesIgnored: evidence.reduce((total, entry) => total + entry.imageCount, 0),
      commentCount: totalComments ?? Math.max(item.commentCount || 0, posts.length - 1),
    };
  } catch (error) {
    return { ...item, detailError: error instanceof Error ? error.message : String(error) };
  }
}

function commentText(memo: unknown): string {
  const html = typeof memo === "string" ? memo : "";
  if (!html) return "";
  return clipText(markdownWithoutImages(parseHtml(`<body>${html}</body>`).body).markdown, 1_200);
}

async function fetchDcInsideComments(item: ForumTop10Item, detailHtml: string): Promise<string[]> {
  const document = parseHtml(detailHtml, item.url);
  const token = (document.querySelector<HTMLInputElement>("#e_s_n_o")?.value || "").trim();
  const no = new URL(item.url).searchParams.get("no") || "";
  if (!token || !no) throw new Error("detail page is missing the comment token");
  const body = new URLSearchParams({
    id: "dcbest",
    no,
    cmt_id: "dcbest",
    cmt_no: no,
    e_s_n_o: token,
    comment_page: "1",
    sort: "D",
    prevCnt: "0",
    board_type: "",
    _GALLTYPE_: "G",
  }).toString();
  const payload = await fetchJson<DcCommentResponse>(DC_INSIDE_COMMENT_URL, {
    method: "POST",
    body,
    maxChars: 2_000_000,
    timeoutMs: 30_000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: item.url,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const rawComments = Array.isArray(payload.comments) ? payload.comments as DcComment[] : [];
  const comments = rawComments
    .slice(0, DC_INSIDE_COMMENT_LIMIT)
    .filter(comment => comment.del_yn !== "Y")
    .map(comment => commentText(comment.memo))
    .filter(Boolean);
  return comments;
}

async function fetchDcInsideDetail(item: ForumTop10Item): Promise<ForumTop10Item> {
  try {
    const html = await fetchText(item.url, { maxChars: 2_000_000, timeoutMs: 30_000 });
    const document = parseHtml(html, item.url);
    const content = markdownWithoutImages(document.querySelector(".write_div"));
    let comments: string[] = [];
    let commentError = "";
    try {
      comments = await fetchDcInsideComments(item, html);
    } catch (error) {
      commentError = error instanceof Error ? error.message : String(error);
    }
    if (!content.markdown && content.imageCount === 0 && !comments.length) throw new Error("post returned no readable text");
    return {
      ...item,
      body: clipText(content.markdown, 12_000),
      comments,
      imagesIgnored: content.imageCount,
      detailError: commentError ? `comments unavailable: ${commentError}` : "",
    };
  } catch (error) {
    return { ...item, detailError: error instanceof Error ? error.message : String(error) };
  }
}

function renderItemEvidence(item: ForumTop10Item): string {
  const lines = [
    `## ${item.itemId}. [${item.platform} #${item.rank}] ${item.title}`,
    `- 平台：${item.platform}`,
    `- 平台排名：${item.rank}`,
    `- 原始标题：${JSON.stringify(item.title)}`,
    `- 原帖：${item.url}`,
    `- 板块：${item.board || "未标明"}`,
    `- 榜单快照：${item.snapshotAt}`,
  ];
  if (item.views !== null) lines.push(`- 浏览：${item.views}`);
  if (item.recommendations !== null) lines.push(`- 推荐：${item.recommendations}`);
  if (item.commentCount !== null) lines.push(`- 评论数：${item.commentCount}`);
  lines.push(`- 忽略图片：${item.imagesIgnored}`);
  if (item.detailError) lines.push(`- 取证异常：${item.detailError}`);
  lines.push("", "### 正文证据", "", item.body || "（无可读取的文本正文；图片内容未识别）", "", `### 评论证据（最多 ${item.platform === "5ch" ? FIVE_CH_REPLY_LIMIT : DC_INSIDE_COMMENT_LIMIT} 条）`, "");
  lines.push(item.comments.length ? item.comments.join("\n\n") : "（无可读取的文本评论）");
  if (item.summary !== undefined || item.summaryError) {
    lines.push("", `- 中文摘要：${JSON.stringify(item.summary || "")}`);
    if (item.summaryError) lines.push(`- 摘要异常：${item.summaryError}`);
  }
  return lines.join("\n");
}

export function renderForumTop10Source(payload: ForumTop10Payload): string {
  return [
    `# 5ch 与 DC Inside 实时榜 Top 10 证据｜${payload.snapshot_at}`,
    "",
    "榜单顺序、原始标题和链接取自同一次快照；图片节点不进入当前版本的摘要证据。",
    "",
    ...payload.items.flatMap(item => [renderItemEvidence(item), ""]),
    ARCHIVE_PAYLOAD_MARKER,
    JSON.stringify(payload),
    "",
  ].join("\n");
}

export async function buildForumTop10Source(): Promise<string> {
  const snapshotAt = new Date().toISOString();
  const [fiveChHtml, dcInsideHtml] = await Promise.all([
    fetchText(FIVE_CH_RANKING_URL, { maxChars: 1_000_000, timeoutMs: 30_000 }),
    fetchText(DC_INSIDE_RANKING_URL, { maxChars: 2_000_000, timeoutMs: 30_000 }),
  ]);
  const fiveCh = parseFiveChRankingHtml(fiveChHtml, snapshotAt);
  const dcInside = parseDcInsideRankingHtml(dcInsideHtml, snapshotAt);
  const concurrency = envPositiveInt("FORUM_TOP10_FETCH_CONCURRENCY", 4, 8);
  const [fiveChWithDetails, dcInsideWithDetails] = await Promise.all([
    mapWithConcurrency(fiveCh, concurrency, fetchFiveChDetail),
    mapWithConcurrency(dcInside, concurrency, fetchDcInsideDetail),
  ]);
  return renderForumTop10Source({
    contract_version: FORUM_TOP10_CONTRACT_VERSION,
    snapshot_at: snapshotAt,
    items: [...fiveChWithDetails, ...dcInsideWithDetails],
  });
}

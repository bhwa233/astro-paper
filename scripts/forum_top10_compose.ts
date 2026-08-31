import { ARCHIVE_PAYLOAD_MARKER, hasChinese, normalizeMarkdownBlock, parseModelJsonObject } from "./compose_common.ts";
import { FORUM_TOP10_CONTRACT_VERSION, FORUM_TOP10_LIMIT, type ForumPlatform, type ForumTop10Item, type ForumTop10Payload, renderForumTop10Source } from "./forum_top10_source.ts";

const SUMMARY_MIN_CHARS = 80;

function validItems(items: unknown): ForumTop10Item[] {
  if (!Array.isArray(items)) throw new Error("forum Top 10 payload items must be an array");
  const parsed = items as ForumTop10Item[];
  if (parsed.length !== FORUM_TOP10_LIMIT * 2) {
    throw new Error(`forum Top 10 payload has ${parsed.length} items; expected ${FORUM_TOP10_LIMIT * 2}`);
  }
  parsed.forEach((item, index) => {
    if (item.itemId !== index + 1) throw new Error(`forum Top 10 payload order changed at item ${index + 1}: got ${item.itemId}`);
  });
  const expectedPlatforms: ForumPlatform[] = ["5ch", "DC Inside"];
  expectedPlatforms.forEach((platform, platformIndex) => {
    const platformItems = parsed.filter(item => item.platform === platform);
    if (platformItems.length !== FORUM_TOP10_LIMIT) throw new Error(`${platform} payload has ${platformItems.length} items; expected ${FORUM_TOP10_LIMIT}`);
    platformItems.forEach((item, index) => {
      const expectedRank = index + 1;
      const expectedId = platformIndex * FORUM_TOP10_LIMIT + expectedRank;
      if (item.rank !== expectedRank || item.itemId !== expectedId) {
        throw new Error(`${platform} payload order changed at position ${expectedRank}: item ${item.itemId}, rank ${item.rank}`);
      }
      if (!item.title?.trim() || !item.url?.trim()) throw new Error(`${platform} rank ${expectedRank} is missing original title or URL`);
    });
  });
  return parsed;
}

export function parseForumTop10Payload(source: string): ForumTop10Payload {
  const markerIndex = source.lastIndexOf(ARCHIVE_PAYLOAD_MARKER);
  if (markerIndex < 0) throw new Error("forum Top 10 source is missing its archive payload");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(markerIndex + ARCHIVE_PAYLOAD_MARKER.length).trim());
  } catch (error) {
    throw new Error(`forum Top 10 source payload is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("forum Top 10 source payload must be an object");
  const payload = parsed as Partial<ForumTop10Payload>;
  if (payload.contract_version !== FORUM_TOP10_CONTRACT_VERSION) {
    throw new Error(`unsupported forum Top 10 source contract: ${String(payload.contract_version)}`);
  }
  if (!payload.snapshot_at || Number.isNaN(Date.parse(payload.snapshot_at))) throw new Error("forum Top 10 source has an invalid snapshot time");
  return { contract_version: FORUM_TOP10_CONTRACT_VERSION, snapshot_at: payload.snapshot_at, items: validItems(payload.items) };
}

export function parseForumItemSummary(raw: string, expectedItemId: number): string {
  const payload = parseModelJsonObject(raw, `forum Top 10 item ${expectedItemId}`);
  const itemId = Number(payload.item_id);
  const summary = normalizeMarkdownBlock(String(payload.summary || ""));
  if (itemId !== expectedItemId) throw new Error(`forum Top 10 item ID mismatch: ${itemId} vs ${expectedItemId}`);
  if (!summary || !hasChinese(summary)) throw new Error(`forum Top 10 item ${expectedItemId} needs a Chinese summary`);
  if (/^\s{0,3}#{1,6}\s/m.test(summary)) throw new Error(`forum Top 10 item ${expectedItemId} summary must not use Markdown headings`);
  const length = summary.replace(/\s+/g, "").length;
  if (length < SUMMARY_MIN_CHARS) throw new Error(`forum Top 10 item ${expectedItemId} summary is too short: ${length} < ${SUMMARY_MIN_CHARS}`);
  return summary;
}

export function forumSourceWithSummaries(payload: ForumTop10Payload, outcomes: Map<number, { summary: string; error: string }>): string {
  return renderForumTop10Source({
    ...payload,
    items: payload.items.map(item => {
      const outcome = outcomes.get(item.itemId);
      if (!outcome) throw new Error(`forum Top 10 summary outcome is missing item ${item.itemId}`);
      return { ...item, summary: outcome.summary, summaryError: outcome.error };
    }),
  });
}

function unavailableText(item: ForumTop10Item): string {
  if (item.imagesIgnored > 0 && !item.body && !item.comments.length) return "该帖主要由图片构成，当前版本未识别图片内容。";
  if (item.summaryError) return "本次摘要生成失败，原始榜单条目按快照保留。";
  if (item.detailError) return "本次未能取得足够的帖子文本，原始榜单条目按快照保留。";
  return "本次没有取得可用的文本摘要，原始榜单条目按快照保留。";
}

// 查过仓库现有 Markdown 工具与 markdown-it：前者没有行内转义器，后者只负责解析。
// 为避免外部标题注入链接或 HTML，这里只转义行内控制字符，可见文本保持不变。
function markdownInlineText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]])/g, "\\$1");
}

function articleItem(item: ForumTop10Item): string {
  const lines = [`### ${item.rank}. ${markdownInlineText(item.title)}`, ""];
  if (item.platform === "5ch") {
    lines.push(`- **板块**：${markdownInlineText(item.board || "未标明")}`);
    if (item.commentCount !== null) lines.push(`- **回复**：${item.commentCount}`);
  } else {
    const heat = [
      item.views !== null ? `${item.views} 浏览` : "",
      item.recommendations !== null ? `${item.recommendations} 推荐` : "",
      item.commentCount !== null ? `${item.commentCount} 评论` : "",
    ].filter(Boolean).join(" · ");
    if (item.board) lines.push(`- **来源板块**：${markdownInlineText(item.board)}`);
    if (heat) lines.push(`- **热度**：${heat}`);
  }
  lines.push(`- **原帖**：[打开原帖](${item.url})`, "", item.summary?.trim() || unavailableText(item));
  return lines.join("\n");
}

export function forumTop10MarkdownFromSummaries(source: string): string {
  const payload = parseForumTop10Payload(source);
  const section = (platform: ForumPlatform, title: string) => {
    const items = payload.items.filter(item => item.platform === platform);
    return [`## ${title}`, "", ...items.flatMap(item => [articleItem(item), ""])].join("\n").trim();
  };
  return [
    `榜单截取时间：${payload.snapshot_at}。以下排名、标题和链接均按两站当时榜单原样保留；当前版本仅总结可读取的文字正文与评论，不识别帖子图片。`,
    "",
    section("5ch", "5ch 全板势い Top 10"),
    "",
    section("DC Inside", "DC Inside 实时最佳 Top 10"),
    "",
  ].join("\n");
}

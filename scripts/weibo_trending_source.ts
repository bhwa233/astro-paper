// 微博热搜来源层：取匿名榜单前 50 条 -> 逐条智搜 -> 逐条摘要。
// 智搜或摘要失败只丢该话题，不向榜单后续条目补位。
import fs from "node:fs";
import path from "node:path";
import { resolvePromptFile } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries, writeAiArtifact } from "./ai_json_stage.ts";
import { compact, fetchJson, repoRoot, writeStderr, writeStdout } from "./blog_common.ts";
import { bulletValue, extractBullets, hasChinese, normalizeMarkdownBlock, numberedBlocks, parseModelJsonObject } from "./compose_common.ts";

export const WEIBO_TRENDING_LIMIT = 50;

const DEFAULT_SUMMARY_URL = "https://raw.githubusercontent.com/bhwa233/weibo-trending-hot-history/master/api/{date}/summary.json";
const SUMMARY_PROMPT_TASK = "weibo-trending";

export type WeiboTrendingItem = {
  rank: number;
  title: string;
  category: string;
  url: string;
  description: string;
  hot: number;
};

type WeiboAiSearchResult = {
  answerMarkdown: string;
  sourceCount: number;
  sourceBreakdown: Record<string, number>;
  fetchedAt: string;
};

type WeiboTrendingSummary = { rank: number; summary: string };

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`);
  return value as number;
}

function summaryItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload, "Weibo trending summary");
  if (!Array.isArray(record.items)) throw new Error("Weibo trending summary must contain an items array");
  return record.items;
}

/** 只信任结构完整、非广告的榜单项；排序沿用上游 summary.json 的顺序。 */
export function parseWeiboTrendingSummary(payload: unknown): WeiboTrendingItem[] {
  const items = summaryItems(payload);
  const parsed: WeiboTrendingItem[] = [];
  for (const [index, value] of items.entries()) {
    const item = asRecord(value, `Weibo trending item ${index + 1}`);
    if (item.ads === true) continue;
    const title = compact(String(item.title || ""));
    const category = compact(String(item.category || "暂无"));
    const url = compact(String(item.url || ""));
    if (!title || !url.startsWith("https://")) throw new Error(`Weibo trending item ${index + 1} is missing its title or topic URL`);
    parsed.push({
      rank: parsed.length + 1,
      title,
      category,
      url,
      description: compact(String(item.description || "")),
      hot: nonNegativeInteger(item.hot ?? 0, `Weibo trending item ${index + 1} hot`),
    });
    if (parsed.length === WEIBO_TRENDING_LIMIT) break;
  }
  return parsed;
}

function summaryUrl(date: string): string {
  return (process.env.WEIBO_TRENDING_SUMMARY_URL || DEFAULT_SUMMARY_URL).replaceAll("{date}", date);
}

function candidateBlock(item: WeiboTrendingItem): string {
  return [
    `## ${item.rank}. ${item.title}`,
    "",
    `- **分类**：${item.category}`,
    `- **话题**：${item.url}`,
    `- **热度**：${item.hot}`,
    ...(item.description ? [`- **导语**：${item.description}`] : []),
  ].join("\n");
}

export function renderWeiboTrendingCandidates(date: string, items: WeiboTrendingItem[]): string {
  const header = [
    `# 微博热搜候选 ${date}`,
    "",
    `- 榜单来源：${summaryUrl(date)}`,
    `- 候选：上游顺序中前 ${WEIBO_TRENDING_LIMIT} 条非广告话题，实际 ${items.length} 条。`,
  ].join("\n");
  return `${[header, ...items.map(candidateBlock)].join("\n\n")}\n`;
}

export async function buildWeiboTrendingSource(date: string): Promise<string> {
  const items = parseWeiboTrendingSummary(await fetchJson(summaryUrl(date)));
  writeStdout(`[weibo-trending] candidates=${items.length}/${WEIBO_TRENDING_LIMIT} summary=${summaryUrl(date)}\n`);
  return renderWeiboTrendingCandidates(date, items);
}

export function parseWeiboTrendingCandidates(source: string): WeiboTrendingItem[] {
  const blocks = numberedBlocks(source);
  return blocks.map((block, index) => {
    const heading = block.match(/^##\s+(\d+)\.\s+(.+)$/m);
    if (!heading || Number(heading[1]) !== index + 1) throw new Error(`Weibo trending candidate ${index + 1} has an invalid heading`);
    const bullets = extractBullets(block);
    const title = compact(heading[2]);
    const url = bulletValue(bullets, "**话题**");
    if (!title || !/^https:\/\//.test(url)) throw new Error(`Weibo trending candidate ${index + 1} is missing title or topic URL`);
    const hot = Number(bulletValue(bullets, "**热度**"));
    if (!Number.isInteger(hot) || hot < 0) throw new Error(`Weibo trending candidate ${index + 1} has invalid heat`);
    return {
      rank: index + 1,
      title,
      category: bulletValue(bullets, "**分类**") || "暂无",
      url,
      description: bulletValue(bullets, "**导语**"),
      hot,
    };
  });
}

function parseWeiboTrendingItemSummary(raw: string, expectedRank: number): WeiboTrendingSummary {
  const payload = parseModelJsonObject(raw, "Weibo trending item summary");
  const rank = Number(payload.rank);
  const summary = normalizeMarkdownBlock(payload.summary);
  if (rank !== expectedRank) throw new Error(`Weibo trending item summary rank mismatch: ${rank} vs ${expectedRank}`);
  if (!summary || !hasChinese(summary)) throw new Error(`Weibo trending item ${expectedRank} needs a Chinese summary`);
  if (/^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s)/m.test(summary)) {
    throw new Error(`Weibo trending item ${expectedRank} summary must be plain paragraphs, not a Markdown list or heading`);
  }
  return { rank, summary };
}

function weiboSourceEndpoint(): { baseUrl: string; headers: Record<string, string> } {
  const baseUrl = (process.env.WEIBO_SOURCE_API_URL || "").replace(/\/+$/, "");
  const token = (process.env.WEIBO_SOURCE_API_TOKEN || "").trim();
  if (!baseUrl) throw new Error("WEIBO_SOURCE_API_URL is required for Weibo trending generation");
  if (!token) throw new Error("WEIBO_SOURCE_API_TOKEN is required for Weibo trending generation");
  try {
    const parsed = new URL(baseUrl);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("unsupported protocol");
  } catch {
    throw new Error("WEIBO_SOURCE_API_URL must be an absolute HTTP(S) URL");
  }
  return { baseUrl, headers: { Authorization: `Bearer ${token}` } };
}

function aiSearchUrl(topic: string): string {
  const url = new URL("https://s.weibo.com/aisearch");
  url.searchParams.set("q", topic);
  return url.toString();
}

function parseWeiboAiSearchResponse(payload: unknown): WeiboAiSearchResult {
  const record = asRecord(payload, "Weibo AI Search response");
  const answerMarkdown = normalizeMarkdownBlock(record.answer_markdown);
  const sourceCount = Number(record.source_count);
  if (!answerMarkdown || !Number.isInteger(sourceCount) || sourceCount < 1) {
    throw new Error("Weibo AI Search response is missing a complete conclusion");
  }
  const rawBreakdown = asRecord(record.source_breakdown, "Weibo AI Search source breakdown");
  const sourceBreakdown = Object.fromEntries(
    Object.entries(rawBreakdown).filter(([, value]) => Number.isInteger(value) && (value as number) >= 0),
  ) as Record<string, number>;
  const fetchedAt = compact(String(record.fetched_at || ""));
  if (!fetchedAt) throw new Error("Weibo AI Search response is missing fetched_at");
  return { answerMarkdown, sourceCount, sourceBreakdown, fetchedAt };
}

function isConfigurationOrLoginFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WEIBO_SOURCE_API_(?:URL|TOKEN) is required|HTTP (?:400|401|403|422|503)\b/.test(message);
}

async function fetchWeiboAiSearch(topic: string): Promise<WeiboAiSearchResult> {
  const endpoint = weiboSourceEndpoint();
  const request = new URL(`${endpoint.baseUrl}/v1/weibo/aisearch`);
  request.searchParams.set("url", aiSearchUrl(topic));
  return parseWeiboAiSearchResponse(await fetchJson(request.toString(), { headers: endpoint.headers, timeoutMs: 90_000 }));
}

function itemPrompt(template: string, date: string, rank: number, title: string, answer: string): string {
  return template
    .replaceAll("{date}", date)
    .replaceAll("{rank}", String(rank))
    .replaceAll("{title}", title)
    .replaceAll("{aisearch_answer}", answer);
}

/** 模型只负责逐条摘要；话题链接、标题、榜单顺序和智搜原文都由代码保留。 */
export async function buildCombinedWeiboTrendingSource({
  source,
  date,
  repo = repoRoot(),
  model,
  promptDir = "",
  artifactsDir = "",
}: {
  source: string;
  date: string;
  repo?: string;
  model: string;
  promptDir?: string;
  artifactsDir?: string;
}): Promise<string> {
  writeAiArtifact(artifactsDir, "weibo-trending", "candidates.md", source);
  const candidates = parseWeiboTrendingCandidates(source);
  const header = `# 微博热搜 ${date}`;
  if (!candidates.length) return `${header}\n\n- 结果：当天榜单没有可用的非广告话题。\n`;

  const resolvedPromptDir = promptDir || path.join(repo, "prompts/blog");
  writeStdout(`[weibo-trending] topics=${candidates.length}/${WEIBO_TRENDING_LIMIT}\n`);
  const summaryTemplate = fs.readFileSync(resolvePromptFile(resolvedPromptDir, SUMMARY_PROMPT_TASK), "utf8");
  const completed: Array<{ item: WeiboTrendingItem; result: WeiboAiSearchResult; summary: WeiboTrendingSummary }> = [];
  const dropped: Array<{ rank: number; stage: "aisearch" | "summary"; error: string }> = [];
  for (const item of candidates) {
    let result: WeiboAiSearchResult;
    try {
      result = await fetchWeiboAiSearch(item.title);
      writeAiArtifact(artifactsDir, "weibo-trending", `item-${String(item.rank).padStart(2, "0")}-aisearch.json`, JSON.stringify(result, null, 2));
    } catch (error) {
      if (isConfigurationOrLoginFailure(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      dropped.push({ rank: item.rank, stage: "aisearch", error: message });
      writeStderr(`WARN: [weibo-trending] dropped #${item.rank} after AI Search failure: ${message}`);
      continue;
    }
    const prompt = itemPrompt(summaryTemplate, date, item.rank, item.title, result.answerMarkdown);
    writeAiArtifact(artifactsDir, "weibo-trending", `item-${String(item.rank).padStart(2, "0")}-summary-prompt.md`, prompt);
    const outcome = await generateJsonStageWithRetries<{ summary: WeiboTrendingSummary | null; error?: string }>({
      task: "weibo-trending",
      stage: `Weibo trending summary ${item.rank}`,
      artifactPrefix: `item-${String(item.rank).padStart(2, "0")}-summary`,
      prompt,
      model,
      artifactsDir,
      parse: content => ({ summary: parseWeiboTrendingItemSummary(content, item.rank) }),
      onExhausted: error => ({ summary: null, error }),
    });
    if (outcome.summary) completed.push({ item, result, summary: outcome.summary });
    else dropped.push({ rank: item.rank, stage: "summary", error: outcome.error || "summary generation failed" });
  }
  if (dropped.length) writeAiArtifact(artifactsDir, "weibo-trending", "dropped-items.json", JSON.stringify({ dropped }, null, 2));
  if (!completed.length) return `${header}\n\n- 结果：没有取得可发布的完整微博智搜结论。\n`;

  const combined = [
    header,
    "",
    "每条摘要仅基于对应话题的完整微博智搜结论；话题链接与标题由榜单事实提供。",
    "",
    ...completed.map(({ item, result, summary }, index) => [
      `## ${index + 1}. ${item.title}`,
      "",
      `- **话题**：${item.url}`,
      `- **智搜结论**：${JSON.stringify(result.answerMarkdown)}`,
      `- **智搜引用数**：${result.sourceCount}`,
      `- **智搜摘要**：${JSON.stringify(summary.summary)}`,
    ].join("\n")),
  ].join("\n");
  writeAiArtifact(artifactsDir, "weibo-trending", "source.dynamic.md", combined);
  return `${combined}\n`;
}

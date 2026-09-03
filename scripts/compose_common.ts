// 各任务 compose 规则层共用的解析工具：source 编号块解析 + 模型 JSON 容错解析。
export {
  bulletValue,
  extractBullets,
  hasChinese,
  isCompactProperNameOrModelTitle,
  looksLowSignal,
  normalizeMarkdownBlock,
  numberedBlocks,
} from "./markdown_text.ts";

// source 正文与结构化归档载荷之间的分隔标记：hn_top10_source 写入，compose 与 archive 两层都要切它。
export const ARCHIVE_PAYLOAD_MARKER = "===ARCHIVE_PAYLOAD===";

// Markdown 正文以 JSON 字符串形式塞进单行 bullet 承载（换行被转义），解析时还原。
export function decodeMarkdownBlock(value: string): string {
  if (!value.startsWith('"')) return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

// 去掉模型可能裹上的 ```json 围栏，截取第一个 {...} 到最后一个 }。
export function stripJsonFence(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}

export function parseModelJsonObject(raw: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label} model output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

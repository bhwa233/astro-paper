import { compact } from "./blog_common.ts";
import { decodeMarkdownBlock, hasChinese, parseModelJsonObject } from "./compose_common.ts";

export const WEIBO_TRENDING_TITLE_SUFFIX_MAX_LENGTH = 40;

export function validateWeiboTrendingTitleSuffix(value: unknown, label = "Weibo trending title suffix"): string {
  const raw = typeof value === "string" ? value : "";
  const suffix = compact(raw);
  if (!suffix || !hasChinese(suffix)) throw new Error(`${label} must contain Chinese text`);
  if (/\r|\n/.test(raw)) throw new Error(`${label} must stay on one line`);
  if ([...suffix].length > WEIBO_TRENDING_TITLE_SUFFIX_MAX_LENGTH) {
    throw new Error(`${label} exceeds ${WEIBO_TRENDING_TITLE_SUFFIX_MAX_LENGTH} characters`);
  }
  if (/热搜|\d{4}-\d{2}-\d{2}|[｜|]/.test(suffix)) throw new Error(`${label} must not repeat the fixed title prefix`);
  if (/^[#>*-]\s|```|\[[^\]]+\]\([^)]+\)/.test(suffix)) throw new Error(`${label} must be plain text`);
  return suffix;
}

export function parseWeiboTrendingTitleResponse(raw: string): string {
  const payload = parseModelJsonObject(raw, "Weibo trending title");
  return validateWeiboTrendingTitleSuffix(payload.title_suffix, "Weibo trending title model output");
}

export function extractWeiboTrendingTitleSuffix(source: string): string {
  const encoded = source.match(/^- \*\*AI 标题\*\*：(.+)$/m)?.[1] || "";
  return validateWeiboTrendingTitleSuffix(decodeMarkdownBlock(encoded), "Weibo trending source AI title");
}

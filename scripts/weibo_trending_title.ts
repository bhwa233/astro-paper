import { compact } from "./blog_common.ts";
import { decodeMarkdownBlock, hasChinese, parseModelJsonObject } from "./compose_common.ts";

export const WEIBO_TRENDING_TITLE_SUFFIX_MAX_LENGTH = 40;
export const WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH = 20;

export type WeiboTrendingTitles = {
  titleSuffix: string;
  wechatTitle: string;
};

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

function wechatTitleSuffix(topicCount: number): string {
  if (!Number.isInteger(topicCount) || topicCount < 1 || topicCount > 10) {
    throw new Error(`invalid Weibo trending WeChat topic count: ${topicCount}`);
  }
  return `等${topicCount === 10 ? "十" : topicCount}条热搜`;
}

export function validateWeiboTrendingWechatTitle(
  value: unknown,
  topicCount: number,
  label = "Weibo trending WeChat title",
): string {
  const raw = typeof value === "string" ? value : "";
  const title = compact(raw);
  if (!title || !hasChinese(title)) throw new Error(`${label} must contain Chinese text`);
  if (/\r|\n/.test(raw)) throw new Error(`${label} must stay on one line`);
  if ([...title].length > WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH) {
    throw new Error(`${label} exceeds ${WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH} characters`);
  }
  const suffix = wechatTitleSuffix(topicCount);
  if (!title.endsWith(suffix) || title === suffix) throw new Error(`${label} must use a core event followed by ${suffix}`);
  if (/\d{4}-\d{2}-\d{2}|[｜|]/.test(title)) throw new Error(`${label} must not include a date or separator`);
  if (/^[#>*-]\s|```|\[[^\]]+\]\([^)]+\)/.test(title)) throw new Error(`${label} must be plain text`);
  return title;
}

export function parseWeiboTrendingTitleResponse(raw: string, wechatTopicCount: number): WeiboTrendingTitles {
  const payload = parseModelJsonObject(raw, "Weibo trending title");
  return {
    titleSuffix: validateWeiboTrendingTitleSuffix(payload.title_suffix, "Weibo trending title model output"),
    wechatTitle: validateWeiboTrendingWechatTitle(payload.wechat_title, wechatTopicCount, "Weibo trending WeChat title model output"),
  };
}

export function extractWeiboTrendingTitleSuffix(source: string): string {
  const encoded = source.match(/^- \*\*AI 标题\*\*：(.+)$/m)?.[1] || "";
  return validateWeiboTrendingTitleSuffix(decodeMarkdownBlock(encoded), "Weibo trending source AI title");
}

export function extractWeiboTrendingWechatTitle(source: string, wechatTopicCount: number): string {
  const encoded = source.match(/^- \*\*AI 微信标题\*\*：(.+)$/m)?.[1] || "";
  return validateWeiboTrendingWechatTitle(decodeMarkdownBlock(encoded), wechatTopicCount, "Weibo trending source AI WeChat title");
}

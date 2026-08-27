import { compact } from "./blog_common.ts";
import { decodeMarkdownBlock, hasChinese, parseModelJsonObject } from "./compose_common.ts";

export const WEIBO_TRENDING_TITLE_SUFFIX_MAX_LENGTH = 40;
export const WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH = 20;
export const WEIBO_TRENDING_WECHAT_DESCRIPTION_MIN_LENGTH = 60;
export const WEIBO_TRENDING_WECHAT_DESCRIPTION_MAX_LENGTH = 120;

export type WeiboTrendingTitles = {
  titleSuffix: string;
  wechatTitle: string;
  wechatDescription: string;
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

export function validateWeiboTrendingWechatDescription(
  value: unknown,
  label = "Weibo trending WeChat description",
): string {
  const raw = typeof value === "string" ? value : "";
  const description = compact(raw);
  if (!description || !hasChinese(description)) throw new Error(`${label} must contain Chinese text`);
  if (/\r|\n/.test(raw)) throw new Error(`${label} must stay on one line`);
  const length = [...description].length;
  if (
    length < WEIBO_TRENDING_WECHAT_DESCRIPTION_MIN_LENGTH ||
    length > WEIBO_TRENDING_WECHAT_DESCRIPTION_MAX_LENGTH
  ) {
    throw new Error(
      `${label} must contain ${WEIBO_TRENDING_WECHAT_DESCRIPTION_MIN_LENGTH}-${WEIBO_TRENDING_WECHAT_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }
  if (/^[#>*-]\s|```|\[[^\]]+\]\([^)]+\)/.test(description)) throw new Error(`${label} must be plain text`);
  if (/…{1,2}等\s*\d+\s*个话题/.test(description)) throw new Error(`${label} must summarize topics instead of listing titles`);
  return description;
}

export function parseWeiboTrendingTitleResponse(raw: string, wechatTopicCount: number): WeiboTrendingTitles {
  const payload = parseModelJsonObject(raw, "Weibo trending title");
  return {
    titleSuffix: validateWeiboTrendingTitleSuffix(payload.title_suffix, "Weibo trending title model output"),
    wechatTitle: validateWeiboTrendingWechatTitle(payload.wechat_title, wechatTopicCount, "Weibo trending WeChat title model output"),
    wechatDescription: validateWeiboTrendingWechatDescription(payload.wechat_description, "Weibo trending WeChat description model output"),
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

export function extractWeiboTrendingWechatDescription(source: string): string {
  const encoded = source.match(/^- \*\*AI 微信话题总结\*\*：(.+)$/m)?.[1] || "";
  return validateWeiboTrendingWechatDescription(decodeMarkdownBlock(encoded), "Weibo trending source AI WeChat description");
}

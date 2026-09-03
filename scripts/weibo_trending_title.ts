import { compact } from "./blog_common.ts";
import { decodeMarkdownBlock, hasChinese, parseModelJsonObject } from "./compose_common.ts";

export const WEIBO_TRENDING_TITLE_SUFFIX_MAX_LENGTH = 40;
// 和博客标题一样，前缀由代码持有，模型只写后面的核心事件：前缀写不错，也不必把
// 这四个字复制进 prompt。改栏目名改这一处。
export const WEIBO_TRENDING_WECHAT_TITLE_PREFIX = "今日热点：";
export const WEIBO_TRENDING_WECHAT_TITLE_CORE_MAX_LENGTH = 19;
export const WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH = 24;
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

/** 校验模型写的核心事件短语，也就是固定前缀后面的那半句。 */
export function validateWeiboTrendingWechatTitleCore(value: unknown, label = "Weibo trending WeChat title core"): string {
  const raw = typeof value === "string" ? value : "";
  const core = compact(raw);
  if (!core || !hasChinese(core)) throw new Error(`${label} must contain Chinese text`);
  if (/\r|\n/.test(raw)) throw new Error(`${label} must stay on one line`);
  if ([...core].length > WEIBO_TRENDING_WECHAT_TITLE_CORE_MAX_LENGTH) {
    throw new Error(`${label} exceeds ${WEIBO_TRENDING_WECHAT_TITLE_CORE_MAX_LENGTH} characters`);
  }
  if (/热搜|\d{4}-\d{2}-\d{2}|[｜|]/.test(core)) throw new Error(`${label} must not repeat the fixed title prefix`);
  if (/^[#>*-]\s|```|\[[^\]]+\]\([^)]+\)/.test(core)) throw new Error(`${label} must be plain text`);
  return core;
}

export function weiboTrendingWechatTitle(core: string): string {
  return `${WEIBO_TRENDING_WECHAT_TITLE_PREFIX}${core}`;
}

/** 校验拼好的成品标题，也就是最终写进微信草稿的那一串。 */
export function validateWeiboTrendingWechatTitle(value: unknown, label = "Weibo trending WeChat title"): string {
  const raw = typeof value === "string" ? value : "";
  const title = compact(raw);
  if (/\r|\n/.test(raw)) throw new Error(`${label} must stay on one line`);
  if (!title.startsWith(WEIBO_TRENDING_WECHAT_TITLE_PREFIX)) {
    throw new Error(`${label} must start with ${WEIBO_TRENDING_WECHAT_TITLE_PREFIX}`);
  }
  if ([...title].length > WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH) {
    throw new Error(`${label} exceeds ${WEIBO_TRENDING_WECHAT_TITLE_MAX_LENGTH} characters`);
  }
  validateWeiboTrendingWechatTitleCore(title.slice(WEIBO_TRENDING_WECHAT_TITLE_PREFIX.length), label);
  return title;
}

export function validateWeiboTrendingWechatDescription(value: unknown, label = "Weibo trending WeChat description"): string {
  const raw = typeof value === "string" ? value : "";
  const description = compact(raw);
  if (!description || !hasChinese(description)) throw new Error(`${label} must contain Chinese text`);
  if (/\r|\n/.test(raw)) throw new Error(`${label} must stay on one line`);
  const length = [...description].length;
  if (length < WEIBO_TRENDING_WECHAT_DESCRIPTION_MIN_LENGTH || length > WEIBO_TRENDING_WECHAT_DESCRIPTION_MAX_LENGTH) {
    throw new Error(`${label} must contain ${WEIBO_TRENDING_WECHAT_DESCRIPTION_MIN_LENGTH}-${WEIBO_TRENDING_WECHAT_DESCRIPTION_MAX_LENGTH} characters`);
  }
  if (/^[#>*-]\s|```|\[[^\]]+\]\([^)]+\)/.test(description)) throw new Error(`${label} must be plain text`);
  if (/…{1,2}等\s*\d+\s*个话题/.test(description)) throw new Error(`${label} must summarize topics instead of listing titles`);
  return description;
}

export function parseWeiboTrendingTitleResponse(raw: string): WeiboTrendingTitles {
  const payload = parseModelJsonObject(raw, "Weibo trending title");
  // 模型只写核心事件；前缀在这里拼上，之后每一层看到的都是成品标题。
  const core = validateWeiboTrendingWechatTitleCore(payload.wechat_title, "Weibo trending WeChat title model output");
  return {
    titleSuffix: validateWeiboTrendingTitleSuffix(payload.title_suffix, "Weibo trending title model output"),
    wechatTitle: weiboTrendingWechatTitle(core),
    wechatDescription: validateWeiboTrendingWechatDescription(payload.wechat_description, "Weibo trending WeChat description model output"),
  };
}

export function extractWeiboTrendingTitleSuffix(source: string): string {
  const encoded = source.match(/^- \*\*AI 标题\*\*：(.+)$/m)?.[1] || "";
  return validateWeiboTrendingTitleSuffix(decodeMarkdownBlock(encoded), "Weibo trending source AI title");
}

export function extractWeiboTrendingWechatTitle(source: string): string {
  const encoded = source.match(/^- \*\*AI 微信标题\*\*：(.+)$/m)?.[1] || "";
  return validateWeiboTrendingWechatTitle(decodeMarkdownBlock(encoded), "Weibo trending source AI WeChat title");
}

export function extractWeiboTrendingWechatDescription(source: string): string {
  const encoded = source.match(/^- \*\*AI 微信话题总结\*\*：(.+)$/m)?.[1] || "";
  return validateWeiboTrendingWechatDescription(decodeMarkdownBlock(encoded), "Weibo trending source AI WeChat description");
}

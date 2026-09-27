/**
 * Reddit Life 每日发布数量。视频与公众号图文可独立调整，但仍复用同一次 AI 选题。
 * 选题数取两者最大值，避免任一发布端因内容不足再次请求模型。
 *
 * 2026-09-27 起实际数量来自 SparkHub 的 Reddit 问答配置（scripts/reddit_life_config.ts），
 * 这里的值只是读不到配置时的默认值，也是解析旧归档时的缺省口径。
 */
export const REDDIT_LIFE_DAILY_VIDEO_COUNT = 1;
export const REDDIT_LIFE_DAILY_NEWSPIC_COUNT = 1;
export const REDDIT_LIFE_DAILY_SELECTION_COUNT = Math.max(
  REDDIT_LIFE_DAILY_VIDEO_COUNT,
  REDDIT_LIFE_DAILY_NEWSPIC_COUNT
);

/**
 * 每日 Reddit Life 公众号文章草稿（一篇收录五题）。2026-09-26 起停发，只保留图文草稿：
 * reddit-life-wechat 仍然给当天全部候选打分并推进 SparkHub 素材池，但不再生成文章稿和封面，
 * 也就没有草稿要同步。开关在 SparkHub 配置的 wechat_article_enabled，这里是读不到配置时的默认值。
 */
export const REDDIT_LIFE_WECHAT_ARTICLE_ENABLED = false;

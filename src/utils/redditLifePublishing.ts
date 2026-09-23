/**
 * Reddit Life 每日发布数量。视频与公众号图文可独立调整，但仍复用同一次 AI 选题。
 * 选题数取两者最大值，避免任一发布端因内容不足再次请求模型。
 */
export const REDDIT_LIFE_DAILY_VIDEO_COUNT = 2;
export const REDDIT_LIFE_DAILY_NEWSPIC_COUNT = 2;
export const REDDIT_LIFE_DAILY_SELECTION_COUNT = Math.max(
  REDDIT_LIFE_DAILY_VIDEO_COUNT,
  REDDIT_LIFE_DAILY_NEWSPIC_COUNT
);

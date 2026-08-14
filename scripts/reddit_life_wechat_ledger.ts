// Reddit 人生讨论草稿的跨日去重：通用账本持有读写与损坏即失败的规则；这里仅定义 post ID 身份。
import path from "node:path";
import { compact, repoRoot } from "./blog_common.ts";
import { type RecommendationLedgerSpec, appendRecommendations, loadRecommendationKeys } from "./recommendation_ledger.ts";

export type RedditLifeRecommendation = { key: string; postId: string; title: string };

export const REDDIT_LIFE_WECHAT_LEDGER_REL_PATH = "data/reddit-life-wechat/recommended.json";

export function redditLifeWechatLedgerPath(): string {
  return process.env.REDDIT_LIFE_WECHAT_LEDGER_FILE || path.join(repoRoot(), REDDIT_LIFE_WECHAT_LEDGER_REL_PATH);
}

export function redditPostRecommendationKey(postId: string): string {
  const normalized = compact(postId).toLowerCase();
  if (!/^[a-z0-9]{5,12}$/.test(normalized)) throw new Error(`invalid Reddit post identifier: ${postId || "empty"}`);
  return `reddit:${normalized}`;
}

const SPEC: RecommendationLedgerSpec<RedditLifeRecommendation> = {
  label: "Reddit life WeChat",
  expectedKey: entry => redditPostRecommendationKey(entry.postId),
};

export function loadRedditLifeRecommendationKeys(file = redditLifeWechatLedgerPath(), excludePostPath = ""): Set<string> {
  return loadRecommendationKeys(SPEC, file, excludePostPath);
}

export function appendRedditLifeRecommendations(
  recommendations: RedditLifeRecommendation[],
  meta: { archivedAt: string; postPath: string },
  file = redditLifeWechatLedgerPath(),
): void {
  appendRecommendations(SPEC, recommendations, meta, file);
}

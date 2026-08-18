// Reddit 人生讨论草稿的跨日去重：通用账本持有读写与损坏即失败的规则；这里仅定义 post ID 身份。
import path from "node:path";
import { compact, repoRoot } from "./blog_common.ts";
import { type RecommendationLedgerSpec, appendRecommendations, loadRecommendationKeys, loadRecommendations } from "./recommendation_ledger.ts";

// issue 是微信标题里的期号。它记录在条目上而不是按账本条数推算：条数会随清理或过滤规则变动，
// 一旦变动，历史文章的期号就会集体漂移。存量条目没有这个字段，按约定不回填。
export type RedditLifeRecommendation = { key: string; postId: string; title: string; issue?: number };

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

// 期号一次分配、永不重算，因此新号只从已有的最大值往后接：未回填的存量条目算 0，第一篇新稿拿到 #1。
export function nextRedditLifeIssue(file = redditLifeWechatLedgerPath()): number {
  return Math.max(0, ...loadRecommendations(SPEC, file).map(entry => entry.issue || 0)) + 1;
}

export function appendRedditLifeRecommendations(
  recommendations: RedditLifeRecommendation[],
  meta: { archivedAt: string; postPath: string },
  file = redditLifeWechatLedgerPath(),
): void {
  appendRecommendations(SPEC, recommendations, meta, file);
}

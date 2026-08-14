// Reddit 单帖深抓来源客户端。这个模块是新 v1 契约的信任边界，绝不把不完整评论树交给 compose 层。
import { createHash } from "node:crypto";
import { envPositiveInt, fetchJson, sleep } from "./blog_common.ts";
import { REDDIT_CATEGORIES } from "./reddit_top20_compose.ts";

export const REDDIT_POST_DETAIL_CONTRACT = "reddit-post-detail-source.v1";
export const REDDIT_LIFE_SUBREDDITS = REDDIT_CATEGORIES.find(category => category.key === "life")!.subreddits;

export type RedditLifeComment = { id: string; parentId: string | null; score: number | null; text: string; truncated: boolean };
export type RedditLifeEvidence = {
  postId: string;
  status: "ok" | "unavailable";
  subreddit: string;
  title: string;
  body: string;
  score: number;
  numComments: number;
  publishedAt: string;
  permalink: string;
  topComments: RedditLifeComment[];
  replies: RedditLifeComment[];
  fetchedAt: string;
  sourceSha256: string;
  policySha256: string;
  policy: { topLevelCommentLimit: number; directReplyLimit: number; maxCommentDepth: 2; maxCommentChars: number; maxCommentCharsPerPost: number };
};

type Job = { id?: unknown; archive_date?: unknown; state?: unknown; result?: unknown; error_code?: unknown; error_message?: unknown; retryable?: unknown };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Reddit post detail API returned invalid ${label}`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, allowNull = false): number | null {
  if (allowNull && value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`Reddit post detail API has invalid ${label}: ${String(value)}`);
  return value;
}

function sha(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`Reddit post detail API has invalid ${label}`);
  return value;
}

function parseComment(value: unknown, topLevelIds: Set<string>, isReply: boolean): RedditLifeComment {
  const item = record(value, "comment");
  const id = typeof item.id === "string" ? item.id : "";
  const parentId = item.parent_id === null || typeof item.parent_id === "string" ? item.parent_id : undefined;
  if (!/^[a-z0-9_]+$/i.test(id) || typeof item.text !== "string" || typeof item.truncated !== "boolean") throw new Error("Reddit post detail API has malformed comment evidence");
  if (isReply ? !parentId || !topLevelIds.has(parentId) : parentId !== null) throw new Error("Reddit post detail API has an invalid comment parent relationship");
  return { id, parentId: parentId ?? null, score: integer(item.score, "comment score", true), text: item.text, truncated: item.truncated };
}

function parsePolicy(value: unknown, digest: unknown) {
  const policy = record(value, "policy");
  const fields = ["top_level_comment_limit", "direct_reply_limit", "detail_comment_limit", "max_post_body_chars", "max_comment_chars", "max_comment_chars_per_post"] as const;
  for (const field of fields) integer(policy[field], `policy ${field}`);
  if (policy.version !== "reddit-source-policy.v2" || policy.max_comment_depth !== 2 || policy.requires_top_level_comment !== true) {
    throw new Error("Reddit post detail API returned an unsupported policy");
  }
  const normalized = Object.fromEntries(Object.keys(policy).sort().map(key => [key, policy[key]]));
  if (sha(digest, "policy_sha256") !== createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex")) {
    throw new Error("Reddit post detail API policy_sha256 does not match policy");
  }
  return {
    topLevelCommentLimit: policy.top_level_comment_limit as number,
    directReplyLimit: policy.direct_reply_limit as number,
    maxCommentDepth: 2 as const,
    maxCommentChars: policy.max_comment_chars as number,
    maxCommentCharsPerPost: policy.max_comment_chars_per_post as number,
  };
}

export function parseRedditPostDetailResponse(payload: unknown, archiveDate: string, requestedPostIds: string[]): RedditLifeEvidence[] {
  const response = record(payload, "response");
  if (response.contract_version !== REDDIT_POST_DETAIL_CONTRACT || response.archive_date !== archiveDate || typeof response.fetched_at !== "string") {
    throw new Error("Reddit post detail API returned an unsupported or stale contract");
  }
  const source = typeof response.source === "string" ? response.source : "";
  if (sha(response.source_sha256, "source_sha256") !== createHash("sha256").update(source, "utf8").digest("hex")) throw new Error("Reddit post detail API source_sha256 does not match source");
  const policy = parsePolicy(response.policy, response.policy_sha256);
  if (!Array.isArray(response.posts) || response.posts.length !== requestedPostIds.length || integer(response.post_count, "post_count") !== requestedPostIds.length) {
    throw new Error("Reddit post detail API returned an unexpected post count");
  }
  const requested = new Set(requestedPostIds.map(id => id.toLowerCase()));
  const seen = new Set<string>();
  const evidence = response.posts.map(raw => {
    const post = record(raw, "post evidence");
    const postId = typeof post.post_id === "string" ? post.post_id.toLowerCase() : "";
    const status: "ok" | "unavailable" = post.status === "ok" ? "ok" : post.status === "unavailable" ? "unavailable" : (() => {
      throw new Error("Reddit post detail API returned an invalid post status or identity");
    })();
    if (!requested.has(postId) || seen.has(postId)) throw new Error("Reddit post detail API returned an invalid post status or identity");
    seen.add(postId);
    if (status === "unavailable") return { postId, status, subreddit: "", title: "", body: "", score: 0, numComments: 0, publishedAt: "", permalink: "", topComments: [], replies: [], fetchedAt: response.fetched_at as string, sourceSha256: response.source_sha256 as string, policySha256: response.policy_sha256 as string, policy };
    const subreddit = typeof post.subreddit === "string" ? post.subreddit : "";
    const permalink = typeof post.permalink === "string" ? post.permalink : "";
    if (!REDDIT_LIFE_SUBREDDITS.some(item => item.toLowerCase() === subreddit.toLowerCase()) || !new RegExp(`/comments/${postId}(?:/|$)`, "i").test(permalink)) {
      throw new Error("Reddit post detail API returned a post outside the life contract");
    }
    if (typeof post.title !== "string" || typeof post.body !== "string" || typeof post.published_at !== "string") throw new Error("Reddit post detail API has malformed post facts");
    const topRaw = Array.isArray(post.top_comments) ? post.top_comments : [];
    const topComments = topRaw.map(item => parseComment(item, new Set(), false));
    const topIds = new Set(topComments.map(item => item.id));
    const repliesRaw = Array.isArray(post.replies) ? post.replies : [];
    const replies = repliesRaw.map(item => parseComment(item, topIds, true));
    if (topComments.length > policy.topLevelCommentLimit || replies.some(reply => replies.filter(item => item.parentId === reply.parentId).length > policy.directReplyLimit)) {
      throw new Error("Reddit post detail API exceeded comment policy limits");
    }
    const stats = record(post.stats, "post statistics");
    if (integer(stats.top_level_selected, "stats top_level_selected") !== topComments.length || integer(stats.replies_selected, "stats replies_selected") !== replies.length) {
      throw new Error("Reddit post detail API statistics do not match evidence");
    }
    return {
      postId, status, subreddit, title: post.title, body: post.body, score: integer(post.score, "post score")!, numComments: integer(post.num_comments, "post num_comments")!, publishedAt: post.published_at,
      permalink, topComments, replies, fetchedAt: response.fetched_at as string, sourceSha256: response.source_sha256 as string, policySha256: response.policy_sha256 as string, policy,
    };
  });
  if (integer(response.ok_count, "ok_count") !== evidence.filter(item => item.status === "ok").length) throw new Error("Reddit post detail API returned an inconsistent ok_count");
  return evidence;
}

export async function fetchRedditPostDetailsFromApi(archiveDate: string, postIds: string[]): Promise<RedditLifeEvidence[]> {
  if (!postIds.length || postIds.length > 3) throw new Error("Reddit life WeChat requires one to three post IDs");
  const baseUrl = (process.env.REDDIT_SOURCE_API_URL || "").replace(/\/+$/, "");
  const token = process.env.REDDIT_SOURCE_API_TOKEN || "";
  if (!baseUrl || !token) throw new Error("REDDIT_SOURCE_API_URL and REDDIT_SOURCE_API_TOKEN are required for Reddit life WeChat generation");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const initial = await fetchJson<Job>(`${baseUrl}/v1/reddit/post-detail-source/jobs`, {
    method: "POST", headers, body: JSON.stringify({ archive_date: archiveDate, posts: postIds, allowed_subreddits: REDDIT_LIFE_SUBREDDITS }), retries: 2,
  });
  if (typeof initial.id !== "string" || initial.archive_date !== archiveDate) throw new Error("Reddit post detail API returned an invalid job submission");
  const deadline = Date.now() + envPositiveInt("REDDIT_SOURCE_POLL_TIMEOUT_MS", 1_500_000);
  const interval = envPositiveInt("REDDIT_SOURCE_POLL_INTERVAL_MS", 2_000);
  for (;;) {
    const job = await fetchJson<Job>(`${baseUrl}/v1/reddit/post-detail-source/jobs/${encodeURIComponent(initial.id)}`, { headers, retries: 2 });
    if (job.state === "ready") return parseRedditPostDetailResponse(job.result, archiveDate, postIds);
    if (job.state === "failed") throw new Error(`Reddit post detail job failed: ${String(job.error_code || "unknown")}: ${String(job.error_message || "")}`);
    if (job.state !== "queued" && job.state !== "running") throw new Error("Reddit post detail API returned an unknown job state");
    if (Date.now() >= deadline) throw new Error("Reddit post detail job polling timed out");
    await sleep(interval);
  }
}

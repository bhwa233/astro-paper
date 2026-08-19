// Reddit 热搜的来源服务客户端：全站榜单（同步 GET）与选中帖的评论深挖（异步作业）。
// 和 reddit_source_api.ts 打的是同一个服务、用同一对 secret，只是走另外两个端点；
// 鉴权与作业轮询共用 reddit_service_client.ts，本文件只负责这两个端点自己的契约校验。
import { createHash } from "node:crypto";
import { fetchJson, writeStdout } from "./blog_common.ts";
import { type RedditJobStatus, pollRedditJob, redditServiceEndpoint } from "./reddit_service_client.ts";

// 服务端 RedditPostDetailRequest.posts 的 max_length。一次作业最多深挖十帖，
// 这个数同时也就是一篇热搜稿的选题上限。
export const REDDIT_TRENDING_MAX_DETAIL_POSTS = 10;

export type RedditTrendingItem = {
  rank: number;
  id: string;
  subreddit: string;
  title: string;
  score: number;
  numComments: number;
  permalink: string;
  url: string;
  publishedAt: string;
};

export type RedditTrendingBoard = {
  subreddit: string;
  sort: string;
  timeWindow: string;
  limit: number;
  fetchedAt: string;
  items: RedditTrendingItem[];
};

export type RedditEvidenceComment = {
  id: string;
  parentId: string;
  score: number | null;
  text: string;
};

export type RedditPostEvidence = {
  postId: string;
  status: "ok" | "unavailable" | "failed" | "rejected";
  errorCode: string;
  subreddit: string;
  title: string;
  body: string;
  score: number | null;
  numComments: number | null;
  publishedAt: string;
  permalink: string;
  topComments: RedditEvidenceComment[];
  replies: RedditEvidenceComment[];
};

function requireString(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} has an invalid ${field}`);
  return value.trim();
}

function requireInteger(record: Record<string, unknown>, field: string, label: string, min = 0): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new Error(`${label} has an invalid ${field}: ${String(value)}`);
  }
  return value;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as Record<string, unknown>;
}

export function parseRedditTrendingBoard(payload: unknown): RedditTrendingBoard {
  const record = asRecord(payload, "Reddit trending API response");
  const items = record.items;
  if (!Array.isArray(items)) throw new Error("Reddit trending API returned invalid items");
  // item_count 是服务端自己数的，和数组长度对不上说明响应在路上被截过。
  const itemCount = requireInteger(record, "item_count", "Reddit trending API");
  if (itemCount !== items.length) {
    throw new Error(`Reddit trending API item_count ${itemCount} does not match ${items.length} items`);
  }
  return {
    subreddit: requireString(record, "subreddit", "Reddit trending API"),
    sort: requireString(record, "sort", "Reddit trending API"),
    // time_window 只在 top / controversial 下非空；热搜固定用 top，所以这里要求它必须有值。
    timeWindow: requireString(record, "time_window", "Reddit trending API"),
    limit: requireInteger(record, "limit", "Reddit trending API", 1),
    fetchedAt: requireString(record, "fetched_at", "Reddit trending API"),
    items: items.map((raw, index) => {
      const label = `Reddit trending API item ${index + 1}`;
      const item = asRecord(raw, label);
      const rank = requireInteger(item, "rank", label, 1);
      if (rank !== index + 1) throw new Error(`${label} has out-of-order rank ${rank}`);
      const url = requireString(item, "url", label);
      if (!url.startsWith("https://www.reddit.com/")) throw new Error(`${label} has a non-Reddit url: ${url}`);
      return {
        rank,
        id: requireString(item, "id", label),
        subreddit: requireString(item, "subreddit", label),
        title: requireString(item, "title", label),
        score: requireInteger(item, "score", label),
        numComments: requireInteger(item, "num_comments", label),
        permalink: requireString(item, "permalink", label),
        url,
        publishedAt: typeof item.published_at === "string" ? item.published_at : "",
      };
    }),
  };
}

/** 取一页全站榜单。热搜固定 top + t=day：hot 是实时流，同一天重跑会换一份榜，按天归档就不可复现。 */
export async function fetchRedditTrendingBoard({
  subreddit = "popular",
  sort = "top",
  timeWindow = "day",
  limit = 100,
}: { subreddit?: string; sort?: string; timeWindow?: string; limit?: number } = {}): Promise<RedditTrendingBoard> {
  const endpoint = redditServiceEndpoint("reddit-trending generation");
  const query = new URLSearchParams({ subreddit, sort, t: timeWindow, limit: String(limit) });
  const board = parseRedditTrendingBoard(await fetchJson(`${endpoint.baseUrl}/v1/reddit/trending?${query}`, { method: "GET", ...endpoint.request }));
  writeStdout(`[reddit-trending] board r/${board.subreddit}/${board.sort} t=${board.timeWindow} items=${board.items.length} fetched_at=${board.fetchedAt}\n`);
  return board;
}

function parseEvidenceComments(value: unknown, label: string): RedditEvidenceComment[] {
  if (!Array.isArray(value)) throw new Error(`${label} has invalid comments`);
  return value.map((raw, index) => {
    const comment = asRecord(raw, `${label} comment ${index + 1}`);
    const score = comment.score;
    if (score !== null && (typeof score !== "number" || !Number.isInteger(score))) {
      throw new Error(`${label} comment ${index + 1} has an invalid score`);
    }
    return {
      id: typeof comment.id === "string" ? comment.id : "",
      parentId: typeof comment.parent_id === "string" ? comment.parent_id : "",
      score: score as number | null,
      text: requireString(comment, "text", `${label} comment ${index + 1}`),
    };
  });
}

export function parseRedditPostDetailResult(payload: unknown, date: string): RedditPostEvidence[] {
  const record = asRecord(payload, "Reddit post detail API result");
  if (record.contract_version !== "reddit-post-detail-source.v1") {
    throw new Error(`Reddit post detail API returned an unsupported contract: ${String(record.contract_version)}`);
  }
  if (record.archive_date !== date) {
    throw new Error(`Reddit post detail API archive date ${String(record.archive_date)} does not match requested date ${date}`);
  }
  // source 是服务端渲染的证据 Markdown，正文由本地按 JSON 重组，但 sha 仍要复核：
  // 对不上说明这份响应在传输中被改过，整份证据就都不可信了。
  //
  // 必须对原样的字符串取哈希，不能先 trim：服务端的 source 以换行结尾，摘掉它算出来的
  // 摘要永远对不上，于是每一份真实响应都会被判成篡改。
  const source = record.source;
  if (typeof source !== "string" || !source.trim()) throw new Error("Reddit post detail API returned an invalid source payload");
  const sourceHash = createHash("sha256").update(source, "utf8").digest("hex");
  if (record.source_sha256 !== sourceHash) throw new Error("Reddit post detail API source_sha256 does not match source content");
  const posts = record.posts;
  if (!Array.isArray(posts) || !posts.length) throw new Error("Reddit post detail API returned no posts");
  return posts.map((raw, index) => {
    const label = `Reddit post detail API post ${index + 1}`;
    const post = asRecord(raw, label);
    const status = post.status;
    if (status !== "ok" && status !== "unavailable" && status !== "failed" && status !== "rejected") {
      throw new Error(`${label} has an invalid status: ${String(status)}`);
    }
    const score = post.score;
    const numComments = post.num_comments;
    return {
      postId: requireString(post, "post_id", label),
      status,
      errorCode: typeof post.error_code === "string" ? post.error_code : "",
      subreddit: typeof post.subreddit === "string" ? post.subreddit : "",
      title: typeof post.title === "string" ? post.title : "",
      body: typeof post.body === "string" ? post.body : "",
      score: typeof score === "number" && Number.isInteger(score) ? score : null,
      numComments: typeof numComments === "number" && Number.isInteger(numComments) ? numComments : null,
      publishedAt: typeof post.published_at === "string" ? post.published_at : "",
      permalink: typeof post.permalink === "string" ? post.permalink : "",
      topComments: status === "ok" ? parseEvidenceComments(post.top_comments, label) : [],
      replies: status === "ok" ? parseEvidenceComments(post.replies, label) : [],
    };
  });
}

type JobResponse = { id?: unknown; state?: unknown; result?: unknown; error_code?: unknown; error_message?: unknown; progress?: unknown };

export function parseRedditPostDetailJobResponse(payload: unknown): RedditJobStatus<unknown> {
  const record = asRecord(payload, "Reddit post detail job response") as JobResponse;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const state = record.state;
  if (!id) throw new Error("Reddit post detail job response is missing an id");
  if (state !== "queued" && state !== "running" && state !== "ready" && state !== "failed") {
    throw new Error(`Reddit post detail job ${id} returned an invalid state: ${String(state)}`);
  }
  const progress = record.progress && typeof record.progress === "object" ? (record.progress as Record<string, unknown>) : null;
  const completed = progress?.details_completed;
  const total = progress?.details_total;
  const progressSummary = typeof completed === "number" && typeof total === "number" ? ` details=${completed}/${total}` : "";
  const code = typeof record.error_code === "string" ? record.error_code : "unknown";
  const message = typeof record.error_message === "string" ? record.error_message : "no error message";
  return { id, state, result: record.result ?? null, error: `${code}: ${message}`, progress: progressSummary };
}

const REDDIT_POST_DETAIL_JOB_PATH = "/v1/reddit/post-detail-source/jobs";

/** 深挖选中帖的两级评论。返回逐帖证据；单帖失败由 status 记下来，不会带走整批。 */
export async function fetchRedditPostDetail(date: string, urls: string[]): Promise<RedditPostEvidence[]> {
  if (!urls.length) throw new Error("Reddit post detail requires at least one post");
  if (urls.length > REDDIT_TRENDING_MAX_DETAIL_POSTS) {
    throw new Error(`Reddit post detail accepts at most ${REDDIT_TRENDING_MAX_DETAIL_POSTS} posts, got ${urls.length}`);
  }
  const endpoint = redditServiceEndpoint("reddit-trending generation");
  const submitted = await fetchJson(`${endpoint.baseUrl}${REDDIT_POST_DETAIL_JOB_PATH}`, {
    method: "POST",
    body: JSON.stringify({ archive_date: date, posts: urls }),
    ...endpoint.request,
  });
  const result = await pollRedditJob<unknown>({
    endpoint,
    jobPath: REDDIT_POST_DETAIL_JOB_PATH,
    submitted,
    label: "Reddit post detail",
    logPrefix: "[reddit-trending] detail",
    parseStatus: parseRedditPostDetailJobResponse,
  });
  return parseRedditPostDetailResult(result, date);
}

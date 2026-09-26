// SparkHub 的 Reddit life 素材池接口（dashboard token 鉴权）。入库、领取、确认三条管线共用这一份
// 地址、令牌和超时约定，免得各写各的。接口定义在 SparkHub 的
// apps/api/src/linkdisk/contracts.ts（`/api/linkdisk/dashboard/decks/reddit-life/*`）。
import { envPositiveInt, fetchJson } from "./blog_common.ts";

const BASE_PATH = "/api/linkdisk/dashboard/decks/reddit-life";

export type SparkhubRedditLifePost = {
  id: number;
  post_id: string;
  archive_date: string;
  subreddit: string;
  title: string;
  permalink: string | null;
  effective_score: number;
  reply_count: number;
  content_md: string;
};

export type SparkhubAssets = {
  newspic_cards?: string[];
  newspic_release?: string;
  video?: string;
  cover?: string;
};

/** 两个环境变量都在才算启用；缺一个就返回 null，由调用方决定跳过还是走本地兜底。 */
export function sparkhubEndpoint(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.SPARKHUB_API_URL?.trim().replace(/\/+$/, "");
  const token = process.env.SPARKHUB_DASHBOARD_TOKEN?.trim();
  return baseUrl && token ? { baseUrl, token } : null;
}

async function call<T>(method: "GET" | "POST", route: string, body?: unknown): Promise<T> {
  const endpoint = sparkhubEndpoint();
  if (!endpoint) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");
  const result = await fetchJson<{ success: boolean; data: T; message?: string }>(`${endpoint.baseUrl}${BASE_PATH}${route}`, {
    method,
    headers: { Authorization: `Bearer ${endpoint.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs: envPositiveInt("SPARKHUB_REQUEST_TIMEOUT_MS", 30_000),
    retries: 2,
  });
  if (!result.success) throw new Error(`SparkHub ${route} failed: ${result.message || "unknown error"}`);
  return result.data;
}

export function ingestRedditLifeDay(payload: unknown): Promise<{ archive_date: string; received: number }> {
  return call("POST", "/ingest", payload);
}

/** 领取未使用、回答数达标里分最高的 limit 条，SparkHub 把它们记为 reserved（24 小时未确认自动退回）。 */
export function claimRedditLifePosts(limit: number, minReplies: number): Promise<SparkhubRedditLifePost[]> {
  return call("POST", "/claim", { limit, min_replies: minReplies });
}

/**
 * 草稿建好后标记已用。领取来的按池 id，本地兜底选出的按 Reddit postId；
 * 同一 syncId 重复确认是安全的。platform 的状态同时记为 draft，externalId 为草稿 media_id。
 */
export function confirmRedditLifePosts(input: {
  ids?: number[];
  post_ids?: string[];
  sync_id: string;
  media_id?: string | null;
  platform?: "douyin" | "bilibili" | "wechat_mp" | "wechat_channels";
  assets?: SparkhubAssets;
}): Promise<{ ids: number[] }> {
  return call("POST", "/confirm", input);
}

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
  /** 卡片批量里模型和卡片一起写的标题、一句话结论、话题标签；发布的 agent 直接拿来用。 */
  meta?: { title: string; summary: string | null; tags: string[] };
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

export type SparkhubCardBacklog = {
  target: number;
  /** 各个启用的卡片平台（抖音、B 站、视频号）当前 ready 的条数。 */
  ready: Record<string, number>;
  /** 要补卡片的条数：把 ready 最少的那个平台补回 target。 */
  gap: number;
  /** 待用、还没有卡片的帖子，按领取顺序，比 gap 多几条备用。 */
  candidates: SparkhubRedditLifePost[];
};

/** 卡片批量的缺口与候选。只读，不领取：帖子留在 pending，公众号草稿链路照样能领。 */
export function getRedditLifeCardBacklog(target: number): Promise<SparkhubCardBacklog> {
  return call("GET", `/cards/backlog?target=${target}`);
}

/** 记下卡片地址和标题、结论、标签，并把抖音、B 站、视频号、公众号设为 ready。已经从别处拿到卡片的帖子，以及 content_sha256 与当前回答对不上（出卡后被刷新过）的帖子会被跳过；同一 Release 重复回报是安全的。 */
export function attachRedditLifeCards(
  items: Array<{ id: number; assets: SparkhubAssets; content_sha256?: string }>
): Promise<{ ids: number[]; skipped: Array<{ id: number; reason: string }> }> {
  return call("POST", "/assets", { items });
}

export type SparkhubRefreshItem = {
  /** 池 id。 */
  post_id: number;
  reddit_post_id: string;
  /** 这一题首次出现的归档日；刷新后的回答写回这一天的 life 文章。 */
  archive_date: string;
  title: string;
  permalink: string | null;
  source: "manual" | "auto";
  status: "pending" | "ok" | "failed" | "rejected";
  error: string | null;
  reply_count_before: number;
  reply_count_after: number | null;
};

export type SparkhubRefreshRun = {
  id: number;
  status: string;
  top_k: number;
  stale_days: number;
  manual_count: number;
  auto_count: number;
  refreshed_count: number;
  failed_count: number;
  rejected_count: number;
  items: SparkhubRefreshItem[];
};

/**
 * 开一次评论刷新任务。SparkHub 按后台配置选出要刷的帖子（人工请求全部 + 按领取顺序的前 K 个待用帖），
 * 每帖记一条 pending 明细连同初次爬取时间一起返回；没有要刷的也会记一次、直接结束。
 */
export function startRedditLifeRefreshRun(input: { github_run_id?: string | null; github_run_url?: string | null }): Promise<SparkhubRefreshRun> {
  return call("POST", "/refresh/runs", input);
}

/** 回报一帖：带 content_md 即替换正文并撤下还没发出去的卡片（帖子已被领走、或卡片已发出去则记为 rejected，不改正文），带 error 记失败。重复回报是安全的。 */
export function reportRedditLifeRefreshItem(
  runId: number,
  postId: number,
  input: { content_md?: string; fetched_at?: string | null; error?: string | null }
): Promise<SparkhubRefreshItem> {
  return call("POST", `/refresh/runs/${runId}/items/${postId}`, input);
}

/** 结束任务；没回报的明细记为失败。error 是整次任务级别的错误。 */
export function finishRedditLifeRefreshRun(runId: number, error: string | null = null): Promise<SparkhubRefreshRun> {
  return call("POST", `/refresh/runs/${runId}/finish`, { error });
}

/** Reddit 问答配置的原始值；字段与校验以 SparkHub 的 apps/api/src/contentpool/config.ts 为准。 */
export function getRedditLifeConfigValues(): Promise<{ values: Record<string, unknown> }> {
  return call("GET", "/config");
}

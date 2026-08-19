// Reddit 来源服务的公共传输层：鉴权端点与异步作业轮询。
//
// 这个服务上挂着三个契约不同的端点（v3 分类源、v1 单帖深挖、v1 全站榜单），它们的作业**结果**
// 各校各的，但「提交一次 → 轮到 ready → 取结果」这套骨架完全一样：同一对 secret、同一组超时旋钮、
// 同一种状态机、同一条 `jobs/{id}` 轮询路径。骨架抄两份的后果不是多二十行，而是超时语义、
// 日志格式和重试次数会随着某一边的改动悄悄分叉。
//
// 这里只管轮询到 ready 为止，拿到的原始结果交回调用方按各自的契约校验——
// 信任边界仍然在各自的客户端文件里，不在这一层。
import { envPositiveInt, fetchJson, sleep, writeStdout, type FetchTextOptions } from "./blog_common.ts";

export type RedditJobState = "queued" | "running" | "ready" | "failed";

export type RedditJobStatus<TResult> = {
  id: string;
  state: RedditJobState;
  result: TResult | null;
  /** 已经拼好的 `code: message`，仅在 failed 时使用。 */
  error: string;
  /** 已经拼好的进度后缀，直接接在日志的 state 后面；无进度时是空串。 */
  progress: string;
};

export type RedditServiceEndpoint = { baseUrl: string; request: FetchTextOptions };

/** 读取服务地址与令牌。purpose 只进报错信息，用来指出是哪条管线缺配置。 */
export function redditServiceEndpoint(purpose: string): RedditServiceEndpoint {
  const baseUrl = process.env.REDDIT_SOURCE_API_URL?.trim().replace(/\/+$/, "");
  const token = process.env.REDDIT_SOURCE_API_TOKEN?.trim();
  if (!baseUrl) throw new Error(`REDDIT_SOURCE_API_URL is required for ${purpose}`);
  if (!token) throw new Error(`REDDIT_SOURCE_API_TOKEN is required for ${purpose}`);
  return {
    baseUrl,
    request: {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeoutMs: envPositiveInt("REDDIT_SOURCE_REQUEST_TIMEOUT_MS", 30_000),
      maxChars: 64_000_000,
      throwOnMaxChars: true,
      retries: 2,
    },
  };
}

export function redditServicePollIntervalMs(): number {
  return envPositiveInt("REDDIT_SOURCE_POLL_INTERVAL_MS", 5_000);
}

export function redditServicePollTimeoutMs(): number {
  return envPositiveInt("REDDIT_SOURCE_POLL_TIMEOUT_MS", 25 * 60_000);
}

/**
 * 轮询一个已提交的作业直到 ready，返回它的原始结果。
 *
 * `jobPath` 必须和提交时用的路径逐字一致——轮询地址是它加上 `/{id}`，写歪了会打到另一个端点。
 * 状态或进度有变化才打一行日志：作业动辄跑几分钟，每次轮询都打会把 Actions 日志淹掉。
 */
export async function pollRedditJob<TResult>({
  endpoint,
  jobPath,
  submitted,
  label,
  logPrefix,
  parseStatus,
}: {
  endpoint: RedditServiceEndpoint;
  jobPath: string;
  /** 提交请求的响应体，作为轮询的第一帧，省掉一次多余的 GET。 */
  submitted: unknown;
  /** 报错信息里的作业名，例如 `Reddit source`。 */
  label: string;
  /** 日志行前缀，例如 `[reddit-source]`。 */
  logPrefix: string;
  parseStatus: (payload: unknown) => RedditJobStatus<TResult>;
}): Promise<TResult> {
  let payload = submitted;
  let previousState = "";
  let previousProgress = "";
  const pollTimeoutMs = redditServicePollTimeoutMs();
  const pollStartedAt = Date.now();

  for (;;) {
    const job = parseStatus(payload);
    if (job.state !== previousState || job.progress !== previousProgress) {
      writeStdout(`${logPrefix} job=${job.id} state=${job.state}${job.progress}\n`);
      previousState = job.state;
      previousProgress = job.progress;
    }
    if (job.state === "failed") throw new Error(`${label} job ${job.id} failed: ${job.error}`);
    if (job.state === "ready") {
      if (!job.result) throw new Error(`${label} job ${job.id} completed without a result`);
      return job.result;
    }
    const remainingMs = pollTimeoutMs - (Date.now() - pollStartedAt);
    if (remainingMs <= 0) {
      throw new Error(`${label} job ${job.id} exceeded client poll timeout after ${pollTimeoutMs}ms; last state=${job.state}${job.progress}`);
    }
    await sleep(Math.min(redditServicePollIntervalMs(), remainingMs));
    payload = await fetchJson(`${endpoint.baseUrl}${jobPath}/${encodeURIComponent(job.id)}`, { method: "GET", ...endpoint.request });
  }
}

// Reddit 分类精选的来源服务客户端：作业提交与轮询、v7 契约校验、按 subreddit 的统计日志。
// 这一层是信任边界——服务端返回的 source 与 policy 都要用它自己给的 sha256 复核，
// 校验不过一律拒收，不做「尽力而为」的降级。
import { createHash } from "node:crypto";
import { fetchJson, writeStdout } from "./blog_common.ts";
import { type RedditJobStatus, pollRedditJob, redditServiceEndpoint } from "./reddit_service_client.ts";
import { type RedditCategory, parseSourceFacts as parseRedditSourceFacts } from "./reddit_top20_compose.ts";

type RedditSourceApiResponse = {
  contract_version?: unknown;
  archive_date?: unknown;
  fetched_at?: unknown;
  item_count?: unknown;
  source_sha256?: unknown;
  source?: unknown;
  policy?: unknown;
  policy_sha256?: unknown;
  subreddit_stats?: unknown;
};

type RedditSourceJobApiResponse = {
  id?: unknown;
  archive_date?: unknown;
  state?: unknown;
  result?: unknown;
  error_code?: unknown;
  error_message?: unknown;
  retryable?: unknown;
  deadline_at?: unknown;
  progress?: unknown;
};

type RedditSubredditStats = {
  subreddit: string;
  category: string;
  listing: number;
  score_pass: number;
  min_score: number;
  shortlisted: number;
  detail_ok: number;
  final: number;
  error_code: string | null;
};

export type RedditSourcePolicy = {
  version: "reddit-source-policy.v1";
  minScore: number;
  listingLimit: number;
  maxDetailCandidates: number;
};

type ParsedRedditSourcePolicy = RedditSourcePolicy & {
  topLevelCommentLimit: number;
  directReplyLimit: number;
  detailCommentLimit: number;
};

export const MAX_REDDIT_SOURCE_ITEMS = 2_000;
function parseRedditSourcePolicy(value: unknown, sha256: unknown): ParsedRedditSourcePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Reddit source API returned an invalid policy");
  const record = value as Record<string, unknown>;
  const integerFields = [
    "min_score",
    "listing_limit",
    "max_detail_candidates",
    "top_level_comment_limit",
    "direct_reply_limit",
    "detail_comment_limit",
    "max_post_body_chars",
    "max_comment_chars",
  ] as const;
  for (const field of integerFields) {
    if (
      typeof record[field] !== "number" ||
      !Number.isInteger(record[field]) ||
      record[field] < (field === "min_score" || field === "direct_reply_limit" ? 0 : 1)
    ) {
      throw new Error(`Reddit source API policy has invalid ${field}: ${String(record[field])}`);
    }
  }
  if (
    record.version !== "reddit-source-policy.v1" ||
    record.listing_sort !== "top" ||
    record.listing_period !== "day" ||
    record.requires_top_level_comment !== true
  ) {
    throw new Error("Reddit source API returned an unsupported policy");
  }
  const normalized = {
    detail_comment_limit: record.detail_comment_limit,
    direct_reply_limit: record.direct_reply_limit,
    listing_limit: record.listing_limit,
    listing_period: record.listing_period,
    listing_sort: record.listing_sort,
    max_comment_chars: record.max_comment_chars,
    max_detail_candidates: record.max_detail_candidates,
    max_post_body_chars: record.max_post_body_chars,
    min_score: record.min_score,
    requires_top_level_comment: record.requires_top_level_comment,
    top_level_comment_limit: record.top_level_comment_limit,
    version: record.version,
  };
  const actualSha256 = createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
  if (sha256 !== actualSha256) throw new Error("Reddit source API policy_sha256 does not match policy");
  return {
    version: "reddit-source-policy.v1",
    minScore: record.min_score as number,
    listingLimit: record.listing_limit as number,
    maxDetailCandidates: record.max_detail_candidates as number,
    topLevelCommentLimit: record.top_level_comment_limit as number,
    directReplyLimit: record.direct_reply_limit as number,
    detailCommentLimit: record.detail_comment_limit as number,
  };
}

function parseRedditSubredditStats(value: unknown, policy: RedditSourcePolicy, category: RedditCategory): RedditSubredditStats[] {
  if (!Array.isArray(value)) throw new Error("Reddit source API returned invalid subreddit_stats");
  const expected = new Map(category.subreddits.map(subreddit => [subreddit.toLowerCase(), category.key] as const));
  const seen = new Set<string>();
  const stats = value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Reddit source API subreddit_stats[${index}] is invalid`);
    const record = raw as Record<string, unknown>;
    const subreddit = typeof record.subreddit === "string" ? record.subreddit.trim() : "";
    const key = subreddit.toLowerCase();
    const category = expected.get(key) || "";
    if (!category || seen.has(key)) {
      throw new Error(`Reddit source API has an invalid subreddit statistic: r/${subreddit || "(missing)"}`);
    }
    seen.add(key);
    const counts = ["listing", "score_pass", "shortlisted", "detail_ok", "final"] as const;
    for (const field of counts) {
      if (typeof record[field] !== "number" || !Number.isInteger(record[field]) || record[field] < 0) {
        throw new Error(`Reddit source API r/${subreddit} has invalid ${field}: ${String(record[field])}`);
      }
    }
    const listing = record.listing as number;
    const scorePass = record.score_pass as number;
    const minScore = record.min_score;
    if (typeof minScore !== "number" || !Number.isInteger(minScore) || minScore !== policy.minScore) {
      throw new Error(`Reddit source API r/${subreddit} has invalid min_score: ${String(minScore)}`);
    }
    const shortlisted = record.shortlisted as number;
    const detailOk = record.detail_ok as number;
    const final = record.final as number;
    if (listing > policy.listingLimit || scorePass > listing || shortlisted > scorePass || detailOk > shortlisted || final !== detailOk) {
      throw new Error(`Reddit source API r/${subreddit} has inconsistent funnel counts`);
    }
    const errorCode = record.error_code;
    if (errorCode !== null && typeof errorCode !== "string") {
      throw new Error(`Reddit source API r/${subreddit} has invalid error_code`);
    }
    return {
      subreddit,
      category,
      listing,
      score_pass: scorePass,
      min_score: minScore,
      shortlisted,
      detail_ok: detailOk,
      final,
      error_code: errorCode,
    };
  });
  if (seen.size !== expected.size || [...expected].some(([subreddit]) => !seen.has(subreddit))) {
    throw new Error(`Reddit source API expected statistics for ${expected.size} fixed subreddits, received ${seen.size}`);
  }
  return stats;
}

export function redditSubredditStatsLogLines(value: unknown, policy: RedditSourcePolicy, category: RedditCategory): string[] {
  return parseRedditSubredditStats(value, policy, category).map(
    stat =>
      `[reddit-source] r/${stat.subreddit} category=${stat.category} listing=${stat.listing} min_score=${stat.min_score} score_pass=${stat.score_pass} shortlisted=${stat.shortlisted} detail_ok=${stat.detail_ok} final=${stat.final}${stat.error_code ? ` error_code=${stat.error_code}` : ""}`
  );
}

export function parseRedditSourceApiResponse(payload: RedditSourceApiResponse, date: string, category: RedditCategory): string {
  if (payload.contract_version !== "reddit-top20-source.v7") {
    throw new Error(`Reddit source API returned an unsupported contract: ${String(payload.contract_version)}`);
  }
  if (payload.archive_date !== date) {
    throw new Error(`Reddit source API archive date ${String(payload.archive_date)} does not match requested date ${date}`);
  }
  if (typeof payload.fetched_at !== "string" || Number.isNaN(Date.parse(payload.fetched_at))) {
    throw new Error("Reddit source API returned an invalid fetched_at timestamp");
  }
  if (typeof payload.source !== "string" || !payload.source.includes("===ARCHIVE_PAYLOAD===")) {
    throw new Error("Reddit source API returned an invalid source payload");
  }
  const sourceHash = createHash("sha256").update(payload.source, "utf8").digest("hex");
  if (payload.source_sha256 !== sourceHash) {
    throw new Error("Reddit source API source_sha256 does not match source content");
  }
  const policy = parseRedditSourcePolicy(payload.policy, payload.policy_sha256);
  const requestedLimits = category.sourceLimits;
  if (
    requestedLimits &&
    (policy.topLevelCommentLimit !== requestedLimits.topLevelCommentLimit ||
      policy.directReplyLimit !== requestedLimits.directReplyLimit ||
      policy.detailCommentLimit !== requestedLimits.detailCommentLimit)
  ) {
    throw new Error(
      `Reddit source API did not apply requested comment limits: ` + `${policy.topLevelCommentLimit}/${policy.directReplyLimit}/${policy.detailCommentLimit}`
    );
  }
  const facts = parseRedditSourceFacts(payload.source);
  const maxItems = category.subreddits.length * policy.listingLimit;
  if (
    typeof payload.item_count !== "number" ||
    !Number.isInteger(payload.item_count) ||
    payload.item_count !== facts.length ||
    facts.length < 1 ||
    facts.length > maxItems
  ) {
    throw new Error(`Reddit source API expected 1-${maxItems} ranked items, received ${String(payload.item_count)}`);
  }
  const expectedSubreddits = new Set(category.subreddits.map(subreddit => subreddit.toLowerCase()));
  const stats = parseRedditSubredditStats(payload.subreddit_stats, policy, category);
  const subredditCounts = new Map<string, number>();
  for (const fact of facts) {
    const subreddit = fact.subreddit.toLowerCase();
    if (!expectedSubreddits.has(subreddit)) {
      throw new Error(`Reddit source API item ${fact.rank} returned unrequested subreddit r/${fact.subreddit}`);
    }
    subredditCounts.set(subreddit, (subredditCounts.get(subreddit) || 0) + 1);
    const publishedAt = Date.parse(fact.publishedAt);
    if (!fact.publishedAt || Number.isNaN(publishedAt)) {
      throw new Error(`Reddit source API item ${fact.rank} has an invalid publication timestamp`);
    }
  }
  for (const stat of stats) {
    if (stat.final !== (subredditCounts.get(stat.subreddit.toLowerCase()) || 0)) {
      throw new Error(`Reddit source API r/${stat.subreddit} final count does not match source items`);
    }
  }
  return payload.source;
}

function parseRedditSourceJobResponse(payload: RedditSourceJobApiResponse, date: string): RedditJobStatus<RedditSourceApiResponse> {
  if (typeof payload.id !== "string" || !payload.id.trim()) {
    throw new Error("Reddit source job response is missing id");
  }
  if (payload.archive_date !== date) {
    throw new Error(`Reddit source job date ${String(payload.archive_date)} does not match requested date ${date}`);
  }
  if (payload.state !== "queued" && payload.state !== "running" && payload.state !== "ready" && payload.state !== "failed") {
    throw new Error(`Reddit source job returned an unsupported state: ${String(payload.state)}`);
  }
  const result = payload.result && typeof payload.result === "object" && !Array.isArray(payload.result) ? (payload.result as RedditSourceApiResponse) : null;
  const code = typeof payload.error_code === "string" && payload.error_code.trim() ? payload.error_code.trim() : "REDDIT_SOURCE_JOB_FAILED";
  const message =
    typeof payload.error_message === "string" && payload.error_message.trim() ? payload.error_message.trim() : "Reddit source job failed without details";
  const deadlineAt = typeof payload.deadline_at === "string" && !Number.isNaN(Date.parse(payload.deadline_at)) ? payload.deadline_at : "";
  const progress =
    payload.progress && typeof payload.progress === "object" && !Array.isArray(payload.progress) ? (payload.progress as Record<string, unknown>) : null;
  const phase = progress?.phase === "listing" || progress?.phase === "details" ? progress.phase : "";
  const completed = typeof progress?.details_completed === "number" && Number.isInteger(progress.details_completed) ? progress.details_completed : null;
  const total = typeof progress?.details_total === "number" && Number.isInteger(progress.details_total) ? progress.details_total : null;
  const progressSummary = phase
    ? ` phase=${phase}${completed !== null && total !== null ? ` details=${completed}/${total}` : ""}${deadlineAt ? ` deadline=${deadlineAt}` : ""}`
    : deadlineAt
      ? ` deadline=${deadlineAt}`
      : "";
  return { id: payload.id, state: payload.state, result, error: `${code}: ${message}`, progress: progressSummary };
}

const REDDIT_SOURCE_JOB_PATH = "/v3/reddit/top20-source/jobs";

export async function fetchRedditSourceFromApi(date: string, category: RedditCategory): Promise<string> {
  const endpoint = redditServiceEndpoint("reddit-top20 generation");
  const limits = category.sourceLimits;
  const submitted = await fetchJson<RedditSourceJobApiResponse>(`${endpoint.baseUrl}${REDDIT_SOURCE_JOB_PATH}`, {
    method: "POST",
    body: JSON.stringify({
      archive_date: date,
      subreddits: category.subreddits,
      ...(limits
        ? {
            top_level_comment_limit: limits.topLevelCommentLimit,
            direct_reply_limit: limits.directReplyLimit,
            detail_comment_limit: limits.detailCommentLimit,
          }
        : {}),
    }),
    ...endpoint.request,
  });
  const result = await pollRedditJob<RedditSourceApiResponse>({
    endpoint,
    jobPath: REDDIT_SOURCE_JOB_PATH,
    submitted,
    label: "Reddit source",
    logPrefix: "[reddit-source]",
    parseStatus: payload => parseRedditSourceJobResponse(payload as RedditSourceJobApiResponse, date),
  });
  const source = parseRedditSourceApiResponse(result, date, category);
  const policy = parseRedditSourcePolicy(result.policy, result.policy_sha256);
  redditSubredditStatsLogLines(result.subreddit_stats, policy, category).forEach(line => writeStdout(`${line}\n`));
  return source;
}

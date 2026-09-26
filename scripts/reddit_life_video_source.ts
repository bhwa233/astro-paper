// 视频/图文每天用哪几个问题。2026-09-26 起不再读当天的文章草稿，而是从 SparkHub 素材池领取
// 「未使用、回答满十条、评分最高」的问题，这样跨天去重、分数可比，也能在后台人工调分插队。
//
// 素材池不可用（没配 secret、请求失败、池子空了）时退回本地：从当天 reddit-life-wechat 的打分
// manifest 和上游原文里取分最高、回答满十条的问题，保证 SparkHub 挂了也不断更。本地兜底选出的帖子
// 在图文草稿建好后按 Reddit postId 确认，同样会在素材池里记为已用。
//
// 领取结果写进 source.json 并随选卡一起提交。同一天重跑（包括 --force 重选卡）直接复用它，
// 不会再领一次；想换题就删掉这个文件，并在后台把原来那条放回池子。
import fs from "node:fs";
import path from "node:path";
import { writeStderr } from "./blog_common.ts";
import type { RedditLifeRunManifest } from "./generate_reddit_life_wechat.ts";
import { parseRedditLifeCandidates } from "./reddit_life_wechat_compose.ts";
import { claimRedditLifePosts, sparkhubEndpoint } from "./sparkhub_client.ts";

const SOURCE_VERSION = 1;
const WECHAT_ROOT_REL = "data/reddit-life-wechat";

export type RedditLifeVideoSourcePost = {
  /** SparkHub 池 id；本地兜底选出的为 null，确认时改用 postId。 */
  poolId: number | null;
  postId: string;
  /** 这一题首次出现的归档日，不一定是今天。 */
  archiveDate: string;
  title: string;
  score: number;
  replyCount: number;
  contentMd: string;
};

export type RedditLifeVideoSource = {
  version: typeof SOURCE_VERSION;
  archiveDate: string;
  kind: "sparkhub" | "local";
  posts: RedditLifeVideoSourcePost[];
};

/** 与 SparkHub 的 countReplies 同一口径：正文里 `N\.` 开头的行数。 */
function countReplies(body: string): number {
  return body.match(/^\d+\\?\.\s/gm)?.length ?? 0;
}

function readSource(file: string): RedditLifeVideoSource | null {
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as RedditLifeVideoSource;
  if (value.version !== SOURCE_VERSION || !Array.isArray(value.posts) || !value.posts.length) {
    throw new Error(`invalid Reddit life video source: ${file}`);
  }
  return value;
}

/** 当天打分 manifest 里分最高、回答数达标且不在 exclude 里的 count 个问题。 */
function localPosts(repo: string, date: string, count: number, minReplies: number, exclude: Set<string>): RedditLifeVideoSourcePost[] {
  const manifestFile = path.join(repo, WECHAT_ROOT_REL, date, "run.json");
  if (!fs.existsSync(manifestFile)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as RedditLifeRunManifest;
  const upstreamRel = manifest.rawSources?.upstreamLifeMarkdown;
  if (manifest.version < 5 || manifest.status !== "processed" || !manifest.selection?.scores || !upstreamRel) return [];

  const scores = new Map(manifest.selection.scores.map(entry => [entry.rank, entry.score]));
  return parseRedditLifeCandidates(fs.readFileSync(path.join(repo, upstreamRel), "utf8"))
    .map(candidate => ({ candidate, score: scores.get(candidate.rank) ?? 0, replyCount: countReplies(candidate.body) }))
    .filter(entry => entry.replyCount >= minReplies && !exclude.has(entry.candidate.postId))
    .sort((a, b) => b.score - a.score || a.candidate.rank - b.candidate.rank)
    .slice(0, count)
    .map(({ candidate, score, replyCount }) => ({
      poolId: null,
      postId: candidate.postId,
      archiveDate: date,
      title: candidate.title,
      score,
      replyCount,
      contentMd: candidate.body,
    }));
}

async function sparkhubPosts(count: number, minReplies: number): Promise<RedditLifeVideoSourcePost[]> {
  if (!sparkhubEndpoint()) {
    writeStderr("WARN: [reddit-life-video] SparkHub is not configured; falling back to today's local ranking\n");
    return [];
  }
  try {
    const posts = await claimRedditLifePosts(count, minReplies);
    if (posts.length < count) writeStderr(`WARN: [reddit-life-video] SparkHub had only ${posts.length} of ${count} unused posts with ${minReplies}+ replies\n`);
    return posts.map(post => ({
      poolId: post.id,
      postId: post.post_id,
      archiveDate: post.archive_date,
      title: post.title,
      score: post.effective_score,
      replyCount: post.reply_count,
      contentMd: post.content_md,
    }));
  } catch (error) {
    writeStderr(
      `WARN: [reddit-life-video] SparkHub claim failed, falling back to today's local ranking: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return [];
  }
}

/**
 * 当天的选题来源：已有 source.json 就复用，否则领取并落盘。返回 null 表示两边都没有可用的问题。
 */
export async function resolveRedditLifeVideoSource(options: {
  repo: string;
  date: string;
  sourceFile: string;
  count: number;
  minReplies: number;
}): Promise<RedditLifeVideoSource | null> {
  const existing = readSource(options.sourceFile);
  if (existing) {
    writeStderr(`[reddit-life-video] reusing ${existing.kind} source for ${options.date}: ${existing.posts.map(post => post.postId).join(", ")}\n`);
    return existing;
  }

  const claimed = await sparkhubPosts(options.count, options.minReplies);
  const local = localPosts(options.repo, options.date, options.count - claimed.length, options.minReplies, new Set(claimed.map(post => post.postId)));
  const posts = [...claimed, ...local];
  if (!posts.length) return null;

  const source: RedditLifeVideoSource = {
    version: SOURCE_VERSION,
    archiveDate: options.date,
    kind: local.length ? "local" : "sparkhub",
    posts,
  };
  fs.mkdirSync(path.dirname(options.sourceFile), { recursive: true });
  fs.writeFileSync(options.sourceFile, `${JSON.stringify(source, null, 2)}\n`, "utf8");
  writeStderr(
    `[reddit-life-video] ${options.date}: ${claimed.length} question(s) from SparkHub, ${local.length} from the local fallback: ${posts.map(post => `${post.postId}(${post.score})`).join(", ")}\n`
  );
  return source;
}

/** 拼成 parseRedditLifeVideoQuestions 认得的形状：每题一个 `## ` 标题，下面是 `N\.` 回答列表。 */
export function redditLifeVideoSourceMarkdown(source: RedditLifeVideoSource): string {
  return source.posts.map(post => `\n## ${post.title}\n${post.contentMd.trim()}\n`).join("");
}

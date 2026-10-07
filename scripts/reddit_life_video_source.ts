// 视频/图文只从 SparkHub 领取已经刷新、按当前答案评分、未使用且回答数达标的问题。
// 本地 manifest 不再作为评分或候选来源，避免绕过“刷新后评分”的门槛。
//
// 领取结果写进 source.json 并随选卡一起提交。同一天重跑（包括 --force 重选卡）直接复用它，
// 不会再领一次；想换题就删掉这个文件，并在后台把原来那条放回池子。
import fs from "node:fs";
import path from "node:path";
import { writeStderr } from "./blog_common.ts";
import { claimRedditLifePosts, sparkhubEndpoint } from "./sparkhub_client.ts";

const SOURCE_VERSION = 1;

export type RedditLifeVideoSourcePost = {
  /** SparkHub pool id. */
  poolId: number;
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
  kind: "sparkhub";
  posts: RedditLifeVideoSourcePost[];
};

function readSource(file: string): RedditLifeVideoSource | null {
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as RedditLifeVideoSource;
  if (value.version !== SOURCE_VERSION || !Array.isArray(value.posts) || !value.posts.length) {
    throw new Error(`invalid Reddit life video source: ${file}`);
  }
  return value;
}

async function sparkhubPosts(count: number, minReplies: number): Promise<RedditLifeVideoSourcePost[]> {
  if (!sparkhubEndpoint()) {
    throw new Error("SparkHub is not configured; refreshed and scored candidates are required");
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
    writeStderr(`ERROR: [reddit-life-video] SparkHub claim failed: ${error instanceof Error ? error.message : String(error)}\n`);
    throw error;
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

  const posts = await sparkhubPosts(options.count, options.minReplies);
  if (!posts.length) return null;

  const source: RedditLifeVideoSource = {
    version: SOURCE_VERSION,
    archiveDate: options.date,
    kind: "sparkhub",
    posts,
  };
  fs.mkdirSync(path.dirname(options.sourceFile), { recursive: true });
  fs.writeFileSync(options.sourceFile, `${JSON.stringify(source, null, 2)}\n`, "utf8");
  writeStderr(
    `[reddit-life-video] ${options.date}: ${posts.length} refreshed and scored question(s) from SparkHub: ${posts.map(post => `${post.postId}(${post.score})`).join(", ")}\n`
  );
  return source;
}

/** 拼成 parseRedditLifeVideoQuestions 认得的形状：每题一个 `## ` 标题，下面是 `N\.` 回答列表。 */
export function redditLifeVideoSourceMarkdown(source: RedditLifeVideoSource): string {
  return source.posts.map(post => `\n## ${post.title}\n${post.contentMd.trim()}\n`).join("");
}

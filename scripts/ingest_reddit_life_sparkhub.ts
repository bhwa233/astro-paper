// 把某一天 reddit-life-wechat 归档里的全部打分候选推进 SparkHub 素材池
// （`POST /api/linkdisk/dashboard/decks/reddit-life/ingest`）。
//
// 只读 run.json 与 upstream-life.md，不改归档，也不参与选题。图文草稿之后从素材池领取当天要发的问题。
// v5 时期当天进了文章草稿的帖子带上 syncId 一起送过去，SparkHub 直接记为 used，不会再发一次；
// v6 起文章草稿停发，manifest 没有 posts，全部候选都是 pending。
//
// 接口按 postId upsert，同一天重跑（--force 重建）可以放心重复推送。
import fs from "node:fs";
import path from "node:path";
import { parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { parseRedditLifeCandidates, redditLifeWechatSyncId } from "./reddit_life_wechat_compose.ts";
import type { RedditLifeRunManifest } from "./generate_reddit_life_wechat.ts";
import { ingestRedditLifeDay, sparkhubEndpoint } from "./sparkhub_client.ts";

const LABEL = "[reddit-life-sparkhub]";
const ROOT_REL = "data/reddit-life-wechat";

type IngestPost = {
  post_id: string;
  subreddit: string;
  title: string;
  permalink: string;
  points: string;
  num_comments: number;
  source_rank: number;
  score: number;
  score_reason: string;
  content_md: string;
  used_sync_id: string | null;
};

export type RedditLifeIngestPayload = {
  archive_date: string;
  upstream_sha: string;
  score_model: string;
  posts: IngestPost[];
};

/** 由归档组装请求体；v5 之前或上游为空的日子返回 null，调用方直接跳过。 */
export function buildRedditLifeIngestPayload(repo: string, date: string): RedditLifeIngestPayload | null {
  const manifestFile = path.join(repo, ROOT_REL, date, "run.json");
  if (!fs.existsSync(manifestFile)) throw new Error(`manifest not found: ${manifestFile}`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as RedditLifeRunManifest;
  // v5 之前没有 0-100 的全员打分，素材池只收 v5 及以后。
  if (manifest.version < 5 || manifest.status !== "processed" || !manifest.selection?.scores) return null;

  const upstreamRel = manifest.rawSources?.upstreamLifeMarkdown;
  if (!upstreamRel) throw new Error(`${manifestFile} has no rawSources.upstreamLifeMarkdown`);
  const candidates = parseRedditLifeCandidates(fs.readFileSync(path.join(repo, upstreamRel), "utf8"));
  const scores = new Map(manifest.selection.scores.map(entry => [entry.rank, entry]));

  // 已进草稿的帖子 → 它所在那一卷的 syncId。
  const used = new Map<string, string>();
  for (const post of manifest.posts) {
    if (post.status === "generated" && post.volume && post.volume !== "v2") used.set(post.postId, redditLifeWechatSyncId(date, post.volume));
  }

  const posts = candidates.map(candidate => {
    const scored = scores.get(candidate.rank);
    if (!scored) throw new Error(`${manifestFile} has no score for rank ${candidate.rank}`);
    return {
      post_id: candidate.postId,
      subreddit: candidate.subreddit,
      title: candidate.title,
      permalink: candidate.permalink,
      points: candidate.points,
      num_comments: candidate.numComments,
      source_rank: candidate.rank,
      score: scored.score,
      score_reason: scored.reason,
      content_md: candidate.body,
      used_sync_id: used.get(candidate.postId) ?? null,
    };
  });

  return { archive_date: date, upstream_sha: manifest.upstream.generatedSha, score_model: manifest.selection.model, posts };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = stringArg(args, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date YYYY-MM-DD is required");
  const payload = buildRedditLifeIngestPayload(path.resolve(stringArg(args, "repo", repoRoot())), date);
  if (!payload) {
    writeStderr(`${LABEL} ${date}: not a processed v5 archive, skipped`);
    return;
  }

  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");

  const result = await ingestRedditLifeDay(payload);
  const usedCount = payload.posts.filter(post => post.used_sync_id).length;
  writeStderr(`${LABEL} ${date}: ingested ${result.received} candidates (${usedCount} already in drafts)`);
  writeStdout(`${JSON.stringify({ date, received: result.received, used: usedCount })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

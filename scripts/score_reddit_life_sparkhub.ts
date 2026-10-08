// Score already refreshed Reddit life posts without generating or archiving articles.
// This is intentionally separate from generate_reddit_life_wechat.ts so historical
// backfills cannot create replacement Markdown or WeChat drafts by accident.
import path from "node:path";
import { dateStringInTimeZone, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { DEFAULT_AI_MODEL } from "./blog_ai_client.ts";
import { getRedditLifeScoringCandidates, reportRedditLifeScores, sparkhubEndpoint, type SparkhubRedditLifePost } from "./sparkhub_client.ts";
import { selectRedditLifeWechatCandidates, type RedditLifeWechatScoredPost } from "./reddit_life_wechat_selection.ts";
import type { RedditLifeCandidate } from "./reddit_life_wechat_compose.ts";

function args(): { date: string; model: string; artifactsDir: string } {
  const parsed = parseArgs();
  const date = stringArg(parsed, "date") || dateStringInTimeZone(new Date(), "America/Los_Angeles");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid --date: ${date}`);
  return {
    date,
    model: stringArg(parsed, "model") || process.env.AI_MODEL || DEFAULT_AI_MODEL,
    artifactsDir: stringArg(parsed, "artifacts-dir") || "",
  };
}

async function scoreBatch(posts: SparkhubRedditLifePost[], date: string, model: string, artifactsDir: string) {
  const candidates: RedditLifeCandidate[] = posts.map((post, index) => {
    if (!post.permalink || !post.content_sha256) throw new Error(`candidate ${post.post_id} has no permalink or answer hash`);
    return {
      rank: index + 1,
      postId: post.post_id,
      title: post.title,
      subreddit: post.subreddit,
      numComments: post.num_comments ?? 0,
      permalink: post.permalink,
      body: post.content_md,
      answerSha256: post.content_sha256,
    };
  });
  const selection = await selectRedditLifeWechatCandidates({ candidates, date, model, promptDir: path.join(repoRoot(), "prompts/blog"), artifactsDir });
  const byRank = new Map<number, RedditLifeWechatScoredPost>(selection.scores.map(item => [item.rank, item]));
  return posts.map((post, index) => {
    const score = byRank.get(index + 1);
    if (!score || !post.content_sha256) throw new Error(`missing score for ${post.post_id}`);
    return { post_id: post.post_id, content_sha256: post.content_sha256, score: score.score, reason: score.reason, model };
  });
}

async function main(): Promise<void> {
  const { date, model, artifactsDir } = args();
  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");
  const posts = await getRedditLifeScoringCandidates(date);
  if (!posts.length) {
    writeStdout(JSON.stringify({ date, candidates: 0, scored: [], skipped: [] }) + "\n");
    return;
  }
  const items = await scoreBatch(posts, date, model, artifactsDir);
  const report = await reportRedditLifeScores(items);
  writeStderr(`[reddit-life-score] ${date}: ${report.scored.length} scored, ${report.skipped.length} skipped\n`);
  writeStdout(JSON.stringify({ date, candidates: posts.length, scored: report.scored, skipped: report.skipped }) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });

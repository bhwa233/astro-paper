// Score already refreshed Reddit life posts without generating or archiving articles.
// This is intentionally separate from generate_reddit_life_wechat.ts so historical
// backfills cannot create replacement Markdown or WeChat drafts by accident.
import fs from "node:fs";
import path from "node:path";
import { writeJson } from "./committed_handoff.ts";
import { dateStringInTimeZone, envPositiveInt, mapWithConcurrency, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { DEFAULT_AI_MODEL } from "./blog_ai_client.ts";
import {
  getRedditLifeScoringCandidates,
  reportRedditLifeScores,
  sparkhubEndpoint,
  type SparkhubRedditLifePost,
  type SparkhubRefreshItem,
} from "./sparkhub_client.ts";
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
  const resultFile = stringArg(parseArgs(), "refresh-result");
  const refreshed: SparkhubRefreshItem[] | undefined = resultFile
    ? (JSON.parse(fs.readFileSync(resultFile, "utf8")) as { items: SparkhubRefreshItem[] }).items.filter(item => item.status === "ok")
    : undefined;
  const dates = refreshed ? [...new Set(refreshed.map(item => item.archive_date))] : [date];
  const results = [];
  for (const archiveDate of dates) {
    const selectedIds = refreshed ? new Set(refreshed.filter(item => item.archive_date === archiveDate).map(item => item.post_id)) : undefined;
    const posts = (await getRedditLifeScoringCandidates(archiveDate)).filter(post => !selectedIds || selectedIds.has(post.id));
    const scored: string[] = [];
    const skipped: Array<{ post_id: string; reason: string }> = [];
    // Refresh batches isolate each post, so a model/report failure cannot block its neighbours.
    const batches = refreshed ? posts.map(post => [post]) : posts.length ? [posts] : [];
    await mapWithConcurrency(batches, envPositiveInt("REDDIT_AI_CONCURRENCY", 3), async batch => {
      try {
        const items = await scoreBatch(batch, archiveDate, model, refreshed && artifactsDir ? path.join(artifactsDir, String(batch[0].id)) : artifactsDir);
        const report = await reportRedditLifeScores(items);
        scored.push(...report.scored);
        skipped.push(...report.skipped);
      } catch (error) {
        if (!refreshed) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        const post = batch[0];
        skipped.push({ post_id: post.post_id, reason });
        // Keep failed scoring visible without allowing a stale hash to overwrite a newer refresh.
        if (post.content_sha256) {
          try {
            await reportRedditLifeScores([{ post_id: post.post_id, content_sha256: post.content_sha256, error: reason }]);
          } catch (reportError) {
            writeStderr(
              `[reddit-life-score] ${post.post_id}: failure report rejected: ${reportError instanceof Error ? reportError.message : String(reportError)}\n`
            );
          }
        }
        writeStderr(`[reddit-life-score] ${batch[0].post_id}: ${reason}\n`);
      }
    });
    writeStderr(`[reddit-life-score] ${archiveDate}: ${scored.length} scored, ${skipped.length} skipped\n`);
    results.push({ date: archiveDate, candidates: posts.length, scored, skipped });
  }
  const result = refreshed ? { archive_dates: dates, results } : results[0];
  const outputFile = stringArg(parseArgs(), "result-file");
  if (outputFile) writeJson(outputFile, result);
  writeStdout(JSON.stringify(result) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });

// 初次抓取只把问题元数据写入 SparkHub。回答要等刷新后才回写，AI 评分也只读刷新后的回答。
// 不创建 upstream-life.md 快照：源文章只在这一步作为临时元数据输入。
import fs from "node:fs";
import path from "node:path";
import { parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { taskPostRelPath } from "./blog_tasks.ts";
import { parseRedditLifeCandidates } from "./reddit_life_wechat_compose.ts";
import { ingestRedditLifeDay, sparkhubEndpoint } from "./sparkhub_client.ts";

const LABEL = "[reddit-life-sparkhub]";

export type RedditLifeIngestPayload = {
  archive_date: string;
  upstream_sha: string;
  source_fetched_at: string | null;
  posts: Array<{
    post_id: string;
    subreddit: string;
    title: string;
    permalink: string;
    num_comments: number;
    source_rank: number;
  }>;
};

export function upstreamSourceFetchedAt(markdown: string): string | null {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const value = frontmatter.match(/^sourceFetchedAt:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim() ?? "";
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function buildRedditLifeIngestPayload(repo: string, date: string, upstreamSha: string): RedditLifeIngestPayload {
  const articleRel = taskPostRelPath("reddit-top20", `${date}-life`);
  const articleFile = path.join(repo, articleRel);
  if (!fs.existsSync(articleFile)) throw new Error(`life article not found: ${articleFile}`);
  const markdown = fs.readFileSync(articleFile, "utf8");
  const candidates = parseRedditLifeCandidates(markdown);
  return {
    archive_date: date,
    upstream_sha: upstreamSha,
    source_fetched_at: upstreamSourceFetchedAt(markdown),
    posts: candidates.map(candidate => ({
      post_id: candidate.postId,
      subreddit: candidate.subreddit,
      title: candidate.title,
      permalink: candidate.permalink,
      num_comments: candidate.numComments,
      source_rank: candidate.rank,
    })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = stringArg(args, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date YYYY-MM-DD is required");
  const repo = path.resolve(stringArg(args, "repo", repoRoot()));
  const upstreamSha = stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || "");
  const payload = buildRedditLifeIngestPayload(repo, date, upstreamSha);

  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");
  const result = await ingestRedditLifeDay(payload);
  writeStderr(`${LABEL} ${date}: recorded ${result.received} unscored candidates; answers and scores are deferred until after refresh`);
  writeStdout(`${JSON.stringify({ date, received: result.received })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

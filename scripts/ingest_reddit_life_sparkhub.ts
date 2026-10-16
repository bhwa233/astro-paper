// 初次抓取只把问题元数据写入 SparkHub。回答要等刷新后才回写，AI 评分也只读刷新后的回答。
// 直接读取经过契约校验的来源数据，不先调用模型生成一篇随后会被覆盖的临时文章。
import { dateStringInTimeZone, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { assertCommittedHandoff, writeJson } from "./committed_handoff.ts";
import { configuredRedditCategory } from "./reddit_life_config.ts";
import { fetchRedditSourceFromApi, redditSourceFetchedAt } from "./reddit_source_api.ts";
import { parseSourceFacts, redditCategoryByKey, redditSourceBlocks, type RedditCategory } from "./reddit_top20_compose.ts";
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

export function buildRedditLifeIngestPayload(source: string, date: string, upstreamSha: string, category: RedditCategory): RedditLifeIngestPayload {
  const blocks = redditSourceBlocks(source);
  const facts = parseSourceFacts(source, category);
  return {
    archive_date: date,
    upstream_sha: upstreamSha,
    source_fetched_at: redditSourceFetchedAt(source) || null,
    posts: facts.map((fact, index) => {
      const block = blocks[index]!;
      const title = block.match(/^\d+\.\s*\[r\/[^\]]+\]\s+(.+)$/m)?.[1]?.trim();
      const postId = fact.url.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1]?.toLowerCase();
      if (!title || !postId) throw new Error(`Reddit life source item ${fact.rank} is missing its title or post ID`);
      return {
        post_id: postId,
        subreddit: fact.subreddit,
        title,
        permalink: fact.url,
        num_comments: Number((block.match(/·\s*([\d,]+)\s*评论/)?.[1] || "0").replaceAll(",", "")),
        source_rank: fact.rank,
      };
    }),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = stringArg(args, "date") || dateStringInTimeZone(new Date(), "America/Los_Angeles");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date YYYY-MM-DD is required");
  const upstreamSha = stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || "");
  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");
  assertCommittedHandoff(repoRoot(), upstreamSha, "Reddit life candidates");
  const category = await configuredRedditCategory(redditCategoryByKey("life"));
  const source = await fetchRedditSourceFromApi(date, category);
  const payload = buildRedditLifeIngestPayload(source, date, upstreamSha, category);
  const result = await ingestRedditLifeDay(payload);
  writeStderr(`${LABEL} ${date}: recorded ${result.received} unscored candidates; answers and scores are deferred until after refresh`);
  const output = { date, received: result.received };
  const resultFile = stringArg(args, "result-file");
  if (resultFile) writeJson(resultFile, output);
  writeStdout(`${JSON.stringify(output)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

// 给 SparkHub 素材池里待用的问题重抓一次评论，补充回答。
//
// 池里的回答是上游 reddit-top20 当天抓热帖时的快照：帖子刚上热门，评论区还没沉淀，而且一题往往要在池里
// 排几天才会被领走。所以每天入库之后、视频选卡领题之前，先让 SparkHub 开一次刷新任务：它按后台配置
// 选出要刷的帖子（人工请求的全部，再加按领取顺序的前 K 个、从没刷过或上次刷新早于 N 天的待用帖），
// 这里深抓评论、用上游 life 栏目同一份提示词（reddit-item-summary，numbered 口径）重写回答，逐帖回报。
// 回报的正文整体替换池里的旧回答，标题保持池里原样；帖子在这期间被领走、或卡片已经发出去的，SparkHub 拒收、不改正文。
// 已有卡片但还没发出去的帖子，SparkHub 换回答的同时撤下卡片，排在后面的卡片批次当天按新回答重新出卡。
//
// SparkHub 接受（ok）之后，新回答同样写回这一题首次出现那天的 life 文章
// （src/content/posts/zh-cn/reddit-<date>-life.md），只换编号回答，标题与事实 bullet 不动，并更新 modDatetime；
// 由 workflow 统一提交。upstream-life.md 保持初次爬取的原样。被拒收或失败的题不改文章。
//
// 单帖失败（帖子被删或锁、没有顶层评论、模型判定排除主题、重试后仍不合格）只回报 error，旧回答不动，
// 下次运行会再挑到它。整个脚本在 workflow 里是旁路步骤，失败不挡领题。
import fs from "node:fs";
import path from "node:path";
import { dateStringInTimeZone, envPositiveInt, mapWithConcurrency, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { readPromptTemplate } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries } from "./ai_json_stage.ts";
import { DEFAULT_AI_MODEL } from "./blog_ai_client.ts";
import { taskPostRelPath } from "./blog_tasks.ts";
import { replaceRedditLifePostBody } from "./reddit_life_wechat_compose.ts";
import { type RedditEvidenceComment, type RedditPostEvidence, REDDIT_TRENDING_MAX_DETAIL_POSTS, fetchRedditPostDetail } from "./reddit_trending_api.ts";
import { parseRedditItemOutcome, redditCategoryByKey } from "./reddit_top20_compose.ts";
import { loadRedditLifeConfig } from "./reddit_life_config.ts";
import {
  type SparkhubRefreshItem,
  finishRedditLifeRefreshRun,
  reportRedditLifeRefreshItem,
  sparkhubEndpoint,
  startRedditLifeRefreshRun,
} from "./sparkhub_client.ts";

const LABEL = "[reddit-life-refresh]";
const SOURCE_TIME_ZONE = "America/Los_Angeles";
const PROMPT_NAME = "reddit-item-summary";
const REDDIT_PROMPT_FRAGMENTS = { reddit_translation_rules: "_reddit-translation-rules" };
// 每帖单独一次模型调用，提示词里的排名固定为 1。
const PROMPT_RANK = 1;

type Outcome = { content: string } | { error: string };

function scoreLabel(comment: RedditEvidenceComment): string {
  return comment.score === null ? "分数隐藏" : `${comment.score} 赞`;
}

/**
 * 把单帖深抓证据拼成 reddit-top20 v7 source block 的形状，这样上游的 reddit-item-summary 提示词不用改就能读。
 * 行格式与来源服务 app/reddit.py 渲染 v7 块的写法一致（没有栏目行：这里只有一个栏目）。
 */
export function redditLifeEvidenceBlock(post: RedditPostEvidence): string {
  const repliesByParent = new Map<string, RedditEvidenceComment[]>();
  for (const reply of post.replies) {
    if (!reply.parentId) continue;
    repliesByParent.set(reply.parentId, [...(repliesByParent.get(reply.parentId) ?? []), reply]);
  }
  const lines = [
    `${PROMPT_RANK}. [r/${post.subreddit}] ${post.title}`,
    `- ⭐ ${post.score ?? "?"} points · ${post.numComments ?? "?"} 评论`,
    `- 来源：r/${post.subreddit}`,
    `- 发布时间：${post.publishedAt}`,
    `- 帖子链接：https://www.reddit.com${post.permalink}`,
    `- 正文类型：${post.body ? "作者正文" : "无正文"}`,
    `- 正文截断：${post.bodyTruncated ? "是" : "否"}`,
    `- 正文：${post.body || "（无正文）"}`,
    `- 顶层高赞回答（按赞数排序，共 ${post.topComments.length} 条）：`,
    "",
  ];
  post.topComments.forEach((comment, index) => {
    lines.push(`  ${index + 1}. [${scoreLabel(comment)}] ${comment.text}`);
    for (const reply of repliesByParent.get(comment.id) ?? []) lines.push(`    - 回复 [${scoreLabel(reply)}] ${reply.text}`);
  });
  lines.push(`- 高赞直接回复：共 ${post.replies.length} 条，已附在对应顶层评论下。`);
  return lines.join("\n");
}

/**
 * 与上游文章同一编号口径：每条回答一段，列表标记转义成 `N\.`，素材池和下游解析都按这个数。
 * 字面量 `\n` 的还原与「几条挤一行」的拦截在 parseRedditItemSummary 里，和上游共用。
 */
export function redditLifeRefreshedContent(summary: string): string {
  return summary
    .split(/\n+(?=\d+\\?\.\s)/)
    .map(item => item.trim().replace(/^(\d+)\.\s/, "$1\\. "))
    .filter(Boolean)
    .join("\n\n");
}

async function rewrite(post: RedditPostEvidence, template: string, date: string, model: string, artifactsDir: string): Promise<Outcome> {
  const category = redditCategoryByKey("life");
  if (category.mode !== "summary") throw new Error("Reddit life category must be a summary category");
  const prompt = template
    .replaceAll("{date}", date)
    .replaceAll("{rank}", String(PROMPT_RANK))
    .replaceAll("{post_text}", redditLifeEvidenceBlock(post));
  const outcome = await generateJsonStageWithRetries<Outcome>({
    task: "reddit-life-refresh",
    stage: `Reddit life refresh ${post.postId}`,
    artifactPrefix: post.postId,
    prompt,
    model,
    artifactsDir,
    jitterMs: 1_000,
    parse: raw => {
      const item = parseRedditItemOutcome(raw, PROMPT_RANK, category.summaryMinChars, category.summaryFormat);
      return item ? { content: redditLifeRefreshedContent(item.summary) } : { error: "Model excluded this post by topic" };
    },
    onExhausted: error => ({ error }),
  });
  if ("content" in outcome && !/^\d+\\\.\s/m.test(outcome.content)) return { error: "Rewritten replies have no numbered items" };
  return outcome;
}

async function refreshItem(
  evidence: RedditPostEvidence | undefined,
  context: { template: string; date: string; model: string; artifactsDir: string }
): Promise<Outcome> {
  if (!evidence) return { error: "Missing from the fetch result" };
  if (evidence.status !== "ok") return { error: `Reddit post ${evidence.status}${evidence.errorCode ? ` (${evidence.errorCode})` : ""}` };
  if (!evidence.topComments.length) return { error: "No top-level comments" };
  return rewrite(evidence, context.template, context.date, context.model, context.artifactsDir);
}

/**
 * 把新回答写回 life 文章。读写都是同步的：同一天的几题在并发回报里改同一个文件，
 * 中间没有 await 就不会互相覆盖。返回写入的相对路径；文章或这一帖找不到时返回空串。
 */
function writeBackArticle(repo: string, item: SparkhubRefreshItem, content: string): string {
  const rel = taskPostRelPath("reddit-top20", `${item.archive_date}-life`);
  const file = path.join(repo, rel);
  if (!fs.existsSync(file)) {
    writeStderr(`WARN: ${LABEL} ${item.reddit_post_id}: ${rel} not found; article left unchanged\n`);
    return "";
  }
  const updated = replaceRedditLifePostBody(fs.readFileSync(file, "utf8"), item.reddit_post_id, content);
  if (updated === null) {
    writeStderr(`WARN: ${LABEL} ${item.reddit_post_id}: not in ${rel}; article left unchanged\n`);
    return "";
  }
  const modDatetime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  fs.writeFileSync(file, updated.replace(/^modDatetime: .*$/m, `modDatetime: ${modDatetime}`), "utf8");
  return rel;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function githubRun(): { github_run_id: string | null; github_run_url: string | null } {
  const id = process.env.GITHUB_RUN_ID?.trim() || null;
  const server = process.env.GITHUB_SERVER_URL?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  return { github_run_id: id, github_run_url: id && server && repository ? `${server}/${repository}/actions/runs/${id}` : null };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = stringArg(args, "date") || dateStringInTimeZone(new Date(), SOURCE_TIME_ZONE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid --date: ${date}`);
  const model = stringArg(args, "model") || process.env.AI_MODEL || DEFAULT_AI_MODEL;
  const artifactsDir = stringArg(args, "artifacts-dir");
  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");

  const repo = repoRoot();
  const template = readPromptTemplate(path.join(repo, "prompts/blog"), PROMPT_NAME, REDDIT_PROMPT_FRAGMENTS);
  const run = await startRedditLifeRefreshRun(githubRun());
  writeStderr(
    `${LABEL} run #${run.id}: ${run.manual_count} manual + ${run.auto_count} auto (K=${run.top_k}, N=${run.stale_days}d): ${run.items.map(item => item.reddit_post_id).join(", ") || "nothing to refresh"}\n`
  );
  if (!run.items.length) {
    writeStdout(`${JSON.stringify({ runId: run.id, refreshed: 0, failed: 0, rejected: 0 })}\n`);
    return;
  }

  let runError: string | null = null;
  const articles = new Set<string>();
  // 深抓多深来自 SparkHub 的 Reddit 问答配置（refresh_* 三项）。
  const { config } = await loadRedditLifeConfig();
  const detailLimits = {
    topLevelCommentLimit: config.refresh_top_level_comment_limit,
    directReplyLimit: config.refresh_direct_reply_limit,
    maxCommentCharsPerPost: config.refresh_max_comment_chars,
  };
  try {
    const context = { template, date, model, artifactsDir };
    for (const batch of chunks(run.items, REDDIT_TRENDING_MAX_DETAIL_POSTS)) {
      const withPermalink = batch.filter(item => item.permalink);
      let evidence: RedditPostEvidence[] = [];
      let fetchError = "";
      try {
        evidence = withPermalink.length ? await fetchRedditPostDetail(date, withPermalink.map(item => item.permalink as string), detailLimits) : [];
      } catch (error) {
        fetchError = `Comment fetch failed: ${error instanceof Error ? error.message : String(error)}`;
        writeStderr(`WARN: ${LABEL} ${fetchError}\n`);
      }
      const byPostId = new Map(evidence.map(post => [post.postId, post]));
      await mapWithConcurrency(batch, envPositiveInt("REDDIT_AI_CONCURRENCY", 3), async item => {
        const post = byPostId.get(item.reddit_post_id);
        const outcome: Outcome = !item.permalink
          ? { error: "Post has no Reddit permalink" }
          : fetchError
            ? { error: fetchError }
            : await refreshItem(post, context);
        if ("error" in outcome) writeStderr(`WARN: ${LABEL} ${item.reddit_post_id}: ${outcome.error}\n`);
        const reported = await reportRedditLifeRefreshItem(
          run.id,
          item.post_id,
          "content" in outcome ? { content_md: outcome.content, fetched_at: post?.fetchedAt ?? null } : { error: outcome.error, fetched_at: post?.fetchedAt ?? null }
        );
        if (reported.status === "ok" && "content" in outcome) {
          const rel = writeBackArticle(repo, item, outcome.content);
          if (rel) articles.add(rel);
        }
        writeStderr(
          `${LABEL} ${item.reddit_post_id} (${item.source}): ${reported.status}, replies ${reported.reply_count_before} -> ${reported.reply_count_after ?? "-"}${reported.error && reported.status !== "failed" ? ` (${reported.error})` : ""}\n`
        );
      });
    }
  } catch (error) {
    runError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const finished = await finishRedditLifeRefreshRun(run.id, runError);
    writeStderr(`${LABEL} run #${run.id} ${finished.status}: ${finished.refreshed_count} refreshed, ${finished.failed_count} failed, ${finished.rejected_count} skipped\n`);
    writeStdout(
      `${JSON.stringify({ runId: run.id, status: finished.status, refreshed: finished.refreshed_count, failed: finished.failed_count, rejected: finished.rejected_count, articles: [...articles] })}\n`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

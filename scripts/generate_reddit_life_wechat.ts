#!/usr/bin/env tsx
// 独立的 Reddit 人生微信归档编排：不进入 Astro 内容集合，也不重新选择 Reddit 榜单。
import fs from "node:fs";
import path from "node:path";
import { callBlogAiWithFailover, envAiConfig, envFallbackAiConfig } from "./blog_ai_client.ts";
import { dateStringInTimeZone, ensureDir, envPositiveInt, parseArgs, repoRoot, sleep, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { resolvePromptFile } from "./ai_blog_writer.ts";
import {
  markdownSha256,
  parseRedditLifeArticle,
  parseRedditLifeCandidates,
  parseRedditThreadSummary,
  recommendationForCandidate,
  renderRedditLifeWechatMarkdown,
  renderThreadEvidence,
  type RedditLifeCandidate,
  type RedditThreadSummary,
} from "./reddit_life_wechat_compose.ts";
import { appendRedditLifeRecommendations, loadRedditLifeRecommendationKeys, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH } from "./reddit_life_wechat_ledger.ts";
import { fetchRedditPostDetailsFromApi, type RedditLifeEvidence } from "./reddit_life_wechat_source.ts";
import { taskPostRelPath } from "./blog_tasks.ts";

const ROOT_REL = "data/reddit-life-wechat";
const MANIFEST_VERSION = 1;

type Entry = RedditLifeCandidate & {
  status: "generated" | "duplicate" | "content-skipped";
  path?: string;
  contentSha256?: string;
  fetchedAt?: string;
  sourceSha256?: string;
  policySha256?: string;
  reason?: string;
};

export type RedditLifeRunManifest = {
  version: 1;
  archiveDate: string;
  timeZone: "America/Los_Angeles";
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; workflowRun: string; lifeArticlePath: string };
  posts: Entry[];
};

function archiveDate(input: string, eventSchedule: string): string {
  if (input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error(`invalid archive date: ${input}`);
    return input;
  }
  // The only automatic caller is reddit-top20's daily cron. Preserve that task's Los Angeles business date.
  return eventSchedule === "0 8 * * *" || !eventSchedule ? dateStringInTimeZone(new Date(), "America/Los_Angeles") : dateStringInTimeZone(new Date(), "America/Los_Angeles");
}

function runRelPath(date: string): string {
  return path.join(ROOT_REL, date, "run.json");
}

function parseManifest(raw: unknown, file: string): RedditLifeRunManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid Reddit life WeChat run manifest: ${file}`);
  const value = raw as Partial<RedditLifeRunManifest>;
  if (value.version !== MANIFEST_VERSION || !/^\d{4}-\d{2}-\d{2}$/.test(value.archiveDate || "") || value.timeZone !== "America/Los_Angeles" || (value.status !== "processed" && value.status !== "upstream-empty") || !value.upstream || !Array.isArray(value.posts)) {
    throw new Error(`invalid Reddit life WeChat run manifest structure: ${file}`);
  }
  for (const [index, post] of value.posts.entries()) {
    if (!post || post.rank !== index + 1 || !post.postId || !post.title || !post.subreddit || !post.permalink || !["generated", "duplicate", "content-skipped"].includes(post.status)) {
      throw new Error(`invalid Reddit life WeChat run manifest post ${index + 1}: ${file}`);
    }
  }
  if (value.status === "upstream-empty" && value.posts.length) throw new Error(`invalid Reddit life WeChat upstream-empty manifest: ${file}`);
  return value as RedditLifeRunManifest;
}

export function loadRedditLifeRunManifest(file: string): RedditLifeRunManifest | null {
  if (!fs.existsSync(file)) return null;
  try {
    return parseManifest(JSON.parse(fs.readFileSync(file, "utf8")), file);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid Reddit life WeChat")) throw error;
    throw new Error(`invalid Reddit life WeChat run manifest: ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeArtifact(dir: string, name: string, content: string): void {
  if (!dir) return;
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, name), `${content.trim()}\n`, "utf8");
}

async function jsonWithRetries<T>(label: string, prompt: string, model: string, parse: (raw: string) => T, artifactsDir: string, artifactPrefix: string): Promise<T> {
  const attempts = envPositiveInt("AI_RETRY_ATTEMPTS", 3);
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await callBlogAiWithFailover({ prompt, primaryConfig: envAiConfig({ model }), fallbackConfig: envFallbackAiConfig(), jsonMode: true });
      writeArtifact(artifactsDir, `${artifactPrefix}-response-${attempt}.json`, result.content);
      return parse(result.content);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      writeArtifact(artifactsDir, `${artifactPrefix}-error-${attempt}.txt`, lastError);
      if (attempt < attempts) await sleep((attempt - 1) * envPositiveInt("AI_RETRY_DELAY_MS", 1_000));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError}`);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function composeArticle(candidate: RedditLifeCandidate, evidence: RedditLifeEvidence, date: string, repo: string, model: string, artifactsDir: string): Promise<string> {
  const promptDir = path.join(repo, "prompts/blog");
  const threadTemplate = fs.readFileSync(resolvePromptFile(promptDir, "reddit-life-wechat-thread-summary"), "utf8");
  const summaries = await mapWithConcurrency(evidence.topComments, envPositiveInt("REDDIT_LIFE_WECHAT_AI_CONCURRENCY", 4, 8), async parent => {
    const threadText = renderThreadEvidence(evidence, parent.id);
    const prompt = threadTemplate.replaceAll("{parent_id}", parent.id).replaceAll("{thread_text}", threadText);
    writeArtifact(artifactsDir, `${String(candidate.rank).padStart(2, "0")}-${candidate.postId}-thread-${parent.id}-prompt.md`, prompt);
    return jsonWithRetries(
      `Reddit life thread ${parent.id}`,
      prompt,
      model,
      raw => parseRedditThreadSummary(raw, parent.id),
      artifactsDir,
      `${String(candidate.rank).padStart(2, "0")}-${candidate.postId}-thread-${parent.id}`,
    );
  });
  const finalTemplate = fs.readFileSync(resolvePromptFile(promptDir, "reddit-life-wechat-article"), "utf8");
  const facts = [
    `- 标题：${evidence.title}`,
    `- 社区：r/${evidence.subreddit}`,
    `- 原帖：${evidence.permalink}`,
    `- 热度：${evidence.score} points · ${evidence.numComments} 评论`,
    `- 正文：${evidence.body || "（无正文）"}`,
  ].join("\n");
  const finalPrompt = finalTemplate.replaceAll("{post_facts}", facts).replaceAll("{thread_summaries}", JSON.stringify(summaries));
  writeArtifact(artifactsDir, `${String(candidate.rank).padStart(2, "0")}-${candidate.postId}-article-prompt.md`, finalPrompt);
  const article = await jsonWithRetries(
    `Reddit life article ${candidate.postId}`,
    finalPrompt,
    model,
    parseRedditLifeArticle,
    artifactsDir,
    `${String(candidate.rank).padStart(2, "0")}-${candidate.postId}-article`,
  );
  return renderRedditLifeWechatMarkdown(candidate, evidence, article, date);
}

export async function generateRedditLifeWechat({
  repo = repoRoot(),
  date,
  upstreamSha,
  workflowRun = "",
  model = "",
  artifactsDir = "",
}: {
  repo?: string;
  date: string;
  upstreamSha: string;
  workflowRun?: string;
  model?: string;
  artifactsDir?: string;
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: RedditLifeRunManifest["status"] }> {
  if (!upstreamSha) throw new Error("--upstream-sha is required; Reddit life WeChat must read the committed parent handoff");
  const manifestRel = runRelPath(date);
  const manifestFile = path.join(repo, manifestRel);
  const existing = loadRedditLifeRunManifest(manifestFile);
  if (existing) {
    const generated = existing.posts.filter(post => post.status === "generated");
    if (generated.length) appendRedditLifeRecommendations(generated.map(recommendationForCandidate), { archivedAt: date, postPath: manifestRel }, path.join(repo, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH));
    return { manifestPath: manifestRel, generatedPaths: generated.map(post => post.path!).filter(Boolean), status: existing.status };
  }
  const lifeArticlePath = taskPostRelPath("reddit-top20", date.replace(/$/, "-life"));
  const upstreamFile = path.join(repo, lifeArticlePath);
  if (!fs.existsSync(upstreamFile)) {
    const manifest: RedditLifeRunManifest = { version: 1, archiveDate: date, timeZone: "America/Los_Angeles", status: "upstream-empty", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, posts: [] };
    writeJson(manifestFile, manifest);
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status };
  }
  const upstreamMarkdown = fs.readFileSync(upstreamFile, "utf8");
  writeArtifact(artifactsDir, "upstream-life.md", upstreamMarkdown);
  const candidates = parseRedditLifeCandidates(upstreamMarkdown);
  const ledgerFile = path.join(repo, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH);
  const historical = loadRedditLifeRecommendationKeys(ledgerFile);
  const entries: Entry[] = candidates.map(candidate =>
    historical.has(recommendationForCandidate(candidate).key) ? { ...candidate, status: "duplicate", reason: "already recommended" } : { ...candidate, status: "content-skipped", reason: "pending evidence" },
  );
  const newCandidates = candidates.filter(candidate => !historical.has(recommendationForCandidate(candidate).key));
  const evidence = newCandidates.length ? await fetchRedditPostDetailsFromApi(date, newCandidates.map(candidate => candidate.postId)) : [];
  writeArtifact(artifactsDir, "post-detail-evidence.json", JSON.stringify(evidence, null, 2));
  const evidenceById = new Map(evidence.map(item => [item.postId, item]));
  const pendingFiles: Array<{ entry: Entry; markdown: string }> = [];
  for (const candidate of newCandidates) {
    const detail = evidenceById.get(candidate.postId);
    const entry = entries.find(item => item.postId === candidate.postId)!;
    if (!detail || detail.status === "unavailable" || !detail.topComments.length) {
      entry.status = "content-skipped";
      entry.reason = "post unavailable or has no usable top-level comments";
      continue;
    }
    const markdown = await composeArticle(candidate, detail, date, repo, model, artifactsDir);
    const relPath = path.join(ROOT_REL, date, `${String(candidate.rank).padStart(2, "0")}-${candidate.postId}.md`);
    entry.status = "generated";
    entry.path = relPath;
    entry.contentSha256 = markdownSha256(markdown);
    entry.fetchedAt = detail.fetchedAt;
    entry.sourceSha256 = detail.sourceSha256;
    entry.policySha256 = detail.policySha256;
    delete entry.reason;
    pendingFiles.push({ entry, markdown });
  }
  const manifest: RedditLifeRunManifest = { version: 1, archiveDate: date, timeZone: "America/Los_Angeles", status: "processed", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, posts: entries };
  // Persist the immutable snapshot only after every non-duplicate candidate has reached a terminal outcome.
  for (const file of pendingFiles) {
    const target = path.join(repo, file.entry.path!);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, file.markdown, "utf8");
  }
  writeJson(manifestFile, manifest);
  const generated = entries.filter(entry => entry.status === "generated");
  if (generated.length) appendRedditLifeRecommendations(generated.map(recommendationForCandidate), { archivedAt: date, postPath: manifestRel }, ledgerFile);
  return { manifestPath: manifestRel, generatedPaths: generated.map(entry => entry.path!).filter(Boolean), status: manifest.status };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = archiveDate(stringArg(args, "date"), process.env.EVENT_SCHEDULE || "");
  const result = await generateRedditLifeWechat({
    repo: path.resolve(stringArg(args, "repo", repoRoot())), date, upstreamSha: stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || ""), workflowRun: stringArg(args, "workflow-run", process.env.GITHUB_RUN_ID || ""), model: stringArg(args, "model", process.env.AI_MODEL || ""), artifactsDir: path.resolve(stringArg(args, "artifacts-dir", "reddit-life-wechat-artifacts")),
  });
  writeStdout(`${JSON.stringify({ date, ...result })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

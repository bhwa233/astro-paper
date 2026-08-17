#!/usr/bin/env tsx
// 独立的 Reddit 人生微信归档编排：不进入 Astro 内容集合，也不重新选择 Reddit 榜单。
// 上游 life 文章的每帖正文已经是逐条故事的有序列表，这里只取排名第一的那帖，改标题、加页脚、收口长度。
// 整条管线没有模型调用：内容全部来自已归档的上游文章。
import fs from "node:fs";
import path from "node:path";
import { dateStringInTimeZone, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import {
  countDroppableStories,
  dropTrailingStories,
  markdownSha256,
  parseRedditLifeCandidates,
  parseRedditLifeDescription,
  recommendationForCandidate,
  renderRedditLifeWechatMarkdown,
  type RedditLifeCandidate,
} from "./reddit_life_wechat_compose.ts";
import { appendRedditLifeRecommendations, loadRedditLifeRecommendationKeys, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH } from "./reddit_life_wechat_ledger.ts";
import { taskPostRelPath } from "./blog_tasks.ts";

const ROOT_REL = "data/reddit-life-wechat";
const MANIFEST_VERSION = 1;

type Entry = Omit<RedditLifeCandidate, "body"> & {
  status: "generated" | "duplicate" | "content-skipped";
  path?: string;
  contentSha256?: string;
  reason?: string;
};

export type RedditLifeRunManifest = {
  version: 1;
  archiveDate: string;
  timeZone: "America/Los_Angeles";
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; workflowRun: string; lifeArticlePath: string };
  rawSources?: { upstreamLifeMarkdown: string };
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

// 一帖的故事条数不可控，渲染出的 HTML 随时可能撞上微信 20000 字符上限，而上游无法预知渲染后的长度。
// 这里用渲染器本身做判定：能渲染就原样归档，撞限就从末尾删故事，二分找出最少的删除量。
export async function fitWechatContentLimit(markdown: string, repo: string, label: string): Promise<string> {
  const { openProject, prepareArticle } = await import("@lxw15337674/astro-wechat");
  const project = await openProject(repo, { root: repo });
  const probeFile = path.join(repo, ".astro-wechat", `content-limit-probe-${process.pid}.md`);
  ensureDir(path.dirname(probeFile));
  const fits = async (candidate: string): Promise<boolean> => {
    fs.writeFileSync(probeFile, candidate, "utf8");
    try {
      await prepareArticle(probeFile, project);
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "content-too-long" || code === "content-too-large") return false;
      throw error;
    }
  };
  try {
    if (await fits(markdown)) return markdown;
    // fits() 对删除量单调：删得越多越可能通过，因此可以二分最小可行的删除条数。
    let low = 1;
    let high = countDroppableStories(markdown) - 1;
    let fittedDrop = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (await fits(dropTrailingStories(markdown, middle))) {
        fittedDrop = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    if (!fittedDrop) throw new Error(`${label}: article still exceeds the WeChat content limit even with a single story`);
    // 静默截断会让归档看起来是完整讨论，因此把删掉的条数写进日志。
    writeStderr(`WARN: [reddit-life-wechat] ${label}: dropped ${fittedDrop} trailing story(ies) to fit the WeChat content limit`);
    return dropTrailingStories(markdown, fittedDrop);
  } finally {
    fs.rmSync(probeFile, { force: true });
  }
}

export async function generateRedditLifeWechat({
  repo = repoRoot(),
  date,
  upstreamSha,
  workflowRun = "",
  artifactsDir = "",
}: {
  repo?: string;
  date: string;
  upstreamSha: string;
  workflowRun?: string;
  artifactsDir?: string;
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: RedditLifeRunManifest["status"] }> {
  if (!upstreamSha) throw new Error("--upstream-sha is required; Reddit life WeChat must read the committed parent handoff");
  const manifestRel = runRelPath(date);
  const manifestFile = path.join(repo, manifestRel);
  const existing = loadRedditLifeRunManifest(manifestFile);
  if (existing) {
    const generated = existing.posts.filter(post => post.status === "generated");
    if (generated.length) appendRedditLifeRecommendations(generated.map(recommendationForCandidate), { archivedAt: date, postPath: manifestRel }, path.join(repo, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH));
    writeStderr(`[reddit-life-wechat] archive=${date}: reused manifest (${existing.status}), generated=${generated.length}`);
    return { manifestPath: manifestRel, generatedPaths: generated.map(post => post.path!).filter(Boolean), status: existing.status };
  }
  const lifeArticlePath = taskPostRelPath("reddit-top20", date.replace(/$/, "-life"));
  const upstreamFile = path.join(repo, lifeArticlePath);
  if (!fs.existsSync(upstreamFile)) {
    const manifest: RedditLifeRunManifest = { version: 1, archiveDate: date, timeZone: "America/Los_Angeles", status: "upstream-empty", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, posts: [] };
    writeJson(manifestFile, manifest);
    writeStderr(`[reddit-life-wechat] archive=${date}: upstream life article missing at ${lifeArticlePath}; wrote upstream-empty manifest`);
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status };
  }
  const upstreamMarkdown = fs.readFileSync(upstreamFile, "utf8");
  writeArtifact(artifactsDir, "upstream-life.md", upstreamMarkdown);
  // 只取排名第一那帖：微信一天一篇，多写的稿子没有出口。
  const candidate = parseRedditLifeCandidates(upstreamMarkdown)[0];
  const description = parseRedditLifeDescription(upstreamMarkdown);
  const ledgerFile = path.join(repo, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH);
  const historical = loadRedditLifeRecommendationKeys(ledgerFile);
  const { body: _body, ...facts } = candidate;
  const duplicate = historical.has(recommendationForCandidate(candidate).key);
  writeStderr(`[reddit-life-wechat] archive=${date}: upstream=${lifeArticlePath}, selected=${candidate.postId}, duplicate=${duplicate}`);
  const dayDir = path.join(ROOT_REL, date);
  const rawSources = { upstreamLifeMarkdown: path.join(dayDir, "upstream-life.md") };
  let entry: Entry = { ...facts, status: "duplicate", reason: "already recommended" };
  if (!duplicate) {
    const label = `rank=${candidate.rank} post=${candidate.postId}`;
    const markdown = await fitWechatContentLimit(renderRedditLifeWechatMarkdown(candidate, description, date), repo, label);
    const relPath = path.join(ROOT_REL, date, `${String(candidate.rank).padStart(2, "0")}-${candidate.postId}.md`);
    entry = { ...facts, status: "generated", path: relPath, contentSha256: markdownSha256(markdown) };
    const target = path.join(repo, relPath);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, markdown, "utf8");
    writeStderr(`[reddit-life-wechat] ${label}: generated ${relPath} (${markdown.length} chars)`);
  }
  const manifest: RedditLifeRunManifest = { version: 1, archiveDate: date, timeZone: "America/Los_Angeles", status: "processed", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, rawSources, posts: [entry] };
  ensureDir(path.join(repo, dayDir));
  fs.writeFileSync(path.join(repo, rawSources.upstreamLifeMarkdown), upstreamMarkdown, "utf8");
  writeJson(manifestFile, manifest);
  if (entry.status === "generated") appendRedditLifeRecommendations([recommendationForCandidate(candidate)], { archivedAt: date, postPath: manifestRel }, ledgerFile);
  writeStderr(`[reddit-life-wechat] archive=${date}: complete status=${entry.status}`);
  return { manifestPath: manifestRel, generatedPaths: entry.path ? [entry.path] : [], status: manifest.status };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = archiveDate(stringArg(args, "date"), process.env.EVENT_SCHEDULE || "");
  const result = await generateRedditLifeWechat({
    repo: path.resolve(stringArg(args, "repo", repoRoot())),
    date,
    upstreamSha: stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || ""),
    workflowRun: stringArg(args, "workflow-run", process.env.GITHUB_RUN_ID || ""),
    artifactsDir: path.resolve(stringArg(args, "artifacts-dir", "reddit-life-wechat-artifacts")),
  });
  writeStdout(`${JSON.stringify({ date, ...result })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

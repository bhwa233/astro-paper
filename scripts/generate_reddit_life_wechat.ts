#!/usr/bin/env tsx
// 独立的 Reddit 人生微信归档编排：不进入 Astro 内容集合，也不重新选择 Reddit 榜单。
// 上游 life 文章的每帖正文已经是逐条故事的有序列表，这里只取排名第一的那帖，改标题、加页脚、收口长度。
// 整条管线没有模型调用：内容全部来自已归档的上游文章。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { dateStringInTimeZone, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import {
  countDroppableStories,
  dropTrailingStories,
  markdownSha256,
  parseRedditLifeCandidates,
  parseRedditLifeDescription,
  recommendationForCandidate,
  renderRedditLifeWechatMarkdown,
  REDDIT_LIFE_WECHAT_QR_FILE,
  REDDIT_LIFE_WECHAT_QR_TARGET,
  REDDIT_LIFE_WECHAT_TITLE_BRAND,
  type RedditLifeCandidate,
} from "./reddit_life_wechat_compose.ts";
import { REDDIT_LIFE_WECHAT_COVER_FILE, renderRedditLifeWechatCover } from "./reddit_life_wechat_cover.ts";
import { renderQrPng } from "./qr_code.ts";
import { appendRedditLifeRecommendations, loadRedditLifeRecommendationKeys, nextRedditLifeIssue, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH } from "./reddit_life_wechat_ledger.ts";
import { taskPostRelPath } from "./blog_tasks.ts";

const ROOT_REL = "data/reddit-life-wechat";
const MANIFEST_VERSION = 1;

type Entry = Omit<RedditLifeCandidate, "body"> & {
  status: "generated" | "duplicate" | "content-skipped";
  path?: string;
  contentSha256?: string;
  reason?: string;
  // 标题里的期号。写进 manifest 才能让重跑复用同一个号，而不是重新分配一个。
  // 引入期号之前归档的 manifest 没有这个字段，因此保持可选。
  issue?: number;
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

function gitOutput(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to verify the Reddit life committed handoff: ${detail}`);
  }
}

function assertCommittedHandoff(repo: string, upstreamSha: string): string {
  if (!/^[0-9a-f]{7,64}$/i.test(upstreamSha)) throw new Error(`invalid --upstream-sha: ${upstreamSha || "missing"}`);
  const expected = gitOutput(repo, ["rev-parse", "--verify", `${upstreamSha}^{commit}`]).toLowerCase();
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).toLowerCase();
  if (head !== expected) throw new Error(`Reddit life WeChat HEAD ${head} does not match --upstream-sha ${expected}`);
  return expected;
}

function assertCommittedPath(repo: string, relPath: string): void {
  const status = gitOutput(repo, ["status", "--porcelain", "--untracked-files=all", "--", relPath]);
  if (status) throw new Error(`Reddit life WeChat handoff path must match HEAD: ${relPath}`);
}

function archiveDate(input: string): string {
  if (input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error(`invalid archive date: ${input}`);
    return input;
  }
  // The only automatic caller is reddit-top20's daily cron. Preserve that task's Los Angeles business date.
  return dateStringInTimeZone(new Date(), "America/Los_Angeles");
}

function runRelPath(date: string): string {
  return path.join(ROOT_REL, date, "run.json");
}

function parseManifest(raw: unknown, file: string): RedditLifeRunManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid Reddit life WeChat run manifest: ${file}`);
  const value = raw as Partial<RedditLifeRunManifest>;
  if (
    value.version !== MANIFEST_VERSION ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.archiveDate || "") ||
    value.timeZone !== "America/Los_Angeles" ||
    (value.status !== "processed" && value.status !== "upstream-empty") ||
    !value.upstream ||
    !/^[0-9a-f]{7,64}$/i.test(value.upstream.generatedSha || "") ||
    !/^\d+$/.test(value.upstream.workflowRun || "") ||
    !value.upstream.lifeArticlePath ||
    !Array.isArray(value.posts)
  ) {
    throw new Error(`invalid Reddit life WeChat run manifest structure: ${file}`);
  }
  for (const [index, post] of value.posts.entries()) {
    if (
      !post ||
      post.rank !== index + 1 ||
      !post.postId ||
      !post.title ||
      !post.subreddit ||
      !post.permalink ||
      !["generated", "duplicate", "content-skipped"].includes(post.status) ||
      (post.status === "generated" && (!post.path || !post.contentSha256 || !post.issue))
    ) {
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

async function restoreGeneratedQrCodes(manifest: RedditLifeRunManifest, repo: string): Promise<void> {
  const directories = new Set(
    manifest.posts
      .filter(post => post.status === "generated")
      .map(post => path.dirname(path.join(repo, post.path!))),
  );
  for (const directory of directories) {
    ensureDir(directory);
    const qr = await renderQrPng(REDDIT_LIFE_WECHAT_QR_TARGET);
    const target = path.join(directory, REDDIT_LIFE_WECHAT_QR_FILE);
    fs.writeFileSync(target, qr);
    writeStderr(`[reddit-life-wechat] restored ${path.relative(repo, target)} (${qr.length} bytes)`);
  }
}

// 一帖的故事条数不可控，渲染出的 HTML 随时可能撞上微信 20000 字符上限，而上游无法预知渲染后的长度。
// 这里用渲染器本身做判定：能渲染就原样归档，撞限就从末尾删故事，二分找出最少的删除量。
// probeDir 必须是真稿最终落地的目录：astro-wechat 按 Markdown 所在目录解析相对资源路径，
// 探针放别处的话，稿子里那句 `ogImage: cover.png` 会在探针旁边找图，找不到就整个跑挂。
export async function fitWechatContentLimit(markdown: string, repo: string, label: string, probeDir: string): Promise<string> {
  const { openProject, prepareArticle } = await import("@lxw15337674/astro-wechat");
  const project = await openProject(repo, { root: repo });
  const probeFile = path.join(probeDir, `.content-limit-probe-${process.pid}.md`);
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

// 封面不该有能力弄挂一次归档：渲染器已经在失败时回落成"没有封面"，这里补上最后一段——
// 图渲出来了但 astro-wechat 仍然消化不了，就撤掉 ogImage 重来一次，稿子照常归档。
async function fitWithOptionalCover(
  candidate: RedditLifeCandidate,
  description: string,
  date: string,
  issue: number,
  coverFile: string,
  repo: string,
  label: string,
  probeDir: string,
): Promise<string> {
  try {
    return await fitWechatContentLimit(renderRedditLifeWechatMarkdown(candidate, description, date, issue, coverFile), repo, label, probeDir);
  } catch (error) {
    if (!coverFile) throw error;
    writeStderr(`WARN: [reddit-life-wechat] ${label}: dropping the cover after ${error instanceof Error ? error.message : String(error)}`);
    return fitWechatContentLimit(renderRedditLifeWechatMarkdown(candidate, description, date, issue), repo, label, probeDir);
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
  if (!/^\d+$/.test(workflowRun)) throw new Error("--upstream-workflow-run is required and must be a GitHub Actions run ID");
  upstreamSha = assertCommittedHandoff(repo, upstreamSha);
  const manifestRel = runRelPath(date);
  const manifestFile = path.join(repo, manifestRel);
  assertCommittedPath(repo, manifestRel);
  const existing = loadRedditLifeRunManifest(manifestFile);
  if (existing) {
    const generated = existing.posts.filter(post => post.status === "generated");
    if (generated.length) appendRedditLifeRecommendations(generated.map(recommendationForCandidate), { archivedAt: date, postPath: manifestRel }, path.join(repo, REDDIT_LIFE_WECHAT_LEDGER_REL_PATH));
    await restoreGeneratedQrCodes(existing, repo);
    writeStderr(`[reddit-life-wechat] archive=${date}: reused manifest (${existing.status}), generated=${generated.length}`);
    return { manifestPath: manifestRel, generatedPaths: generated.map(post => post.path!).filter(Boolean), status: existing.status };
  }
  const lifeArticlePath = taskPostRelPath("reddit-top20", date.replace(/$/, "-life"));
  assertCommittedPath(repo, lifeArticlePath);
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
    // 期号只在真的要出稿时分配：重复帖不出稿，也就不该占号。
    const issue = nextRedditLifeIssue(ledgerFile);
    const label = `rank=${candidate.rank} post=${candidate.postId} issue=${issue}`;
    const relPath = path.join(ROOT_REL, date, `${String(candidate.rank).padStart(2, "0")}-${candidate.postId}.md`);
    const target = path.join(repo, relPath);
    ensureDir(path.dirname(target));
    // 封面先落盘再写稿：ogImage 只有在图确实存在时才敢写，否则 astro-wechat 解析不到文件会直接报错，
    // 那比回落到 defaultCover 糟得多。渲染失败返回 null，稿子照常出，只是没有专属封面。
    const cover = await renderRedditLifeWechatCover(candidate.title, REDDIT_LIFE_WECHAT_TITLE_BRAND, issue);
    if (cover) {
      fs.writeFileSync(path.join(path.dirname(target), REDDIT_LIFE_WECHAT_COVER_FILE), cover);
      writeStderr(`[reddit-life-wechat] ${label}: rendered ${REDDIT_LIFE_WECHAT_COVER_FILE} (${cover.length} bytes)`);
    }
    // 页脚卡片无条件引用 qr.png，所以这张图必须存在，失败就得让整次归档失败——
    // 写出一篇引用了不存在资源的稿子，只会把问题推到发布那一步才炸。
    const qr = await renderQrPng(REDDIT_LIFE_WECHAT_QR_TARGET);
    fs.writeFileSync(path.join(path.dirname(target), REDDIT_LIFE_WECHAT_QR_FILE), qr);
    writeStderr(`[reddit-life-wechat] ${label}: rendered ${REDDIT_LIFE_WECHAT_QR_FILE} (${qr.length} bytes)`);
    const markdown = await fitWithOptionalCover(candidate, description, date, issue, cover ? REDDIT_LIFE_WECHAT_COVER_FILE : "", repo, label, path.dirname(target));
    entry = { ...facts, status: "generated", path: relPath, contentSha256: markdownSha256(markdown), issue };
    fs.writeFileSync(target, markdown, "utf8");
    writeStderr(`[reddit-life-wechat] ${label}: generated ${relPath} (${markdown.length} chars)`);
  }
  const manifest: RedditLifeRunManifest = { version: 1, archiveDate: date, timeZone: "America/Los_Angeles", status: "processed", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, rawSources, posts: [entry] };
  ensureDir(path.join(repo, dayDir));
  fs.writeFileSync(path.join(repo, rawSources.upstreamLifeMarkdown), upstreamMarkdown, "utf8");
  writeJson(manifestFile, manifest);
  if (entry.status === "generated") appendRedditLifeRecommendations([recommendationForCandidate({ ...candidate, issue: entry.issue })], { archivedAt: date, postPath: manifestRel }, ledgerFile);
  writeStderr(`[reddit-life-wechat] archive=${date}: complete status=${entry.status}`);
  return { manifestPath: manifestRel, generatedPaths: entry.path ? [entry.path] : [], status: manifest.status };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = archiveDate(stringArg(args, "date"));
  const result = await generateRedditLifeWechat({
    repo: path.resolve(stringArg(args, "repo", repoRoot())),
    date,
    upstreamSha: stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || ""),
    workflowRun: stringArg(args, "upstream-workflow-run", process.env.UPSTREAM_WORKFLOW_RUN || ""),
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

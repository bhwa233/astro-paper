#!/usr/bin/env tsx
// 微博热搜微信稿编排：只读取父任务已经提交的站点文章，做纯规则转换并归档。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { taskPostRelPath } from "./blog_tasks.ts";
import { renderQrPng } from "./qr_code.ts";
import {
  parseWeiboTrendingArticle,
  parseWeiboTrendingArticleTitle,
  renderWeiboTrendingWechatMarkdown,
  weiboTrendingArticleUrl,
  weiboTrendingWechatDescription,
  weiboTrendingWechatFooter,
  WEIBO_TRENDING_WECHAT_ITEM_LIMIT,
  WEIBO_TRENDING_WECHAT_QR_FILE,
  WEIBO_TRENDING_WECHAT_SHOW_QR,
  type WeiboTrendingWechatItem,
} from "./weibo_trending_wechat_compose.ts";
import { renderWeiboTrendingWechatCover, WEIBO_TRENDING_WECHAT_COVER_FILE, WEIBO_TRENDING_WECHAT_COVER_ITEM_LIMIT } from "./weibo_trending_wechat_cover.ts";

const ROOT_REL = "data/weibo-trending-wechat";
const MANIFEST_VERSION = 1;

type ArchivedFile = { path: string; sha256: string };

export type WeiboTrendingWechatRunManifest = {
  version: 1;
  archiveDate: string;
  timeZone: "Asia/Shanghai";
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; workflowRun: string; articlePath: string };
  rawSources?: { upstreamMarkdown: ArchivedFile };
  draft?: ArchivedFile & {
    itemCount: number;
    truncatedItemCount: number;
    cover?: ArchivedFile;
  };
};

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function gitOutput(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw new Error(`failed to verify the Weibo trending committed handoff: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertCommittedHandoff(repo: string, upstreamSha: string): string {
  if (!/^[0-9a-f]{7,64}$/i.test(upstreamSha)) throw new Error(`invalid --upstream-sha: ${upstreamSha || "missing"}`);
  const expected = gitOutput(repo, ["rev-parse", "--verify", `${upstreamSha}^{commit}`]).toLowerCase();
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).toLowerCase();
  if (head !== expected) throw new Error(`Weibo trending WeChat HEAD ${head} does not match --upstream-sha ${expected}`);
  return expected;
}

function assertCommittedPath(repo: string, relPath: string): void {
  const status = gitOutput(repo, ["status", "--porcelain", "--untracked-files=all", "--", relPath]);
  if (status) throw new Error(`Weibo trending WeChat handoff path must match HEAD: ${relPath}`);
}

function archiveDate(input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error(`--date is required and must be YYYY-MM-DD: ${input || "missing"}`);
  return input;
}

function runRelPath(date: string): string {
  return path.join(ROOT_REL, date, "run.json");
}

function parseArchivedFile(raw: unknown): raw is ArchivedFile {
  const value = raw as Partial<ArchivedFile> | null;
  return Boolean(value && typeof value.path === "string" && value.path && typeof value.sha256 === "string" && /^[0-9a-f]{64}$/i.test(value.sha256));
}

function parseManifest(raw: unknown, file: string): WeiboTrendingWechatRunManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid Weibo trending WeChat run manifest: ${file}`);
  const value = raw as Partial<WeiboTrendingWechatRunManifest>;
  if (
    value.version !== MANIFEST_VERSION ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.archiveDate || "") ||
    value.timeZone !== "Asia/Shanghai" ||
    (value.status !== "processed" && value.status !== "upstream-empty") ||
    !value.upstream ||
    !/^[0-9a-f]{7,64}$/i.test(value.upstream.generatedSha || "") ||
    !/^\d+$/.test(value.upstream.workflowRun || "") ||
    !value.upstream.articlePath
  ) {
    throw new Error(`invalid Weibo trending WeChat run manifest structure: ${file}`);
  }
  if (value.status === "upstream-empty") {
    if (value.rawSources || value.draft) throw new Error(`invalid Weibo trending WeChat upstream-empty manifest: ${file}`);
  } else if (
    !value.rawSources ||
    !parseArchivedFile(value.rawSources.upstreamMarkdown) ||
    !value.draft ||
    !parseArchivedFile(value.draft) ||
    !Number.isInteger(value.draft.itemCount) ||
    value.draft.itemCount < 1 ||
    !Number.isInteger(value.draft.truncatedItemCount) ||
    value.draft.truncatedItemCount < 0 ||
    (value.draft.cover !== undefined && !parseArchivedFile(value.draft.cover))
  ) {
    throw new Error(`invalid Weibo trending WeChat processed manifest: ${file}`);
  }
  return value as WeiboTrendingWechatRunManifest;
}

export function loadWeiboTrendingWechatRunManifest(file: string): WeiboTrendingWechatRunManifest | null {
  if (!fs.existsSync(file)) return null;
  try {
    return parseManifest(JSON.parse(fs.readFileSync(file, "utf8")), file);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid Weibo trending WeChat")) throw error;
    throw new Error(`invalid Weibo trending WeChat run manifest: ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeTextArtifact(dir: string, name: string, content: string): void {
  if (!dir) return;
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, name), content, "utf8");
}

function writeBinaryArtifact(dir: string, name: string, content: Buffer): void {
  if (!dir) return;
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, name), content);
}

function verifyArchivedFile(repo: string, archived: ArchivedFile, label: string): void {
  assertCommittedPath(repo, archived.path);
  const file = path.join(repo, archived.path);
  if (!fs.existsSync(file)) throw new Error(`Weibo trending WeChat manifest ${label} is missing: ${archived.path}`);
  if (sha256(fs.readFileSync(file)) !== archived.sha256) throw new Error(`Weibo trending WeChat manifest ${label} hash does not match: ${archived.path}`);
}

// 页脚卡片无条件引用 qr.png，开着二维码时这张图必须存在，包括复用已有 manifest 的同日重跑。
async function restoreQr(repo: string, draftPath: string, artifactsDir: string, articleUrl: string): Promise<void> {
  if (!WEIBO_TRENDING_WECHAT_SHOW_QR) return;
  const qr = await renderQrPng(articleUrl);
  const qrFile = path.join(repo, path.dirname(draftPath), WEIBO_TRENDING_WECHAT_QR_FILE);
  ensureDir(path.dirname(qrFile));
  fs.writeFileSync(qrFile, qr);
  writeBinaryArtifact(artifactsDir, WEIBO_TRENDING_WECHAT_QR_FILE, qr);
  writeStderr(`[weibo-trending-wechat] restored ${path.relative(repo, qrFile)} (${qr.length} bytes)`);
}

async function markdownFits(markdown: string, repo: string, probeFile: string): Promise<boolean> {
  const { openProject, prepareArticle } = await import("./wechat/src/index.ts");
  const project = await openProject(repo, { root: repo });
  fs.writeFileSync(probeFile, markdown, "utf8");
  try {
    await prepareArticle(probeFile, project);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "content-too-long" || code === "content-too-large") return false;
    throw error;
  }
}

async function fitWechatContentLimit({
  items,
  render,
  repo,
  probeDir,
}: {
  items: WeiboTrendingWechatItem[];
  render: (included: WeiboTrendingWechatItem[]) => string;
  repo: string;
  probeDir: string;
}): Promise<{ markdown: string; includedItems: WeiboTrendingWechatItem[] }> {
  const probeFile = path.join(probeDir, `.content-limit-probe-${process.pid}.md`);
  ensureDir(probeDir);
  const fits = (included: WeiboTrendingWechatItem[]) => markdownFits(render(included), repo, probeFile);
  try {
    if (await fits(items)) return { markdown: render(items), includedItems: items };
    let low = 1;
    let high = items.length - 1;
    let fittedCount = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (await fits(items.slice(0, middle))) {
        fittedCount = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (!fittedCount) throw new Error("Weibo trending WeChat article still exceeds the content limit with a single item");
    const includedItems = items.slice(0, fittedCount);
    writeStderr(`WARN: [weibo-trending-wechat] dropped ${items.length - fittedCount} trailing item(s) to fit the WeChat content limit`);
    return { markdown: render(includedItems), includedItems };
  } finally {
    fs.rmSync(probeFile, { force: true });
  }
}

async function fitWithOptionalCover({
  items,
  archiveDate,
  title,
  articleUrl,
  footer,
  coverFile,
  repo,
  probeDir,
}: {
  items: WeiboTrendingWechatItem[];
  archiveDate: string;
  title: string;
  articleUrl: string;
  footer: string;
  coverFile: string;
  repo: string;
  probeDir: string;
}): Promise<{ markdown: string; includedItems: WeiboTrendingWechatItem[]; coverUsed: boolean }> {
  const fit = (cover: string) =>
    fitWechatContentLimit({
      items,
      repo,
      probeDir,
      render: included =>
        renderWeiboTrendingWechatMarkdown({
          items: included,
          archiveDate,
          title,
          description: weiboTrendingWechatDescription(included),
          articleUrl,
          footer,
          coverFile: cover,
        }),
    });
  try {
    return { ...(await fit(coverFile)), coverUsed: Boolean(coverFile) };
  } catch (error) {
    if (!coverFile) throw error;
    writeStderr(`WARN: [weibo-trending-wechat] dropping the cover after ${error instanceof Error ? error.message : String(error)}`);
    return { ...(await fit("")), coverUsed: false };
  }
}

export async function generateWeiboTrendingWechat({
  repo = repoRoot(),
  date,
  upstreamSha,
  workflowRun,
  artifactsDir = "",
}: {
  repo?: string;
  date: string;
  upstreamSha: string;
  workflowRun: string;
  artifactsDir?: string;
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: WeiboTrendingWechatRunManifest["status"] }> {
  date = archiveDate(date);
  if (!upstreamSha) throw new Error("--upstream-sha is required; Weibo trending WeChat must read the committed parent handoff");
  if (!/^\d+$/.test(workflowRun)) throw new Error("--upstream-workflow-run is required and must be a GitHub Actions run ID");
  upstreamSha = assertCommittedHandoff(repo, upstreamSha);

  const manifestRel = runRelPath(date);
  const manifestFile = path.join(repo, manifestRel);
  const articlePath = taskPostRelPath("weibo-trending", date);
  const upstreamFile = path.join(repo, articlePath);
  assertCommittedPath(repo, manifestRel);
  assertCommittedPath(repo, articlePath);
  const existing = loadWeiboTrendingWechatRunManifest(manifestFile);
  if (existing) {
    if (existing.archiveDate !== date) throw new Error(`Weibo trending WeChat manifest date does not match its directory: ${manifestRel}`);
    // 空上游只是当次父任务的快照，不能挡住同一天的人工补跑：新 handoff 已经带来文章时，
    // 用它替换旧的空 manifest；仍然缺文时才保持幂等复用。
    if (existing.status === "upstream-empty" && fs.existsSync(upstreamFile)) {
      writeStderr(`[weibo-trending-wechat] archive=${date}: upstream article is now available; replacing upstream-empty manifest\n`);
    } else {
      if (existing.status === "processed") {
      const expectedDayDir = path.join(ROOT_REL, date);
      if (
        existing.rawSources!.upstreamMarkdown.path !== path.join(expectedDayDir, "upstream.md") ||
        existing.draft!.path !== path.join(expectedDayDir, "01.md") ||
        existing.draft!.itemCount + existing.draft!.truncatedItemCount > WEIBO_TRENDING_WECHAT_ITEM_LIMIT ||
        (existing.draft!.cover && existing.draft!.cover!.path !== path.join(expectedDayDir, WEIBO_TRENDING_WECHAT_COVER_FILE))
      ) {
        throw new Error(`invalid Weibo trending WeChat archive paths or counts: ${manifestRel}`);
      }
      verifyArchivedFile(repo, existing.rawSources!.upstreamMarkdown, "upstream snapshot");
      verifyArchivedFile(repo, existing.draft!, "draft");
      if (existing.draft!.cover) verifyArchivedFile(repo, existing.draft!.cover!, "cover");
      await restoreQr(repo, existing.draft!.path, artifactsDir, weiboTrendingArticleUrl(existing.upstream.articlePath));
      }
      writeStderr(`[weibo-trending-wechat] archive=${date}: reused manifest (${existing.status})`);
      return { manifestPath: manifestRel, generatedPaths: existing.draft ? [existing.draft.path] : [], status: existing.status };
    }
  }

  if (!fs.existsSync(upstreamFile)) {
    const manifest: WeiboTrendingWechatRunManifest = {
      version: 1,
      archiveDate: date,
      timeZone: "Asia/Shanghai",
      status: "upstream-empty",
      upstream: { generatedSha: upstreamSha, workflowRun, articlePath },
    };
    writeJson(manifestFile, manifest);
    writeStderr(`[weibo-trending-wechat] archive=${date}: upstream article missing at ${articlePath}; wrote upstream-empty manifest`);
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status };
  }

  const upstreamMarkdown = fs.readFileSync(upstreamFile, "utf8");
  const allItems = parseWeiboTrendingArticle(upstreamMarkdown);
  const articleTitle = parseWeiboTrendingArticleTitle(upstreamMarkdown);
  const selectedItems = allItems.slice(0, WEIBO_TRENDING_WECHAT_ITEM_LIMIT);
  const dayDir = path.join(ROOT_REL, date);
  const draftRel = path.join(dayDir, "01.md");
  const draftFile = path.join(repo, draftRel);
  const upstreamRel = path.join(dayDir, "upstream.md");
  const coverRel = path.join(dayDir, WEIBO_TRENDING_WECHAT_COVER_FILE);
  ensureDir(path.dirname(draftFile));

  const articleUrl = weiboTrendingArticleUrl(articlePath);
  const cover = await renderWeiboTrendingWechatCover(
    selectedItems.slice(0, WEIBO_TRENDING_WECHAT_COVER_ITEM_LIMIT).map(item => item.title),
    date,
  );
  if (cover) {
    fs.writeFileSync(path.join(repo, coverRel), cover);
    writeStderr(`[weibo-trending-wechat] rendered ${coverRel} (${cover.length} bytes)`);
  }
  await restoreQr(repo, draftRel, artifactsDir, articleUrl);

  const fitted = await fitWithOptionalCover({
    items: selectedItems,
    archiveDate: date,
    title: articleTitle,
    articleUrl,
    footer: weiboTrendingWechatFooter(articleUrl),
    coverFile: cover ? WEIBO_TRENDING_WECHAT_COVER_FILE : "",
    repo,
    probeDir: path.dirname(draftFile),
  });
  if (cover && !fitted.coverUsed) fs.rmSync(path.join(repo, coverRel), { force: true });
  fs.writeFileSync(draftFile, fitted.markdown, "utf8");
  fs.writeFileSync(path.join(repo, upstreamRel), upstreamMarkdown, "utf8");
  writeTextArtifact(artifactsDir, "upstream.md", upstreamMarkdown);

  const draft: NonNullable<WeiboTrendingWechatRunManifest["draft"]> = {
    path: draftRel,
    sha256: sha256(fitted.markdown),
    itemCount: fitted.includedItems.length,
    truncatedItemCount: selectedItems.length - fitted.includedItems.length,
  };
  if (cover && fitted.coverUsed) draft.cover = { path: coverRel, sha256: sha256(cover) };
  const manifest: WeiboTrendingWechatRunManifest = {
    version: 1,
    archiveDate: date,
    timeZone: "Asia/Shanghai",
    status: "processed",
    upstream: { generatedSha: upstreamSha, workflowRun, articlePath },
    rawSources: { upstreamMarkdown: { path: upstreamRel, sha256: sha256(upstreamMarkdown) } },
    draft,
  };
  writeJson(manifestFile, manifest);
  writeStderr(
    `[weibo-trending-wechat] archive=${date}: complete items=${draft.itemCount}/${selectedItems.length} truncated=${draft.truncatedItemCount} draft=${draftRel}`,
  );
  return { manifestPath: manifestRel, generatedPaths: [draftRel], status: manifest.status };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = archiveDate(stringArg(args, "date"));
  const result = await generateWeiboTrendingWechat({
    repo: path.resolve(stringArg(args, "repo", repoRoot())),
    date,
    upstreamSha: stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || ""),
    workflowRun: stringArg(args, "upstream-workflow-run", process.env.UPSTREAM_WORKFLOW_RUN || ""),
    artifactsDir: path.resolve(stringArg(args, "artifacts-dir", "weibo-trending-wechat-artifacts")),
  });
  writeStdout(`${JSON.stringify({ date, ...result })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

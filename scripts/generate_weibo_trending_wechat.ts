#!/usr/bin/env tsx
// 微博热搜微信稿编排：只读取父任务已经提交的站点文章，做纯规则转换并归档。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { taskPostRelPath } from "./blog_tasks.ts";
import {
  parseWeiboTrendingArticle,
  parseWeiboTrendingArticleTitle,
  parseWeiboTrendingArticleWechatTitle,
  renderWeiboTrendingWechatMarkdown,
  weiboTrendingArticleUrl,
  weiboTrendingWechatDescription,
  weiboTrendingWechatCardFile,
  WEIBO_TRENDING_WECHAT_ITEM_LIMIT,
} from "./weibo_trending_wechat_compose.ts";
import { renderWeiboTrendingWechatCards } from "./weibo_trending_wechat_cards.ts";

const ROOT_REL = "data/weibo-trending-wechat";
const MANIFEST_VERSION = 2;
const LEGACY_MANIFEST_VERSION = 1;
const LEGACY_ITEM_LIMIT = 30;

type ArchivedFile = { path: string; sha256: string };

export type WeiboTrendingWechatRunManifest = {
  version: 1 | 2;
  archiveDate: string;
  timeZone: "Asia/Shanghai";
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; workflowRun: string; articlePath: string };
  rawSources?: { upstreamMarkdown: ArchivedFile };
  draft?: ArchivedFile & {
    itemCount: number;
    truncatedItemCount: number;
    /** v1 ordinary article cover. */
    cover?: ArchivedFile;
    /** v2 image-message cards, in image_list order. */
    cards?: ArchivedFile[];
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
    (value.version !== LEGACY_MANIFEST_VERSION && value.version !== MANIFEST_VERSION) ||
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
    (value.draft.cover !== undefined && !parseArchivedFile(value.draft.cover)) ||
    (value.draft.cards !== undefined && (!Array.isArray(value.draft.cards) || !value.draft.cards.every(parseArchivedFile)))
  ) {
    throw new Error(`invalid Weibo trending WeChat processed manifest: ${file}`);
  }
  if (value.status === "processed") {
    const draft = value.draft!;
    if (value.version === LEGACY_MANIFEST_VERSION) {
      if (draft.cards || draft.itemCount + draft.truncatedItemCount > LEGACY_ITEM_LIMIT) {
        throw new Error(`invalid legacy Weibo trending WeChat draft: ${file}`);
      }
    } else if (
      draft.cover ||
      draft.itemCount > WEIBO_TRENDING_WECHAT_ITEM_LIMIT ||
      draft.itemCount + draft.truncatedItemCount > LEGACY_ITEM_LIMIT ||
      draft.cards?.length !== draft.itemCount + 1
    ) {
      throw new Error(`invalid image Weibo trending WeChat draft: ${file}`);
    }
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

export function shouldRebuildWeiboTrendingWechatManifest(
  existing: Pick<WeiboTrendingWechatRunManifest, "status" | "upstream">,
  upstreamSha: string,
  upstreamArticleAvailable: boolean,
): boolean {
  if (existing.status === "upstream-empty") return upstreamArticleAvailable;
  // A processed archive is tied to the parent's committed handoff. Reusing it after the
  // handoff changes leaves stale rendered Markdown in place, hiding changes such as syncId.
  return existing.upstream.generatedSha !== upstreamSha;
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

function verifyArchivedFile(repo: string, archived: ArchivedFile, label: string): void {
  assertCommittedPath(repo, archived.path);
  const file = path.join(repo, archived.path);
  if (!fs.existsSync(file)) throw new Error(`Weibo trending WeChat manifest ${label} is missing: ${archived.path}`);
  if (sha256(fs.readFileSync(file)) !== archived.sha256) throw new Error(`Weibo trending WeChat manifest ${label} hash does not match: ${archived.path}`);
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
    if (!shouldRebuildWeiboTrendingWechatManifest(existing, upstreamSha, fs.existsSync(upstreamFile))) {
      if (existing.status === "processed") {
        const expectedDayDir = path.join(ROOT_REL, date);
        if (
          existing.rawSources!.upstreamMarkdown.path !== path.join(expectedDayDir, "upstream.md") ||
          existing.draft!.path !== path.join(expectedDayDir, "01.md") ||
          (existing.version === LEGACY_MANIFEST_VERSION && existing.draft!.cover && existing.draft!.cover!.path !== path.join(expectedDayDir, "cover.png")) ||
          (existing.version === MANIFEST_VERSION && existing.draft!.cards!.some((card, index) => card.path !== path.join(expectedDayDir, weiboTrendingWechatCardFile(index))))
        ) {
          throw new Error(`invalid Weibo trending WeChat archive paths or counts: ${manifestRel}`);
        }
        verifyArchivedFile(repo, existing.rawSources!.upstreamMarkdown, "upstream snapshot");
        verifyArchivedFile(repo, existing.draft!, "draft");
        if (existing.draft!.cover) verifyArchivedFile(repo, existing.draft!.cover!, "cover");
        for (const [index, card] of (existing.draft!.cards ?? []).entries()) verifyArchivedFile(repo, card, `card ${index}`);
      }
      writeStderr(`[weibo-trending-wechat] archive=${date}: reused manifest (${existing.status})`);
      return { manifestPath: manifestRel, generatedPaths: existing.draft ? [existing.draft.path] : [], status: existing.status };
    }
    if (existing.status === "upstream-empty") {
      writeStderr(`[weibo-trending-wechat] archive=${date}: upstream article is now available; replacing upstream-empty manifest`);
    } else {
      writeStderr(`[weibo-trending-wechat] archive=${date}: upstream handoff changed; rebuilding processed manifest`);
    }
  }

  if (!fs.existsSync(upstreamFile)) {
    const manifest: WeiboTrendingWechatRunManifest = {
      version: MANIFEST_VERSION,
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
  parseWeiboTrendingArticleTitle(upstreamMarkdown);
  const wechatTitle = parseWeiboTrendingArticleWechatTitle(upstreamMarkdown);
  const selectedItems = allItems.slice(0, WEIBO_TRENDING_WECHAT_ITEM_LIMIT);
  const dayDir = path.join(ROOT_REL, date);
  const draftRel = path.join(dayDir, "01.md");
  const draftFile = path.join(repo, draftRel);
  const upstreamRel = path.join(dayDir, "upstream.md");
  ensureDir(path.dirname(draftFile));

  const articleUrl = weiboTrendingArticleUrl(articlePath);
  const cards = await renderWeiboTrendingWechatCards(date, selectedItems);
  if (cards.length !== selectedItems.length + 1) {
    throw new Error(`Weibo trending WeChat rendered ${cards.length} cards for ${selectedItems.length} items`);
  }
  // A changed parent handoff rebuilds the day in place. Render first, then remove only files
  // recorded by the old manifest so a failed render cannot damage the archived handoff.
  if (existing?.status === "processed") {
    if (existing.draft!.cover) fs.rmSync(path.join(repo, existing.draft!.cover.path), { force: true });
    for (const card of existing.draft!.cards ?? []) fs.rmSync(path.join(repo, card.path), { force: true });
  }
  const archivedCards = cards.map((card, index) => {
    const cardRel = path.join(dayDir, weiboTrendingWechatCardFile(index));
    fs.writeFileSync(path.join(repo, cardRel), card);
    writeStderr(`[weibo-trending-wechat] rendered ${cardRel} (${card.length} bytes)`);
    return { path: cardRel, sha256: sha256(card) };
  });
  const markdown = renderWeiboTrendingWechatMarkdown({
    itemCount: selectedItems.length,
    archiveDate: date,
    title: wechatTitle,
    description: weiboTrendingWechatDescription(selectedItems),
    articleUrl,
  });
  fs.writeFileSync(draftFile, markdown, "utf8");
  fs.writeFileSync(path.join(repo, upstreamRel), upstreamMarkdown, "utf8");
  writeTextArtifact(artifactsDir, "upstream.md", upstreamMarkdown);

  const draft: NonNullable<WeiboTrendingWechatRunManifest["draft"]> = {
    path: draftRel,
    sha256: sha256(markdown),
    itemCount: selectedItems.length,
    truncatedItemCount: allItems.length - selectedItems.length,
    cards: archivedCards,
  };
  const manifest: WeiboTrendingWechatRunManifest = {
    version: MANIFEST_VERSION,
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

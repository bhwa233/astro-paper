#!/usr/bin/env tsx
// 微博热搜微信稿编排：只读取父任务已经提交的站点文章，做纯规则转换并归档。
//
// 卡片 PNG 不进仓库：manifest 的 `release` 段记录它们在 GitHub Release 里的资产名与哈希，
// workflow 在提交 run.json 之前上传，微信同步前再按 manifest 放回原位（见 release_assets.ts）。
import fs from "node:fs";
import path from "node:path";
import { booleanArg, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { taskPostRelPath } from "./blog_tasks.ts";
import {
  assertCommittedHandoff,
  assertCommittedPath,
  isArchivedFile,
  isArchiveDate,
  loadRunManifest,
  sha256,
  untrackPaths,
  verifyArchivedFile,
  writeJson,
  writeTextArtifact,
  type ArchivedFile,
} from "./committed_handoff.ts";
import { buildReleaseManifest, isReleaseManifest, type ReleaseManifest } from "./release_assets.ts";
import {
  parseWeiboTrendingArticle,
  parseWeiboTrendingArticleDescription,
  parseWeiboTrendingArticleTitle,
  parseWeiboTrendingArticleWechatTitle,
  renderWeiboTrendingWechatMarkdown,
  weiboTrendingArticleUrl,
  weiboTrendingWechatCardFile,
  WEIBO_TRENDING_WECHAT_ITEM_LIMIT,
} from "./weibo_trending_wechat_compose.ts";
import { renderWeiboTrendingWechatCards } from "./weibo_trending_wechat_cards.ts";

const LABEL = "Weibo trending WeChat";
const ROOT_REL = "data/weibo-trending-wechat";
// v1 普通图文；v2 图片消息、卡片提交进仓库；v3 卡片改走 Release。
const MANIFEST_VERSION = 3;
const COMMITTED_CARDS_VERSION = 2;
const LEGACY_MANIFEST_VERSION = 1;
const LEGACY_ITEM_LIMIT = 30;

export function weiboTrendingWechatReleaseTag(date: string): string {
  return `weibo-trending-wechat-${date}`;
}

export type WeiboTrendingWechatRunManifest = {
  version: 1 | 2 | 3;
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
    /** v2+ image-message cards, in image_list order. */
    cards?: ArchivedFile[];
  };
  /** v3：卡片在 Release 里，不在仓库里。 */
  release?: ReleaseManifest;
};

function archiveDate(input: string): string {
  if (!isArchiveDate(input)) throw new Error(`--date is required and must be YYYY-MM-DD: ${input || "missing"}`);
  return input;
}

function runRelPath(date: string): string {
  return path.join(ROOT_REL, date, "run.json");
}

function parseManifest(raw: unknown, file: string): WeiboTrendingWechatRunManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid ${LABEL} run manifest: ${file}`);
  const value = raw as Partial<WeiboTrendingWechatRunManifest>;
  if (
    (value.version !== LEGACY_MANIFEST_VERSION && value.version !== COMMITTED_CARDS_VERSION && value.version !== MANIFEST_VERSION) ||
    !isArchiveDate(value.archiveDate || "") ||
    value.timeZone !== "Asia/Shanghai" ||
    (value.status !== "processed" && value.status !== "upstream-empty") ||
    !value.upstream ||
    !/^[0-9a-f]{7,64}$/i.test(value.upstream.generatedSha || "") ||
    !/^\d+$/.test(value.upstream.workflowRun || "") ||
    !value.upstream.articlePath
  ) {
    throw new Error(`invalid ${LABEL} run manifest structure: ${file}`);
  }
  if (value.status === "upstream-empty") {
    if (value.rawSources || value.draft || value.release) throw new Error(`invalid ${LABEL} upstream-empty manifest: ${file}`);
  } else if (
    !value.rawSources ||
    !isArchivedFile(value.rawSources.upstreamMarkdown) ||
    !value.draft ||
    !isArchivedFile(value.draft) ||
    !Number.isInteger(value.draft.itemCount) ||
    value.draft.itemCount < 1 ||
    !Number.isInteger(value.draft.truncatedItemCount) ||
    value.draft.truncatedItemCount < 0 ||
    (value.draft.cover !== undefined && !isArchivedFile(value.draft.cover)) ||
    (value.draft.cards !== undefined && (!Array.isArray(value.draft.cards) || !value.draft.cards.every(isArchivedFile)))
  ) {
    throw new Error(`invalid ${LABEL} processed manifest: ${file}`);
  }
  if (value.status === "processed") {
    const draft = value.draft!;
    if (value.version === LEGACY_MANIFEST_VERSION) {
      if (draft.cards || value.release || draft.itemCount + draft.truncatedItemCount > LEGACY_ITEM_LIMIT) {
        throw new Error(`invalid legacy ${LABEL} draft: ${file}`);
      }
    } else if (draft.cover || draft.itemCount > WEIBO_TRENDING_WECHAT_ITEM_LIMIT || draft.cards?.length !== draft.itemCount + 1) {
      throw new Error(`invalid image ${LABEL} draft: ${file}`);
    } else if (value.version === COMMITTED_CARDS_VERSION ? value.release !== undefined : !isReleaseManifest(value.release) || value.release.tag !== weiboTrendingWechatReleaseTag(value.archiveDate!) || value.release.assets.length !== draft.cards!.length) {
      throw new Error(`invalid ${LABEL} release section: ${file}`);
    }
  }
  return value as WeiboTrendingWechatRunManifest;
}

export function loadWeiboTrendingWechatRunManifest(file: string): WeiboTrendingWechatRunManifest | null {
  return loadRunManifest(file, LABEL, parseManifest);
}

export function shouldRebuildWeiboTrendingWechatManifest(
  existing: Pick<WeiboTrendingWechatRunManifest, "status" | "upstream">,
  upstreamSha: string,
  upstreamArticleAvailable: boolean,
  force = false,
): boolean {
  if (force) return true;
  if (existing.status === "upstream-empty") return upstreamArticleAvailable;
  // A processed archive is tied to the parent's committed handoff. Reusing it after the
  // handoff changes leaves stale rendered Markdown in place, hiding changes such as syncId.
  return existing.upstream.generatedSha !== upstreamSha;
}

export async function generateWeiboTrendingWechat({
  repo = repoRoot(),
  date,
  upstreamSha,
  workflowRun,
  artifactsDir = "",
  force = false,
}: {
  repo?: string;
  date: string;
  upstreamSha: string;
  workflowRun: string;
  artifactsDir?: string;
  force?: boolean;
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: WeiboTrendingWechatRunManifest["status"]; rendered: boolean }> {
  date = archiveDate(date);
  if (!upstreamSha) throw new Error("--upstream-sha is required; Weibo trending WeChat must read the committed parent handoff");
  if (!/^\d+$/.test(workflowRun)) throw new Error("--upstream-workflow-run is required and must be a GitHub Actions run ID");
  upstreamSha = assertCommittedHandoff(repo, upstreamSha, LABEL);

  const manifestRel = runRelPath(date);
  const manifestFile = path.join(repo, manifestRel);
  const articlePath = taskPostRelPath("weibo-trending", date);
  const upstreamFile = path.join(repo, articlePath);
  assertCommittedPath(repo, manifestRel, LABEL);
  assertCommittedPath(repo, articlePath, LABEL);
  const existing = loadWeiboTrendingWechatRunManifest(manifestFile);
  if (existing) {
    if (existing.archiveDate !== date) throw new Error(`Weibo trending WeChat manifest date does not match its directory: ${manifestRel}`);
    if (!shouldRebuildWeiboTrendingWechatManifest(existing, upstreamSha, fs.existsSync(upstreamFile), force)) {
      if (existing.status === "processed") {
        const expectedDayDir = path.join(ROOT_REL, date);
        if (
          existing.rawSources!.upstreamMarkdown.path !== path.join(expectedDayDir, "upstream.md") ||
          existing.draft!.path !== path.join(expectedDayDir, "01.md") ||
          (existing.version === LEGACY_MANIFEST_VERSION && existing.draft!.cover && existing.draft!.cover!.path !== path.join(expectedDayDir, "cover.png")) ||
          (existing.version !== LEGACY_MANIFEST_VERSION && existing.draft!.cards!.some((card, index) => card.path !== path.join(expectedDayDir, weiboTrendingWechatCardFile(index))))
        ) {
          throw new Error(`invalid Weibo trending WeChat archive paths or counts: ${manifestRel}`);
        }
        verifyArchivedFile(repo, existing.rawSources!.upstreamMarkdown, LABEL, "upstream snapshot");
        verifyArchivedFile(repo, existing.draft!, LABEL, "draft");
        if (existing.draft!.cover) verifyArchivedFile(repo, existing.draft!.cover!, LABEL, "cover");
        // v2 的卡片提交在仓库里，照常核对；v3 的卡片不在仓库里，同步 job 从 Release 放回时逐张核对哈希。
        if (existing.version === COMMITTED_CARDS_VERSION) {
          for (const [index, card] of (existing.draft!.cards ?? []).entries()) verifyArchivedFile(repo, card, LABEL, `card ${index}`);
        }
      }
      writeStderr(`[weibo-trending-wechat] archive=${date}: reused manifest (${existing.status})`);
      return { manifestPath: manifestRel, generatedPaths: existing.draft ? [existing.draft.path] : [], status: existing.status, rendered: false };
    }
    if (force) {
      writeStderr(`[weibo-trending-wechat] archive=${date}: forced rebuild of existing manifest`);
    } else if (existing.status === "upstream-empty") {
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
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status, rendered: false };
  }

  const upstreamMarkdown = fs.readFileSync(upstreamFile, "utf8");
  const allItems = parseWeiboTrendingArticle(upstreamMarkdown);
  parseWeiboTrendingArticleTitle(upstreamMarkdown);
  const wechatTitle = parseWeiboTrendingArticleWechatTitle(upstreamMarkdown);
  const wechatDescription = parseWeiboTrendingArticleDescription(upstreamMarkdown);
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
  // v2 归档把同名卡片提交进了仓库；重建同一天时先解除跟踪，提交步骤才不会再把它们带上。
  untrackPaths(
    repo,
    archivedCards.map(card => card.path),
    LABEL,
  );
  const markdown = renderWeiboTrendingWechatMarkdown({
    itemCount: selectedItems.length,
    archiveDate: date,
    title: wechatTitle,
    description: wechatDescription,
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
    release: buildReleaseManifest(weiboTrendingWechatReleaseTag(date), dayDir, archivedCards),
  };
  writeJson(manifestFile, manifest);
  writeStderr(
    `[weibo-trending-wechat] archive=${date}: complete items=${draft.itemCount}/${selectedItems.length} truncated=${draft.truncatedItemCount} draft=${draftRel}`,
  );
  return { manifestPath: manifestRel, generatedPaths: [draftRel], status: manifest.status, rendered: true };
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
    force: booleanArg(args, "force"),
  });
  writeStdout(`${JSON.stringify({ date, ...result })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

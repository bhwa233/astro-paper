#!/usr/bin/env tsx
// Reddit 图片消息编排：只消费已提交的视频选题，按图文数量配置渲染并归档每篇 1 题至多 10 答的图片消息。
//
// 卡片 PNG 不进仓库：manifest 的 `release` 段记录它们在 GitHub Release 里的资产名与哈希，
// workflow 在提交 run.json 之前上传，微信同步前再按 manifest 放回原位（见 release_assets.ts）。
import fs from "node:fs";
import path from "node:path";
import { booleanArg, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
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
  type ArchivedFile,
} from "./committed_handoff.ts";
import { buildReleaseManifest, isReleaseManifest, type ReleaseManifest } from "./release_assets.ts";
import { parseRedditLifeNewspicSelections, redditLifeNewspicCardFile, renderRedditLifeNewspicMarkdown } from "./reddit_life_newspic_compose.ts";
import { renderRedditLifeNewspicCards } from "./reddit_life_newspic_cards.ts";
import { REDDIT_LIFE_DAILY_NEWSPIC_COUNT } from "../src/utils/redditLifePublishing.ts";

const LABEL = "Reddit life newspic";
const ROOT_REL = "data/reddit-life-newspic";
const VIDEO_ROOT_REL = "data/reddit-life-video";
// v4：卡片改走 Release，manifest 多出 release 段。v3 及更早的卡片仍提交在仓库里，读取器不接受它们，
// 同一天再跑就按当前规则重建（重建会先解除旧 PNG 的跟踪）。
const MANIFEST_VERSION = 4;

export function redditLifeNewspicReleaseTag(date: string): string {
  return `reddit-life-newspic-${date}`;
}

export type RedditLifeNewspicRunManifest = {
  version: 4;
  archiveDate: string;
  timeZone: "America/Los_Angeles";
  issueCount: number;
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; selection: ArchivedFile };
  rawSources?: { videoSelection: ArchivedFile };
  drafts?: Array<ArchivedFile & { issueNumber: number; answerCount: number; cards: ArchivedFile[] }>;
  release?: ReleaseManifest;
};

function archiveDate(value: string): string {
  if (!isArchiveDate(value)) throw new Error(`--date is required and must be YYYY-MM-DD: ${value || "missing"}`);
  return value;
}

function parseManifest(raw: unknown, file: string): RedditLifeNewspicRunManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid ${LABEL} manifest: ${file}`);
  const value = raw as Partial<RedditLifeNewspicRunManifest>;
  if (
    value.version !== MANIFEST_VERSION ||
    !isArchiveDate(value.archiveDate || "") ||
    value.timeZone !== "America/Los_Angeles" ||
    value.issueCount !== REDDIT_LIFE_DAILY_NEWSPIC_COUNT ||
    (value.status !== "processed" && value.status !== "upstream-empty") ||
    !value.upstream ||
    !/^[0-9a-f]{7,64}$/i.test(value.upstream.generatedSha || "") ||
    !isArchivedFile(value.upstream.selection)
  ) {
    throw new Error(`invalid ${LABEL} manifest structure: ${file}`);
  }
  if (value.status === "upstream-empty") {
    if (value.rawSources || value.drafts || value.release) throw new Error(`invalid ${LABEL} upstream-empty manifest: ${file}`);
  } else if (
    !value.rawSources ||
    !isArchivedFile(value.rawSources.videoSelection) ||
    !Array.isArray(value.drafts) ||
    value.drafts.length !== REDDIT_LIFE_DAILY_NEWSPIC_COUNT ||
    !value.drafts.every(
      (draft, index) =>
        isArchivedFile(draft) &&
        draft.issueNumber === index + 1 &&
        Number.isInteger(draft.answerCount) &&
        draft.answerCount >= 1 &&
        draft.answerCount <= 10 &&
        Array.isArray(draft.cards) &&
        draft.cards.length === draft.answerCount + 1 &&
        draft.cards.every(isArchivedFile)
    ) ||
    !isReleaseManifest(value.release) ||
    value.release.tag !== redditLifeNewspicReleaseTag(value.archiveDate!) ||
    value.release.assets.length !== value.drafts.reduce((sum, draft) => sum + draft.cards.length, 0)
  ) {
    throw new Error(`invalid ${LABEL} processed manifest: ${file}`);
  }
  return value as RedditLifeNewspicRunManifest;
}

export function loadRedditLifeNewspicRunManifest(file: string): RedditLifeNewspicRunManifest | null {
  return loadRunManifest(file, LABEL, parseManifest, raw => {
    const header = raw as { version?: unknown; issueCount?: unknown } | null;
    return header?.version === MANIFEST_VERSION && header.issueCount === REDDIT_LIFE_DAILY_NEWSPIC_COUNT;
  });
}

export function shouldRebuildRedditLifeNewspicManifest(
  existing: Pick<RedditLifeNewspicRunManifest, "status" | "upstream">,
  upstreamSha: string,
  upstreamAvailable: boolean,
  force = false,
  selectionSha = ""
): boolean {
  if (force) return true;
  if (existing.status === "upstream-empty") return upstreamAvailable;
  if (!upstreamAvailable) return true;
  if (selectionSha) return existing.upstream.selection.sha256 !== selectionSha;
  return existing.upstream.generatedSha !== upstreamSha;
}

export async function generateRedditLifeNewspic({
  repo = repoRoot(),
  date,
  upstreamSha,
  artifactsDir = "",
  force = false,
}: {
  repo?: string;
  date: string;
  upstreamSha: string;
  artifactsDir?: string;
  force?: boolean;
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: RedditLifeNewspicRunManifest["status"]; rendered: boolean }> {
  date = archiveDate(date);
  upstreamSha = assertCommittedHandoff(repo, upstreamSha, LABEL);
  const dayDir = path.join(ROOT_REL, date);
  const manifestRel = path.join(dayDir, "run.json");
  const manifestFile = path.join(repo, manifestRel);
  const selectionRel = path.join(VIDEO_ROOT_REL, date, "video.json");
  const selectionFile = path.join(repo, selectionRel);
  assertCommittedPath(repo, manifestRel, LABEL);
  assertCommittedPath(repo, selectionRel, LABEL);

  const existing = loadRedditLifeNewspicRunManifest(manifestFile);
  const upstreamAvailable = fs.existsSync(selectionFile);
  const upstreamSelection = upstreamAvailable ? fs.readFileSync(selectionFile, "utf8") : "";
  const selectionSha = upstreamAvailable ? sha256(upstreamSelection) : "";
  if (existing && !shouldRebuildRedditLifeNewspicManifest(existing, upstreamSha, upstreamAvailable, force, selectionSha)) {
    if (existing.status === "processed") {
      verifyArchivedFile(repo, existing.upstream.selection, LABEL, "selection handoff");
      verifyArchivedFile(repo, existing.rawSources!.videoSelection, LABEL, "selection snapshot");
      // 卡片不在仓库里，这里核对不了；同步 job 从 Release 放回时逐张核对哈希。
      for (const draft of existing.drafts!) verifyArchivedFile(repo, draft, LABEL, `draft ${draft.issueNumber}`);
    }
    writeStderr(`[reddit-life-newspic] archive=${date}: reused manifest (${existing.status})`);
    return { manifestPath: manifestRel, generatedPaths: existing.drafts?.map(draft => draft.path) || [], status: existing.status, rendered: false };
  }

  if (!upstreamAvailable) {
    const manifest: RedditLifeNewspicRunManifest = {
      version: MANIFEST_VERSION,
      archiveDate: date,
      timeZone: "America/Los_Angeles",
      issueCount: REDDIT_LIFE_DAILY_NEWSPIC_COUNT,
      status: "upstream-empty",
      upstream: { generatedSha: upstreamSha, selection: { path: selectionRel, sha256: "0".repeat(64) } },
    };
    writeJson(manifestFile, manifest);
    writeStderr(`[reddit-life-newspic] archive=${date}: video selection missing; wrote upstream-empty manifest`);
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status, rendered: false };
  }

  const selections = parseRedditLifeNewspicSelections(JSON.parse(upstreamSelection), date);
  const rendered = selections.map(selection => {
    const cards = renderRedditLifeNewspicCards(selection);
    if (cards.length !== selection.cards.length + 1) {
      throw new Error(`Reddit life newspic issue ${selection.issueNumber} rendered ${cards.length} cards for ${selection.cards.length} answers`);
    }
    return { selection, cards, markdown: renderRedditLifeNewspicMarkdown(selection) };
  });

  const snapshotRel = path.join(dayDir, "video.json");
  ensureDir(path.join(repo, dayDir));

  // Render all replacements before removing the previous image set.
  if (existing?.status === "processed") {
    for (const draft of existing.drafts!) {
      fs.rmSync(path.join(repo, draft.path), { force: true });
      for (const card of draft.cards) fs.rmSync(path.join(repo, card.path), { force: true });
    }
  } else {
    // v1 kept its single draft and cards directly in the date directory.
    fs.rmSync(path.join(repo, dayDir, "01.md"), { force: true });
    for (let index = 0; index <= 10; index += 1) fs.rmSync(path.join(repo, dayDir, redditLifeNewspicCardFile(index)), { force: true });
  }
  const drafts = rendered.map(({ selection, cards, markdown }) => {
    const issueDir = path.join(dayDir, String(selection.issueNumber).padStart(2, "0"));
    const draftRel = path.join(issueDir, "01.md");
    ensureDir(path.join(repo, issueDir));
    const archivedCards = cards.map((card, index) => {
      const cardRel = path.join(issueDir, redditLifeNewspicCardFile(index));
      fs.writeFileSync(path.join(repo, cardRel), card);
      writeStderr(`[reddit-life-newspic] rendered ${cardRel} (${card.length} bytes)`);
      return { path: cardRel, sha256: sha256(card) };
    });
    fs.writeFileSync(path.join(repo, draftRel), markdown, "utf8");
    return {
      path: draftRel,
      sha256: sha256(markdown),
      issueNumber: selection.issueNumber,
      answerCount: selection.cards.length,
      cards: archivedCards,
    };
  });
  // 卡片改走 Release 之前的归档日把同名 PNG 提交进了仓库；重建同一天时先解除跟踪，提交步骤才不会再把它们带上。
  untrackPaths(
    repo,
    drafts.flatMap(draft => draft.cards.map(card => card.path)),
    LABEL
  );
  fs.writeFileSync(path.join(repo, snapshotRel), upstreamSelection, "utf8");
  if (artifactsDir) {
    ensureDir(artifactsDir);
    fs.writeFileSync(path.join(artifactsDir, "video.json"), upstreamSelection, "utf8");
  }

  const manifest: RedditLifeNewspicRunManifest = {
    version: MANIFEST_VERSION,
    archiveDate: date,
    timeZone: "America/Los_Angeles",
    issueCount: REDDIT_LIFE_DAILY_NEWSPIC_COUNT,
    status: "processed",
    upstream: { generatedSha: upstreamSha, selection: { path: selectionRel, sha256: sha256(upstreamSelection) } },
    rawSources: { videoSelection: { path: snapshotRel, sha256: sha256(upstreamSelection) } },
    drafts,
    release: buildReleaseManifest(
      redditLifeNewspicReleaseTag(date),
      dayDir,
      drafts.flatMap(draft => draft.cards)
    ),
  };
  writeJson(manifestFile, manifest);
  writeStderr(`[reddit-life-newspic] archive=${date}: complete drafts=${drafts.map(draft => draft.path).join(",")}`);
  return { manifestPath: manifestRel, generatedPaths: drafts.map(draft => draft.path), status: manifest.status, rendered: true };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = archiveDate(stringArg(args, "date"));
  const result = await generateRedditLifeNewspic({
    repo: path.resolve(stringArg(args, "repo", repoRoot())),
    date,
    upstreamSha: stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || ""),
    artifactsDir: path.resolve(stringArg(args, "artifacts-dir", "reddit-life-newspic-artifacts")),
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

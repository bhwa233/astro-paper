#!/usr/bin/env tsx
// Reddit 图片消息编排：只消费已提交的视频选题，按图文数量配置渲染并归档每篇 1 题至多 10 答的图片消息。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { booleanArg, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import {
  parseRedditLifeNewspicSelections,
  redditLifeNewspicCardFile,
  renderRedditLifeNewspicMarkdown,
  type RedditLifeNewspicSelection,
} from "./reddit_life_newspic_compose.ts";
import { renderRedditLifeNewspicCards } from "./reddit_life_newspic_cards.ts";
import { REDDIT_LIFE_DAILY_NEWSPIC_COUNT } from "../src/utils/redditLifePublishing.ts";

const ROOT_REL = "data/reddit-life-newspic";
const VIDEO_ROOT_REL = "data/reddit-life-video";
const MANIFEST_VERSION = 3;

type ArchivedFile = { path: string; sha256: string };

export type RedditLifeNewspicRunManifest = {
  version: 3;
  archiveDate: string;
  timeZone: "America/Los_Angeles";
  issueCount: number;
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; selection: ArchivedFile };
  rawSources?: { videoSelection: ArchivedFile };
  drafts?: Array<ArchivedFile & { issueNumber: number; answerCount: number; cards: ArchivedFile[] }>;
};

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function archiveDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`--date is required and must be YYYY-MM-DD: ${value || "missing"}`);
  return value;
}

function gitOutput(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw new Error(`failed to verify the Reddit life newspic committed handoff: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertCommittedHandoff(repo: string, upstreamSha: string): string {
  if (!/^[0-9a-f]{7,64}$/i.test(upstreamSha)) throw new Error(`invalid --upstream-sha: ${upstreamSha || "missing"}`);
  const expected = gitOutput(repo, ["rev-parse", "--verify", `${upstreamSha}^{commit}`]).toLowerCase();
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).toLowerCase();
  if (head !== expected) throw new Error(`Reddit life newspic HEAD ${head} does not match --upstream-sha ${expected}`);
  return expected;
}

function assertCommittedPath(repo: string, relPath: string): void {
  const status = gitOutput(repo, ["status", "--porcelain", "--untracked-files=all", "--", relPath]);
  if (status) throw new Error(`Reddit life newspic handoff path must match HEAD: ${relPath}`);
}

function isArchivedFile(value: unknown): value is ArchivedFile {
  const file = value as Partial<ArchivedFile> | null;
  return Boolean(file && typeof file.path === "string" && file.path && typeof file.sha256 === "string" && /^[0-9a-f]{64}$/i.test(file.sha256));
}

function parseManifest(raw: unknown, file: string): RedditLifeNewspicRunManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid Reddit life newspic manifest: ${file}`);
  const value = raw as Partial<RedditLifeNewspicRunManifest>;
  if (
    value.version !== MANIFEST_VERSION ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.archiveDate || "") ||
    value.timeZone !== "America/Los_Angeles" ||
    value.issueCount !== REDDIT_LIFE_DAILY_NEWSPIC_COUNT ||
    (value.status !== "processed" && value.status !== "upstream-empty") ||
    !value.upstream ||
    !/^[0-9a-f]{7,64}$/i.test(value.upstream.generatedSha || "") ||
    !isArchivedFile(value.upstream.selection)
  ) {
    throw new Error(`invalid Reddit life newspic manifest structure: ${file}`);
  }
  if (value.status === "upstream-empty") {
    if (value.rawSources || value.drafts) throw new Error(`invalid Reddit life newspic upstream-empty manifest: ${file}`);
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
        draft.cards.every(isArchivedFile),
    )
  ) {
    throw new Error(`invalid Reddit life newspic processed manifest: ${file}`);
  }
  return value as RedditLifeNewspicRunManifest;
}

export function loadRedditLifeNewspicRunManifest(file: string): RedditLifeNewspicRunManifest | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const header = raw as { version?: unknown; issueCount?: unknown };
    if (header.version !== MANIFEST_VERSION || header.issueCount !== REDDIT_LIFE_DAILY_NEWSPIC_COUNT) return null;
    return parseManifest(raw, file);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid Reddit life newspic")) throw error;
    throw new Error(`invalid Reddit life newspic manifest: ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function shouldRebuildRedditLifeNewspicManifest(
  existing: Pick<RedditLifeNewspicRunManifest, "status" | "upstream">,
  upstreamSha: string,
  upstreamAvailable: boolean,
  force = false,
  selectionSha = "",
): boolean {
  if (force) return true;
  if (existing.status === "upstream-empty") return upstreamAvailable;
  if (!upstreamAvailable) return true;
  if (selectionSha) return existing.upstream.selection.sha256 !== selectionSha;
  return existing.upstream.generatedSha !== upstreamSha;
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function verifyArchivedFile(repo: string, archived: ArchivedFile, label: string): void {
  assertCommittedPath(repo, archived.path);
  const file = path.join(repo, archived.path);
  if (!fs.existsSync(file)) throw new Error(`Reddit life newspic manifest ${label} is missing: ${archived.path}`);
  if (sha256(fs.readFileSync(file)) !== archived.sha256) throw new Error(`Reddit life newspic manifest ${label} hash does not match: ${archived.path}`);
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
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: RedditLifeNewspicRunManifest["status"] }> {
  date = archiveDate(date);
  upstreamSha = assertCommittedHandoff(repo, upstreamSha);
  const dayDir = path.join(ROOT_REL, date);
  const manifestRel = path.join(dayDir, "run.json");
  const manifestFile = path.join(repo, manifestRel);
  const selectionRel = path.join(VIDEO_ROOT_REL, date, "video.json");
  const selectionFile = path.join(repo, selectionRel);
  assertCommittedPath(repo, manifestRel);
  assertCommittedPath(repo, selectionRel);

  const existing = loadRedditLifeNewspicRunManifest(manifestFile);
  const upstreamAvailable = fs.existsSync(selectionFile);
  const upstreamSelection = upstreamAvailable ? fs.readFileSync(selectionFile, "utf8") : "";
  const selectionSha = upstreamAvailable ? sha256(upstreamSelection) : "";
  if (existing && !shouldRebuildRedditLifeNewspicManifest(existing, upstreamSha, upstreamAvailable, force, selectionSha)) {
    if (existing.status === "processed") {
      verifyArchivedFile(repo, existing.upstream.selection, "selection handoff");
      verifyArchivedFile(repo, existing.rawSources!.videoSelection, "selection snapshot");
      for (const draft of existing.drafts!) {
        verifyArchivedFile(repo, draft, `draft ${draft.issueNumber}`);
        for (const [index, card] of draft.cards.entries()) verifyArchivedFile(repo, card, `draft ${draft.issueNumber} card ${index}`);
      }
    }
    writeStderr(`[reddit-life-newspic] archive=${date}: reused manifest (${existing.status})`);
    return { manifestPath: manifestRel, generatedPaths: existing.drafts?.map(draft => draft.path) || [], status: existing.status };
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
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status };
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

  // Render all replacements before removing the previous tracked image set.
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
  };
  writeJson(manifestFile, manifest);
  writeStderr(`[reddit-life-newspic] archive=${date}: complete drafts=${drafts.map(draft => draft.path).join(",")}`);
  return { manifestPath: manifestRel, generatedPaths: drafts.map(draft => draft.path), status: manifest.status };
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

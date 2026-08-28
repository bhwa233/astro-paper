#!/usr/bin/env tsx
// 竖屏视频的选卡编排：读当天已提交的 reddit-life-wechat 归档，调一次模型选十张卡，写 video.json。
//
// 只做选卡，不渲染。渲染在 video/ 那个独立的 Remotion 包里（`pnpm --filter reddit-life-video render`），
// 因为它要拖进 react 和一套 @remotion/*，而这边的脚本要能在不装那些依赖的环境里跑。
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { booleanArg, dateStringInTimeZone, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { DEFAULT_AI_MODEL } from "./blog_ai_client.ts";
import { type RedditLifeVideoCard, selectRedditLifeVideoCards } from "./reddit_life_video_cards.ts";
import {
  candidateEvidence,
  parseRedditLifeVideoCandidates,
  readRedditLifeWechatDrafts,
  REDDIT_LIFE_VIDEO_CARD_COUNT,
  REDDIT_LIFE_VIDEO_MIN_CARDS,
} from "./reddit_life_video_compose.ts";

// 微信归档按美西日切分目录，视频沿用同一个口径，两边的 <date> 才指同一天。
const SOURCE_TIME_ZONE = "America/Los_Angeles";
const SOURCE_ROOT_REL = "data/reddit-life-wechat";
const ROOT_REL = "data/reddit-life-video";
const MANIFEST_VERSION = 1;

type RunStatus = "processed" | "upstream-empty" | "insufficient-candidates";

type RunManifest = {
  version: typeof MANIFEST_VERSION;
  archiveDate: string;
  timeZone: typeof SOURCE_TIME_ZONE;
  status: RunStatus;
  upstream: { archiveDir: string; drafts: string[]; sha256: string };
  model: string;
  candidateCount: number;
  cardCount: number;
};

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const repo = repoRoot();
  const date = stringArg(args, "date") || dateStringInTimeZone(new Date(), SOURCE_TIME_ZONE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid --date: ${date}`);
  const force = booleanArg(args, "force");
  const model = stringArg(args, "model") || process.env.AI_MODEL || DEFAULT_AI_MODEL;
  const artifactsDir = stringArg(args, "artifacts-dir");

  const outDir = path.join(repo, ROOT_REL, date);
  const manifestPath = path.join(outDir, "run.json");
  const videoPath = path.join(outDir, "video.json");

  // 复用已有结果而不是重新调模型：同一天重跑（补渲染、改版式）不该换掉内容。
  if (!force && fs.existsSync(videoPath) && fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as RunManifest;
    writeStderr(`[reddit-life-video] reusing existing manifest for ${date}; pass --force to reselect\n`);
    writeStdout(`${JSON.stringify({ date, status: existing.status, videoPath: path.relative(repo, videoPath), cardCount: existing.cardCount, reused: true })}\n`);
    return;
  }

  const archiveDir = path.join(repo, SOURCE_ROOT_REL, date);
  const { files, markdowns } = readRedditLifeWechatDrafts(archiveDir);
  const manifest: RunManifest = {
    version: MANIFEST_VERSION,
    archiveDate: date,
    timeZone: SOURCE_TIME_ZONE,
    status: "upstream-empty",
    upstream: { archiveDir: path.relative(repo, archiveDir), drafts: files, sha256: sha256(markdowns.join("\n")) },
    model,
    candidateCount: 0,
    cardCount: 0,
  };

  // 上游还没跑完不是错误：独立 cron 早于归档提交时会撞上这个，让 job 成功退出即可。
  if (!markdowns.length) {
    ensureDir(outDir);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    writeStderr(`[reddit-life-video] no WeChat drafts under ${manifest.upstream.archiveDir}; nothing to render\n`);
    writeStdout(`${JSON.stringify({ date, status: manifest.status, videoPath: "", cardCount: 0, reused: false })}\n`);
    return;
  }

  const candidates = parseRedditLifeVideoCandidates(markdowns);
  manifest.candidateCount = candidates.length;

  if (candidates.length < REDDIT_LIFE_VIDEO_MIN_CARDS) {
    manifest.status = "insufficient-candidates";
    ensureDir(outDir);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    writeStderr(`[reddit-life-video] only ${candidates.length} candidates for ${date}; at least ${REDDIT_LIFE_VIDEO_MIN_CARDS} are needed\n`);
    writeStdout(`${JSON.stringify({ date, status: manifest.status, videoPath: "", cardCount: 0, reused: false })}\n`);
    return;
  }

  const wanted = Math.min(REDDIT_LIFE_VIDEO_CARD_COUNT, candidates.length);
  if (wanted < REDDIT_LIFE_VIDEO_CARD_COUNT) {
    writeStderr(`WARN: [reddit-life-video] only ${candidates.length} candidates for ${date}; rendering ${wanted} cards instead of ${REDDIT_LIFE_VIDEO_CARD_COUNT}\n`);
  }

  const cards: RedditLifeVideoCard[] = await selectRedditLifeVideoCards({
    candidates,
    wanted,
    date,
    model,
    promptDir: stringArg(args, "prompt-dir") || path.join(repo, "prompts/blog"),
    artifactsDir,
    evidence: candidateEvidence(candidates),
  });

  manifest.status = "processed";
  manifest.cardCount = cards.length;

  ensureDir(outDir);
  fs.writeFileSync(videoPath, `${JSON.stringify({ version: 1, archiveDate: date, cards }, null, 2)}\n`, "utf8");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeStdout(`${JSON.stringify({ date, status: manifest.status, videoPath: path.relative(repo, videoPath), cardCount: cards.length, reused: false })}\n`);
}

await main();

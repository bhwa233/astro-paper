#!/usr/bin/env tsx
// 竖屏视频的选卡编排：读当天已提交的 reddit-life-wechat 归档，调一次模型选足视频与图文所需的问题，写 video.json。
//
// 只做选卡，不渲染。渲染在 video/ 那个独立的 Remotion 包里（`pnpm --filter reddit-life-video render`），
// 因为它要拖进 react 和一套 @remotion/*，而这边的脚本要能在不装那些依赖的环境里跑。
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { booleanArg, dateStringInTimeZone, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { DEFAULT_AI_MODEL } from "./blog_ai_client.ts";
import { selectRedditLifeVideoCards } from "./reddit_life_video_cards.ts";
import {
  eligibleRedditLifeVideoQuestions,
  parseRedditLifeVideoQuestions,
  questionEvidence,
  REDDIT_LIFE_VIDEO_ANSWER_COUNT,
} from "./reddit_life_video_compose.ts";
import { REDDIT_LIFE_DAILY_SELECTION_COUNT, REDDIT_LIFE_DAILY_VIDEO_COUNT } from "../src/utils/redditLifePublishing.ts";
import { VIDEO_MANIFEST_VERSION } from "../video/src/contract.ts";

// 微信归档按美西日切分目录，视频沿用同一个口径，两边的 <date> 才指同一天。
const SOURCE_TIME_ZONE = "America/Los_Angeles";
const SOURCE_ROOT_REL = "data/reddit-life-wechat";
const ROOT_REL = "data/reddit-life-video";

/**
 * 写入端直接用读取端的契约常量，不再各留一份。
 *
 * 这里原本是个字面量 5。它和 video/src/contract.ts 的 VIDEO_MANIFEST_VERSION 是同一个
 * 数，但分两处写，升级时只改了这边，Remotion 侧当场以「unsupported video manifest
 * version」拒收——而 scripts/reddit_life_newspic_compose.ts 早就是从那边 import 的。
 * contract.ts 只依赖 src/utils，不会把 Remotion 拖进这条不装它的链路。
 */
const MANIFEST_VERSION = VIDEO_MANIFEST_VERSION;

/**
 * 发布元数据的独立版本号，和 video.json 的契约分开走。
 *
 * publish.json 单独成文件而不是并进 video.json：generate_reddit_life_newspic.ts 拿
 * video.json 的**整份字节**算 sha256 来判断要不要重建，往里加字段会让图文整天重渲染、
 * 微信草稿重推一遍。存成兄弟文件，那份哈希就一个字节都不会变。
 *
 * 也正因为形状没变，MANIFEST_VERSION 不该跟着升：让老日期重新产出 publish.json 的是
 * 下面复用守卫里的 existsSync(publishPath)，升版本只会连带作废 Remotion 与图文的校验。
 */
const PUBLISH_VERSION = 1;

type RunStatus = "processed" | "upstream-empty" | "insufficient-candidates";

type RunManifest = {
  version: typeof MANIFEST_VERSION;
  archiveDate: string;
  timeZone: typeof SOURCE_TIME_ZONE;
  status: RunStatus;
  upstream: { archiveDir: string; drafts: string[]; sha256: string };
  model: string;
  selectionCount: number;
  questionCount: number;
  eligibleQuestionCount: number;
  selectedQuestionIndexes: number[];
  titles: string[];
  questions: string[];
  /** 十条里有几条是原文照抄。改写量降到多少，看这个数就知道，不必逐条比对。 */
  verbatimCounts: number[];
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
  const publishPath = path.join(outDir, "publish.json");

  // 复用已有结果而不是重新调模型：同一天重跑（补渲染、改版式）不该换掉内容。
  // publish.json 也要在：标签与结论出自同一次调用，缺了它就说明这份归档早于该契约。
  if (!force && fs.existsSync(videoPath) && fs.existsSync(manifestPath) && fs.existsSync(publishPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as RunManifest;
    if (existing.version === MANIFEST_VERSION && existing.selectionCount === REDDIT_LIFE_DAILY_SELECTION_COUNT) {
      writeStderr(`[reddit-life-video] reusing existing manifest for ${date}; pass --force to reselect\n`);
      writeStdout(
        `${JSON.stringify({ date, status: existing.status, videoPath: path.relative(repo, videoPath), videoCount: REDDIT_LIFE_DAILY_VIDEO_COUNT, cardCount: REDDIT_LIFE_DAILY_VIDEO_COUNT * REDDIT_LIFE_VIDEO_ANSWER_COUNT, reused: true })}\n`
      );
      return;
    }
    // 旧版缺少当前契约，或发布数量已经变化；两种情况都必须重选，不能让下游拿到
    // 一份看似有效但数量不足的 video.json。
    writeStderr(
      `WARN: [reddit-life-video] manifest for ${date} is version ${existing.version}, selectionCount ${String(existing.selectionCount)}; reselecting for version ${MANIFEST_VERSION}, selectionCount ${REDDIT_LIFE_DAILY_SELECTION_COUNT}\n`
    );
  }

  const archiveDir = path.join(repo, SOURCE_ROOT_REL, date);
  const files = fs.existsSync(archiveDir)
    ? fs
        .readdirSync(archiveDir)
        .filter(name => /^\d+-.+\.md$/.test(name))
        .sort()
    : [];
  const markdowns = files.map(name => fs.readFileSync(path.join(archiveDir, name), "utf8"));

  const manifest: RunManifest = {
    version: MANIFEST_VERSION,
    archiveDate: date,
    timeZone: SOURCE_TIME_ZONE,
    status: "upstream-empty",
    upstream: { archiveDir: path.relative(repo, archiveDir), drafts: files, sha256: sha256(markdowns.join("\n")) },
    model,
    selectionCount: REDDIT_LIFE_DAILY_SELECTION_COUNT,
    questionCount: 0,
    eligibleQuestionCount: 0,
    selectedQuestionIndexes: [],
    titles: [],
    questions: [],
    verbatimCounts: [],
  };

  const finish = (): void => {
    ensureDir(outDir);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    writeStdout(
      `${JSON.stringify({ date, status: manifest.status, videoPath: manifest.status === "processed" ? path.relative(repo, videoPath) : "", videoCount: manifest.status === "processed" ? REDDIT_LIFE_DAILY_VIDEO_COUNT : 0, cardCount: manifest.status === "processed" ? REDDIT_LIFE_DAILY_VIDEO_COUNT * REDDIT_LIFE_VIDEO_ANSWER_COUNT : 0, reused: false })}\n`
    );
  };

  // 上游还没跑完不是错误：独立 cron 早于归档提交时会撞上这个，让 job 成功退出即可。
  if (!markdowns.length) {
    writeStderr(`[reddit-life-video] no WeChat drafts under ${manifest.upstream.archiveDir}; nothing to render\n`);
    finish();
    return;
  }

  const questions = parseRedditLifeVideoQuestions(markdowns);
  const eligible = eligibleRedditLifeVideoQuestions(questions);
  manifest.questionCount = questions.length;
  manifest.eligibleQuestionCount = eligible.length;

  // 实测每天有八到十七个问题满足十条回答，这条兜底正常不会触发。
  if (eligible.length < REDDIT_LIFE_DAILY_SELECTION_COUNT) {
    manifest.status = "insufficient-candidates";
    writeStderr(
      `[reddit-life-video] only ${eligible.length} of ${questions.length} questions for ${date} have ${REDDIT_LIFE_VIDEO_ANSWER_COUNT} answers; need ${REDDIT_LIFE_DAILY_SELECTION_COUNT}\n`
    );
    finish();
    return;
  }

  const selection = await selectRedditLifeVideoCards({
    questions: eligible,
    date,
    model,
    promptDir: stringArg(args, "prompt-dir") || path.join(repo, "prompts/blog"),
    artifactsDir,
    evidence: questionEvidence(eligible),
  });

  const [primary, ...additionalIssues] = selection.issues;
  if (!primary) throw new Error("Reddit life video selection did not return a primary issue");
  manifest.status = "processed";
  manifest.selectedQuestionIndexes = selection.issues.map(issue => issue.questionIndex);
  manifest.titles = selection.issues.map(issue => issue.title);
  manifest.questions = selection.issues.map(issue => issue.question);
  manifest.verbatimCounts = selection.issues.map(issue => issue.cards.filter(card => card.verbatim).length);
  writeStderr(
    `[reddit-life-video] ${date}: questions ${manifest.selectedQuestionIndexes.join(", ")} of ${eligible.length} eligible; verbatim answers ${manifest.verbatimCounts.join(", ")}\n`
  );

  ensureDir(outDir);
  // taxonomy 刻意不写进这里。下游图文用 video.json 的整份字节做缓存键，
  // 加字段等于每天让图文白重跑一次。
  const videoJson = `${JSON.stringify(
    {
      version: MANIFEST_VERSION,
      archiveDate: date,
      title: primary.title,
      question: primary.question,
      cards: primary.cards,
      additionalIssues: additionalIssues.map(issue => ({ title: issue.title, question: issue.question, cards: issue.cards })),
    },
    null,
    2
  )}\n`;
  fs.writeFileSync(videoPath, videoJson, "utf8");

  // position 是 [primary, ...additionalIssues] 里的位次，也是渲染结果的 index。
  // 发布时按它 join，不按 questionIndex——后者只作冗余校验。
  const publishIssues = selection.issues.map((issue, position) => ({
    position: position + 1,
    questionIndex: issue.questionIndex,
    status: issue.taxonomy.status,
    tags: issue.taxonomy.tags,
    summary: issue.taxonomy.summary,
    droppedTags: issue.taxonomy.droppedTags,
    summaryOutOfBand: issue.taxonomy.summaryOutOfBand,
    problems: issue.taxonomy.problems,
  }));
  fs.writeFileSync(
    publishPath,
    `${JSON.stringify({ version: PUBLISH_VERSION, archiveDate: date, model, sourceSha: sha256(videoJson), issues: publishIssues }, null, 2)}\n`,
    "utf8"
  );

  const degraded = publishIssues.filter(issue => issue.status !== "processed");
  if (degraded.length) {
    writeStderr(
      `WARN: [reddit-life-video] ${date}: ${degraded.length} of ${publishIssues.length} issues have no publish metadata: ${degraded.map(issue => issue.problems.join("; ")).join(" | ")}\n`
    );
  }
  const dropped = [...new Set(publishIssues.flatMap(issue => issue.droppedTags))];
  if (dropped.length) writeStderr(`[reddit-life-video] ${date}: tags outside the vocabulary were dropped: ${dropped.join(", ")}\n`);

  finish();
}

await main();

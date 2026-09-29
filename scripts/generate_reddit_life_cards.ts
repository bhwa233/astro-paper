#!/usr/bin/env tsx
// Reddit 问答卡片批量：让抖音、B 站、视频号、公众号四个平台始终有约 target 条可发的卡片。
//
// 每天问 SparkHub 缺口（ready 最少的那个平台离 target 还差几条），按领取顺序取待用、还没有卡片的帖子，
// 一题调一次模型挑回答（最多十条，不足十条有几条用几条）、起标题，再用图文同一个 Remotion 静帧渲染器出图。
// 帖子不领取、不改池状态：公众号草稿链路照样能领到它们。
//
// 卡片 PNG 不进仓库，和图文一样走 GitHub Release（见 release_assets.ts）；run.json 记录每题的选答与卡片哈希。
// 上传与提交之后由 attach_reddit_life_cards_sparkhub.ts 把地址回报给 SparkHub，那一步才把平台设为 ready。
import fs from "node:fs";
import path from "node:path";
import { booleanArg, dateStringInTimeZone, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { DEFAULT_AI_MODEL } from "./blog_ai_client.ts";
import { sha256, writeJson, type ArchivedFile } from "./committed_handoff.ts";
import { buildReleaseManifest, type ReleaseManifest } from "./release_assets.ts";
import { redditLifeNewspicCardFile } from "./reddit_life_newspic_compose.ts";
import { renderRedditLifeNewspicCards } from "./reddit_life_newspic_cards.ts";
import { selectRedditLifeCards } from "./reddit_life_video_cards.ts";
import { parseRedditLifeVideoQuestions } from "./reddit_life_video_compose.ts";
import { getRedditLifeCardBacklog, sparkhubEndpoint, type SparkhubRedditLifePost } from "./sparkhub_client.ts";

// 与视频、图文同一个日界口径。
const SOURCE_TIME_ZONE = "America/Los_Angeles";
const ROOT_REL = "data/reddit-life-cards";
const MANIFEST_VERSION = 1;
// 每个平台每天发一条左右，20 条够三周；再多只是让存货变旧、首次补满跑得更久。
const DEFAULT_TARGET = 20;

export function redditLifeCardsReleaseTag(date: string): string {
  return `reddit-life-cards-${date}`;
}

export type RedditLifeCardsItem = {
  /** SparkHub 池 id。 */
  id: number;
  postId: string;
  question: string;
  title: string;
  summary: string | null;
  tags: string[];
  answerCount: number;
  cards: Array<{ index: number; body: string; sourceIndex: number; verbatim: boolean }>;
  /** 封面 + 每条回答一张，顺序即发布顺序。 */
  images: ArchivedFile[];
};

export type RedditLifeCardsRunManifest = {
  version: typeof MANIFEST_VERSION;
  archiveDate: string;
  target: number;
  /** 生成前各平台 ready 的条数。 */
  readyBefore: Record<string, number>;
  gap: number;
  model: string;
  items: RedditLifeCardsItem[];
  failures: Array<{ id: number; postId: string; error: string }>;
  release?: ReleaseManifest;
};

type Result = { date: string; status: "processed" | "full" | "reused"; manifestPath: string; generated: number; failed: number; rendered: boolean };

function failureLimit(gap: number): number {
  // A few bad model responses should be skipped, but a broad failure indicates
  // that the batch is not healthy enough to publish silently.
  return Math.max(3, Math.ceil(gap / 2));
}

function postMarkdown(post: SparkhubRedditLifePost): string {
  return `\n## ${post.title}\n${post.content_md.trim()}\n`;
}

export async function generateRedditLifeCards({
  repo = repoRoot(),
  date,
  target = DEFAULT_TARGET,
  model,
  promptDir,
  artifactsDir = "",
  force = false,
}: {
  repo?: string;
  date: string;
  target?: number;
  model: string;
  promptDir: string;
  artifactsDir?: string;
  force?: boolean;
}): Promise<Result> {
  const dayDir = path.join(ROOT_REL, date);
  const manifestRel = path.join(dayDir, "run.json");
  const manifestFile = path.join(repo, manifestRel);

  // 同一天重跑不换内容：卡片可能已经发出去了。补回报交给 attach 那一步。
  if (!force && fs.existsSync(manifestFile)) {
    const existing = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as RedditLifeCardsRunManifest;
    writeStderr(`[reddit-life-cards] ${date}: reusing ${manifestRel} (${existing.items.length} posts); pass --force to regenerate`);
    return { date, status: "reused", manifestPath: manifestRel, generated: existing.items.length, failed: existing.failures.length, rendered: false };
  }

  const backlog = await getRedditLifeCardBacklog(target);
  writeStderr(
    `[reddit-life-cards] ${date}: ready ${JSON.stringify(backlog.ready)}, target ${target}, gap ${backlog.gap}, candidates ${backlog.candidates.length}`
  );
  if (backlog.gap === 0) return { date, status: "full", manifestPath: "", generated: 0, failed: 0, rendered: false };

  const items: RedditLifeCardsItem[] = [];
  const failures: RedditLifeCardsRunManifest["failures"] = [];
  for (const post of backlog.candidates) {
    if (items.length >= backlog.gap) break;
    try {
      const [question] = parseRedditLifeVideoQuestions([postMarkdown(post)]);
      if (!question) throw new Error("post has no answers");
      const issue = await selectRedditLifeCards({
        question,
        model,
        promptDir,
        artifactsDir: artifactsDir ? path.join(artifactsDir, String(post.id)) : "",
      });
      const images = renderRedditLifeNewspicCards({
        archiveDate: date,
        issueNumber: 1,
        title: issue.title,
        question: issue.question,
        cards: issue.cards.map(({ index, body, sourceIndex }) => ({ index, body, sourceIndex })),
      });
      if (images.length !== issue.cards.length + 1) throw new Error(`rendered ${images.length} images for ${issue.cards.length} answers`);

      const postDir = path.join(dayDir, String(post.id));
      fs.mkdirSync(path.join(repo, postDir), { recursive: true });
      const archived = images.map((image, index) => {
        const rel = path.join(postDir, redditLifeNewspicCardFile(index));
        fs.writeFileSync(path.join(repo, rel), image);
        return { path: rel, sha256: sha256(image) };
      });
      items.push({
        id: post.id,
        postId: post.post_id,
        question: issue.question,
        title: issue.title,
        // 标签与结论是软校验，降级时留空，不影响卡片。
        summary: issue.taxonomy.status === "processed" ? issue.taxonomy.summary : null,
        tags: issue.taxonomy.status === "processed" ? issue.taxonomy.tags : [],
        answerCount: question.answers.length,
        cards: issue.cards,
        images: archived,
      });
      writeStderr(`[reddit-life-cards] ${date}: #${post.id} ${issue.title} (${issue.cards.length} answers)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: post.id, postId: post.post_id, error: message });
      writeStderr(`WARN: [reddit-life-cards] ${date}: #${post.id} failed: ${message}`);
    }
  }

  const manifest: RedditLifeCardsRunManifest = {
    version: MANIFEST_VERSION,
    archiveDate: date,
    target,
    readyBefore: backlog.ready,
    gap: backlog.gap,
    model,
    items,
    failures,
    ...(items.length > 0 && {
      release: buildReleaseManifest(
        redditLifeCardsReleaseTag(date),
        dayDir,
        items.flatMap(item => item.images)
      ),
    }),
  };
  writeJson(manifestFile, manifest);
  writeStderr(`[reddit-life-cards] ${date}: ${items.length} of gap ${backlog.gap} generated, ${failures.length} failed`);
  // 有候选却一条都没做成，多半是模型或渲染整体坏了，要让 job 变红；做成一部分只告警。
  if (failures.length >= failureLimit(backlog.gap) || items.length < backlog.gap) {
    throw new Error(`${failures.length} card candidates failed and ${items.length}/${backlog.gap} were generated; see ${manifestRel}`);
  }
  return { date, status: "processed", manifestPath: manifestRel, generated: items.length, failed: failures.length, rendered: items.length > 0 };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const repo = path.resolve(stringArg(args, "repo", repoRoot()));
  const date = stringArg(args, "date") || dateStringInTimeZone(new Date(), SOURCE_TIME_ZONE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid --date: ${date}`);
  const target = Number(stringArg(args, "target", String(DEFAULT_TARGET)));
  if (!Number.isInteger(target) || target < 0 || target > 100) throw new Error("--target must be an integer from 0 to 100");
  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");
  const result = await generateRedditLifeCards({
    repo,
    date,
    target,
    model: stringArg(args, "model") || process.env.AI_MODEL || DEFAULT_AI_MODEL,
    promptDir: stringArg(args, "prompt-dir") || path.join(repo, "prompts/blog"),
    artifactsDir: stringArg(args, "artifacts-dir"),
    force: booleanArg(args, "force"),
  });
  writeStdout(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

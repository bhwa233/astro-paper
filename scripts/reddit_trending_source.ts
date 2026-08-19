// Reddit 全站热搜的来源层：取榜 → 密度粗筛 → 模型选题 → 深挖评论 → 拼成可写稿的 source。
//
// 这条管线和 reddit-top20 的三个栏目形态不同，原因在数据本身。实测 r/popular 的 top?t=day
// （2026-08-19，两次 50 条）：零条自帖，74% 是 i.redd.it 与 v.redd.it 的图和视频，
// 标题短到「meirl」「Petah?!」这种。榜单本身没有可总结的文字，内容全在评论区。
//
// 因此分两步：先用「评论数/分数」把纯图梗筛掉——实测该比值在纯图帖是 0.003 量级、
// 在真吵起来的帖子是 0.2 量级，差两个数量级，规则层就能干净切开；再让模型从剩下的候选里
// 挑长尾选题，最后只对选中的帖子调用深挖接口。
import fs from "node:fs";
import path from "node:path";
import { compact, repoRoot, writeStderr, writeStdout } from "./blog_common.ts";
import { REDDIT_TRENDING_MIN_TOPICS } from "./blog_tasks.ts";
import { resolvePromptFile } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries, writeAiArtifact } from "./ai_json_stage.ts";
import { parseModelJsonObject } from "./compose_common.ts";
import {
  REDDIT_TRENDING_MAX_DETAIL_POSTS,
  fetchRedditPostDetail,
  fetchRedditTrendingBoard,
  type RedditEvidenceComment,
  type RedditPostEvidence,
  type RedditTrendingBoard,
  type RedditTrendingItem,
} from "./reddit_trending_api.ts";

const SELECTION_PROMPT_TASK = "reddit-trending-selection";

/** 取回的榜单深度。选题要剔掉大量时效性内容，池子太浅就凑不出十条长尾。 */
export const REDDIT_TRENDING_BOARD_LIMIT = 100;
/** 粗筛的绝对门槛：评论数太少的帖子没有可读的讨论，密度比值再高也是噪声。 */
export const REDDIT_TRENDING_MIN_COMMENTS = 300;
/** 交给模型的候选上限。再多只是把提示词撑大，密度靠后的帖子本来也选不上。 */
export const REDDIT_TRENDING_CANDIDATE_LIMIT = 25;

export type RedditTrendingCandidate = RedditTrendingItem & { density: number };

export type RedditTrendingSelection = { rank: number; reason: string };

/** 讨论密度：评论数与分数之比。高分低评是「点个赞就划走」的图，高评是真在吵。 */
export function discussionDensity(item: { score: number; numComments: number }): number {
  return item.numComments / Math.max(item.score, 1);
}

export function selectRedditTrendingCandidates(
  items: RedditTrendingItem[],
  { minComments = REDDIT_TRENDING_MIN_COMMENTS, limit = REDDIT_TRENDING_CANDIDATE_LIMIT } = {},
): RedditTrendingCandidate[] {
  return items
    .filter(item => item.numComments >= minComments)
    .map(item => ({ ...item, density: discussionDensity(item) }))
    // 密度相同时按评论数兜底排序，保证同一份榜单每次筛出同一批候选。
    .sort((left, right) => right.density - left.density || right.numComments - left.numComments)
    .slice(0, limit);
}

function candidateBlock(candidate: RedditTrendingCandidate, position: number): string {
  return [
    `${position}. [r/${candidate.subreddit}] ${candidate.title}`,
    `- ⭐ ${candidate.score} points · ${candidate.numComments} 评论 · 讨论密度 ${candidate.density.toFixed(3)}`,
    `- 榜内排名：第 ${candidate.rank} 位`,
    `- 帖子：${candidate.url}`,
    `- 发布时间：${candidate.publishedAt}`,
  ].join("\n");
}

/** 渲染候选清单。和 parseRedditTrendingCandidates 是一对，测试按往返校验，格式漂了会当场失败。 */
export function renderRedditTrendingCandidates(date: string, board: RedditTrendingBoard, candidates: RedditTrendingCandidate[]): string {
  const header = [
    `# Reddit 全站热搜候选 ${date}`,
    "",
    `- 榜单：r/${board.subreddit} ${board.sort} t=${board.timeWindow}，取回 ${board.items.length} 条，抓取时间 ${board.fetchedAt}`,
    `- 粗筛：评论数 ≥ ${REDDIT_TRENDING_MIN_COMMENTS}，按讨论密度（评论数/分数）排序取前 ${REDDIT_TRENDING_CANDIDATE_LIMIT}`,
    `- 候选：${candidates.length} 条`,
  ].join("\n");
  return `${[header, ...candidates.map((candidate, index) => candidateBlock(candidate, index + 1))].join("\n\n")}\n`;
}

/**
 * 第一段：取榜加粗筛，产出候选清单。这一步不调模型，也不深挖，
 * 因此重跑很便宜——选题失败时不必重新打一遍榜单接口。
 */
export async function buildRedditTrendingSource(date: string): Promise<string> {
  const board = await fetchRedditTrendingBoard({ limit: REDDIT_TRENDING_BOARD_LIMIT });
  const candidates = selectRedditTrendingCandidates(board.items);
  writeStdout(
    `[reddit-trending] candidates=${candidates.length}/${board.items.length} min_comments=${REDDIT_TRENDING_MIN_COMMENTS}` +
      `${candidates.length ? ` density=${candidates[candidates.length - 1].density.toFixed(3)}..${candidates[0].density.toFixed(3)}` : ""}\n`,
  );
  return renderRedditTrendingCandidates(date, board, candidates);
}

const CANDIDATE_HEADING = /^(\d+)\.\s*\[r\/([^\]]+)\]\s+(.+)$/;

/** 把候选清单解析回结构，供选题阶段校验模型给的编号确实存在。 */
export function parseRedditTrendingCandidates(source: string): RedditTrendingCandidate[] {
  const blocks = source
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(block => CANDIDATE_HEADING.test(block.split("\n")[0] || ""));
  return blocks.map((block, index) => {
    const lines = block.split("\n");
    const heading = lines[0].match(CANDIDATE_HEADING);
    if (!heading || Number(heading[1]) !== index + 1) throw new Error(`Reddit trending candidate ${index + 1} has an invalid heading`);
    const heat = block.match(/^- ⭐ (\d+) points · (\d+) 评论 · 讨论密度 ([\d.]+)$/m);
    const url = block.match(/^- 帖子：(https:\/\/www\.reddit\.com\/\S+)$/m)?.[1];
    const rank = Number(block.match(/^- 榜内排名：第 (\d+) 位$/m)?.[1]);
    if (!heat || !url || !Number.isInteger(rank)) throw new Error(`Reddit trending candidate ${index + 1} is missing its facts`);
    const permalink = new URL(url).pathname;
    return {
      rank,
      id: permalink.match(/\/comments\/([a-z0-9]+)/i)?.[1] || "",
      subreddit: heading[2],
      title: compact(heading[3]),
      score: Number(heat[1]),
      numComments: Number(heat[2]),
      permalink,
      url,
      publishedAt: block.match(/^- 发布时间：(.*)$/m)?.[1]?.trim() || "",
      density: Number(heat[3]),
    };
  });
}

export function parseRedditTrendingSelection(raw: string, candidateCount: number): RedditTrendingSelection[] {
  const payload = parseModelJsonObject(raw, "Reddit trending selection");
  const selected = payload.selected;
  if (!Array.isArray(selected)) throw new Error("Reddit trending selection must contain a selected array");
  if (selected.length > REDDIT_TRENDING_MAX_DETAIL_POSTS) {
    throw new Error(`Reddit trending selection picked ${selected.length} posts, at most ${REDDIT_TRENDING_MAX_DETAIL_POSTS} are allowed`);
  }
  const seen = new Set<number>();
  return selected.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`Reddit trending selection entry ${index + 1} is invalid`);
    const entry = value as Record<string, unknown>;
    const rank = Number(entry.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > candidateCount) {
      throw new Error(`Reddit trending selection entry ${index + 1} refers to candidate ${String(entry.rank)}, which is not in the list`);
    }
    if (seen.has(rank)) throw new Error(`Reddit trending selection picked candidate ${rank} twice`);
    seen.add(rank);
    const reason = compact(String(entry.reason || ""));
    // 入选理由要进 source，写稿模型据此拿捏角度；没有理由的选择也无从复核。
    if (!reason || !/[一-鿿]/.test(reason)) throw new Error(`Reddit trending selection entry ${index + 1} needs a Chinese reason`);
    return { rank, reason };
  });
}

async function selectLongTailPosts({
  candidates,
  candidateSource,
  date,
  model,
  promptDir,
  artifactsDir,
  repo,
}: {
  candidates: RedditTrendingCandidate[];
  candidateSource: string;
  date: string;
  model: string;
  promptDir: string;
  artifactsDir: string;
  repo: string;
}): Promise<RedditTrendingSelection[]> {
  const resolvedPromptDir = promptDir || path.join(repo, "prompts/blog");
  const template = fs.readFileSync(resolvePromptFile(resolvedPromptDir, SELECTION_PROMPT_TASK), "utf8");
  const prompt = template
    .replaceAll("{date}", date)
    .replaceAll("{max_posts}", String(REDDIT_TRENDING_MAX_DETAIL_POSTS))
    .replaceAll("{source_text}", candidateSource);
  writeAiArtifact(artifactsDir, SELECTION_PROMPT_TASK, "prompt.md", prompt);
  return generateJsonStageWithRetries<RedditTrendingSelection[]>({
    task: SELECTION_PROMPT_TASK,
    stage: "Reddit trending selection",
    artifactPrefix: "selection",
    prompt,
    model,
    artifactsDir,
    parse: content => parseRedditTrendingSelection(content, candidates.length),
    // 选不出题就当作「今天没有值得写的长尾选题」，让上层跳过当天，而不是让整个任务失败。
    onExhausted: message => {
      writeStderr(`WARN: [reddit-trending] ${message}; treating the day as having no long-tail picks`);
      return [];
    },
  });
}

function commentLines(comments: RedditEvidenceComment[], replies: RedditEvidenceComment[]): string[] {
  const repliesByParent = new Map<string, RedditEvidenceComment[]>();
  for (const reply of replies) {
    if (!reply.parentId) continue;
    repliesByParent.set(reply.parentId, [...(repliesByParent.get(reply.parentId) || []), reply]);
  }
  const label = (comment: RedditEvidenceComment) => (comment.score === null ? "分数隐藏" : `${comment.score} 赞`);
  return comments.flatMap((comment, index) => [
    `  ${index + 1}. [${label(comment)}] ${comment.text}`,
    ...(repliesByParent.get(comment.id) || []).map(reply => `    - 回复 [${label(reply)}] ${reply.text}`),
  ]);
}

function evidenceBlock(position: number, candidate: RedditTrendingCandidate, reason: string, evidence: RedditPostEvidence): string {
  return [
    `## ${position}. ${evidence.title || candidate.title}`,
    "",
    `- **入选理由**：${reason}`,
    `- **热度**：${evidence.score ?? candidate.score} points · ${evidence.numComments ?? candidate.numComments} 评论 · 讨论密度 ${candidate.density.toFixed(3)} · 榜内第 ${candidate.rank} 位`,
    `- **来源**：[r/${evidence.subreddit || candidate.subreddit}](https://www.reddit.com/r/${evidence.subreddit || candidate.subreddit}/)`,
    `- **帖子**：${candidate.url}`,
    `- **发布时间**：${evidence.publishedAt || candidate.publishedAt}`,
    `- **正文**：${evidence.body ? compact(evidence.body) : "（无正文，内容是图片或视频）"}`,
    `- **顶层高赞回答**（共 ${evidence.topComments.length} 条）：`,
    "",
    ...commentLines(evidence.topComments, evidence.replies),
  ].join("\n");
}

/**
 * 第二段：选题、深挖、拼稿。选中不足 REDDIT_TRENDING_MIN_TOPICS 条时照常返回，
 * 但正文里一个 `## N.` 块都没有——上层据此跳过当天，判断规则和 tech-daily 一致。
 */
export async function buildCombinedRedditTrendingSource({
  source,
  date,
  repo = repoRoot(),
  model,
  promptDir = "",
  artifactsDir = "",
}: {
  source: string;
  date: string;
  repo?: string;
  model: string;
  promptDir?: string;
  artifactsDir?: string;
}): Promise<string> {
  writeAiArtifact(artifactsDir, "reddit-trending", "candidates.md", source);
  const candidates = parseRedditTrendingCandidates(source);
  const header = `# Reddit 全站热搜 ${date}`;
  if (!candidates.length) {
    writeStderr("WARN: [reddit-trending] the board produced no candidates after the density filter");
    return `${header}\n\n- 选题：0 条，当天榜单粗筛后没有候选。\n`;
  }

  const selections = await selectLongTailPosts({ candidates, candidateSource: source, date, model, promptDir, artifactsDir, repo });
  writeStdout(`[reddit-trending] selected=${selections.length}/${candidates.length}\n`);
  for (const selection of selections) {
    writeStdout(`[reddit-trending] pick #${selection.rank} r/${candidates[selection.rank - 1].subreddit} ${candidates[selection.rank - 1].title}\n`);
  }
  if (selections.length < REDDIT_TRENDING_MIN_TOPICS) {
    writeStderr(`WARN: [reddit-trending] only ${selections.length} long-tail picks, below the ${REDDIT_TRENDING_MIN_TOPICS} needed to publish`);
    return `${header}\n\n- 选题：${selections.length} 条，不足 ${REDDIT_TRENDING_MIN_TOPICS} 条，当天不发稿。\n`;
  }

  const picked = selections.map(selection => ({ selection, candidate: candidates[selection.rank - 1] }));
  const evidence = await fetchRedditPostDetail(date, picked.map(item => item.candidate.url));
  const evidenceById = new Map(evidence.map(item => [item.postId, item]));
  const blocks: string[] = [];
  const dropped: string[] = [];
  for (const { selection, candidate } of picked) {
    const detail = evidenceById.get(candidate.id);
    // 深挖失败的帖子直接落选：没有评论证据就没有可写的内容，留一个空壳块只会误导写稿模型。
    if (!detail || detail.status !== "ok" || !detail.topComments.length) {
      dropped.push(`#${selection.rank} r/${candidate.subreddit} (${detail?.status || "missing"}${detail?.errorCode ? `: ${detail.errorCode}` : ""})`);
      continue;
    }
    blocks.push(evidenceBlock(blocks.length + 1, candidate, selection.reason, detail));
  }
  if (dropped.length) writeStderr(`WARN: [reddit-trending] dropped ${dropped.length} picks without usable comment evidence: ${dropped.join(", ")}`);
  writeStdout(`[reddit-trending] evidence ok=${blocks.length}/${picked.length}\n`);

  const summary = [
    header,
    "",
    `- 选题：从 ${candidates.length} 条候选中选出 ${selections.length} 条长尾选题，${blocks.length} 条取到可用评论证据。`,
  ].join("\n");
  return `${[summary, ...blocks].join("\n\n")}\n`;
}

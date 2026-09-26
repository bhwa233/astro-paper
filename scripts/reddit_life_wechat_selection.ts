// Reddit 人生微信稿的 AI 编辑层：一次给整篇文章的全部候选打分，排序与过线由代码决定。
// JSON 重试、模型调用和提示词寻址均复用博客生成基础设施；本模块只持有该栏目的判断契约。
import { readPromptTemplate } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries, writeAiArtifact } from "./ai_json_stage.ts";
import { compact } from "./blog_common.ts";
import { parseModelJsonObject } from "./compose_common.ts";
import { REDDIT_LIFE_WECHAT_TOTAL_POSTS, type RedditLifeCandidate } from "./reddit_life_wechat_compose.ts";

const PROMPT_TASK = "reddit-life-wechat-selection";
const EXCERPT_STORY_LIMIT = 10;
const EXCERPT_CHARS = 320;

/** 过线分。低于它的候选即使排得进前几名也不收录，宁缺毋滥。 */
export const REDDIT_LIFE_WECHAT_MIN_SCORE = 60;

export type RedditLifeWechatScoredPost = {
  rank: number;
  /** 0-100 的综合分，跨天可比；排序只看它，不看模型输出的数组顺序。 */
  score: number;
  reason: string;
};

export type RedditLifeWechatSelection = {
  minScore: number;
  /** 全部候选，按分数降序，同分按上游排名升序。 */
  scores: RedditLifeWechatScoredPost[];
  /** scores 中过线的前几条，由代码推导，不存进 manifest。 */
  selected: RedditLifeWechatScoredPost[];
};

// v2-v4 manifest 的审计格式：入选帖带两个 1-5 分项，其余帖带拒绝类别。只为读历史归档而保留。
const LEGACY_REJECTION_CATEGORIES = new Set(["region_specific", "time_sensitive", "narrow_interest", "low_resonance"]);

function validRank(value: unknown, candidateCount: number, label: string): number {
  const rank = Number(value);
  if (!Number.isInteger(rank) || rank < 1 || rank > candidateCount)
    throw new Error(`${label} refers to candidate ${String(value)}, which is not in the article`);
  return rank;
}

function legacyScore(value: unknown, field: string, rank: number): void {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw new Error(`Reddit life WeChat selection rank ${rank} has invalid ${field}`);
}

function reason(value: unknown, rank: number): string {
  const parsed = compact(String(value || ""));
  if (!parsed || !/[一-鿿]/.test(parsed)) throw new Error(`Reddit life WeChat selection rank ${rank} needs a Chinese reason`);
  return parsed;
}

function assertCoversAll(ranks: number[], candidateCount: number): void {
  if (ranks.length !== candidateCount || new Set(ranks).size !== candidateCount) {
    throw new Error(`Reddit life WeChat selection must cover all ${candidateCount} candidates exactly once`);
  }
}

function entryObject(rawEntry: unknown, label: string): Record<string, unknown> {
  if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) throw new Error(`${label} is invalid`);
  return rawEntry as Record<string, unknown>;
}

/** 输入是模型输出或 v5 manifest 的审计记录；minScore 读历史时传入当时的过线分。 */
export function validateRedditLifeWechatSelection(
  raw: unknown,
  candidateCount: number,
  minScore: number = REDDIT_LIFE_WECHAT_MIN_SCORE
): RedditLifeWechatSelection {
  if (!Number.isInteger(candidateCount) || candidateCount < 1) throw new Error(`invalid Reddit life WeChat candidate count: ${candidateCount}`);
  if (!Number.isInteger(minScore) || minScore < 0 || minScore > 100) throw new Error(`invalid Reddit life WeChat min score: ${minScore}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reddit life WeChat selection must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.scores)) throw new Error("Reddit life WeChat selection must contain a scores array");

  const scores = value.scores.map((rawEntry, index): RedditLifeWechatScoredPost => {
    const entry = entryObject(rawEntry, `Reddit life WeChat score entry ${index + 1}`);
    const rank = validRank(entry.rank, candidateCount, `Reddit life WeChat score entry ${index + 1}`);
    const score = Number(entry.score);
    if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error(`Reddit life WeChat selection rank ${rank} has invalid score`);
    return { rank, score, reason: reason(entry.reason, rank) };
  });
  assertCoversAll(
    scores.map(item => item.rank),
    candidateCount
  );

  scores.sort((a, b) => b.score - a.score || a.rank - b.rank);
  const selected = scores.filter(item => item.score >= minScore).slice(0, REDDIT_LIFE_WECHAT_TOTAL_POSTS);
  return { minScore, scores, selected };
}

/** 只校验 v2-v4 历史审计记录，返回入选顺序；新生成一律走打分制。 */
export function validateLegacyRedditLifeWechatSelection(raw: unknown, candidateCount: number, maxSelected: number): { selected: Array<{ rank: number }> } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reddit life WeChat selection must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.selected) || !Array.isArray(value.rejected))
    throw new Error("Reddit life WeChat selection must contain selected and rejected arrays");
  if (value.selected.length > maxSelected) {
    throw new Error(`Reddit life WeChat selection picked ${value.selected.length} posts, at most ${maxSelected} are allowed`);
  }
  const selected = value.selected.map((rawEntry, index) => {
    const entry = entryObject(rawEntry, `Reddit life WeChat selected entry ${index + 1}`);
    const rank = validRank(entry.rank, candidateCount, `Reddit life WeChat selected entry ${index + 1}`);
    legacyScore(entry.longTail, "longTail", rank);
    legacyScore(entry.resonance, "resonance", rank);
    reason(entry.reason, rank);
    return { rank };
  });
  const rejected = value.rejected.map((rawEntry, index) => {
    const entry = entryObject(rawEntry, `Reddit life WeChat rejected entry ${index + 1}`);
    const rank = validRank(entry.rank, candidateCount, `Reddit life WeChat rejected entry ${index + 1}`);
    const category = String(entry.category || "");
    if (!LEGACY_REJECTION_CATEGORIES.has(category))
      throw new Error(`Reddit life WeChat selection rank ${rank} has invalid rejection category: ${category || "missing"}`);
    reason(entry.reason, rank);
    return { rank };
  });
  assertCoversAll(
    [...selected, ...rejected].map(item => item.rank),
    candidateCount
  );
  return { selected };
}

export function parseRedditLifeWechatSelection(raw: string, candidateCount: number): RedditLifeWechatSelection {
  return validateRedditLifeWechatSelection(parseModelJsonObject(raw, "Reddit life WeChat selection"), candidateCount);
}

export function rankedRedditLifeCandidates(candidates: RedditLifeCandidate[], selection: Pick<RedditLifeWechatSelection, "selected">): RedditLifeCandidate[] {
  const byRank = new Map(candidates.map(candidate => [candidate.rank, candidate]));
  return selection.selected.map(item => {
    const candidate = byRank.get(item.rank);
    if (!candidate) throw new Error(`Reddit life WeChat selection refers to missing candidate ${item.rank}`);
    return candidate;
  });
}

/**
 * 每天一篇稿子，按 AI 排序收录全部入选帖。不足五帖照样成篇，不为凑数补低质量帖子。
 */
export function splitRedditLifeWechatCandidates(candidates: RedditLifeCandidate[]): RedditLifeCandidate[][] {
  if (candidates.length > REDDIT_LIFE_WECHAT_TOTAL_POSTS) {
    throw new Error(`Reddit life WeChat can split at most ${REDDIT_LIFE_WECHAT_TOTAL_POSTS} selected posts`);
  }
  return candidates.length ? [candidates] : [];
}

function storyExcerpts(body: string): string[] {
  return body
    .split(/\n+(?=\d+\\?\.\s)/)
    .slice(0, EXCERPT_STORY_LIMIT)
    .map(story => compact(story.replace(/^\d+\\?\.\s*/, "")).slice(0, EXCERPT_CHARS));
}

function candidateEvidence(candidates: RedditLifeCandidate[]): string {
  return candidates
    .map(candidate => {
      const stories = storyExcerpts(candidate.body)
        .map((story, index) => `${index + 1}. ${story}`)
        .join("\n");
      return [
        `## 候选 ${candidate.rank}`,
        `标题：${candidate.title}`,
        `社区：r/${candidate.subreddit}`,
        `热度：${candidate.points}`,
        "代表回答：",
        stories,
      ].join("\n");
    })
    .join("\n\n");
}

export async function selectRedditLifeWechatCandidates({
  candidates,
  date,
  model,
  promptDir,
  artifactsDir,
}: {
  candidates: RedditLifeCandidate[];
  date: string;
  model: string;
  promptDir: string;
  artifactsDir: string;
}): Promise<RedditLifeWechatSelection> {
  if (!candidates.length) throw new Error("Reddit life WeChat selection needs at least one candidate");
  const template = readPromptTemplate(promptDir, PROMPT_TASK);
  const prompt = template
    .replaceAll("{date}", date)
    .replaceAll("{candidate_count}", String(candidates.length))
    .replaceAll("{max_posts}", String(REDDIT_LIFE_WECHAT_TOTAL_POSTS))
    .replaceAll("{min_score}", String(REDDIT_LIFE_WECHAT_MIN_SCORE))
    .replaceAll("{min_score_below}", String(REDDIT_LIFE_WECHAT_MIN_SCORE - 1))
    .replaceAll("{source_text}", candidateEvidence(candidates));
  writeAiArtifact(artifactsDir, PROMPT_TASK, "prompt.md", prompt);
  return generateJsonStageWithRetries({
    task: PROMPT_TASK,
    stage: "Reddit life WeChat selection",
    artifactPrefix: "selection",
    prompt,
    model,
    artifactsDir,
    parse: content => parseRedditLifeWechatSelection(content, candidates.length),
  });
}

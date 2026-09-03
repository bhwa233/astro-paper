// Reddit 人生微信稿的 AI 编辑层：一次比较整篇文章的全部候选，返回过滤与排序。
// JSON 重试、模型调用和提示词寻址均复用博客生成基础设施；本模块只持有该栏目的判断契约。
import { readPromptTemplate } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries, writeAiArtifact } from "./ai_json_stage.ts";
import { compact } from "./blog_common.ts";
import { parseModelJsonObject } from "./compose_common.ts";
import { REDDIT_LIFE_WECHAT_TOTAL_POSTS, type RedditLifeCandidate } from "./reddit_life_wechat_compose.ts";

const PROMPT_TASK = "reddit-life-wechat-selection";
const EXCERPT_STORY_LIMIT = 3;
const EXCERPT_CHARS = 320;

export const REDDIT_LIFE_WECHAT_REJECTION_CATEGORIES = ["region_specific", "time_sensitive", "narrow_interest", "low_resonance"] as const;
export type RedditLifeWechatRejectionCategory = (typeof REDDIT_LIFE_WECHAT_REJECTION_CATEGORIES)[number];

export type RedditLifeWechatSelectedPost = {
  rank: number;
  longTail: number;
  resonance: number;
  reason: string;
};

export type RedditLifeWechatRejectedPost = {
  rank: number;
  category: RedditLifeWechatRejectionCategory;
  reason: string;
};

export type RedditLifeWechatSelection = {
  selected: RedditLifeWechatSelectedPost[];
  rejected: RedditLifeWechatRejectedPost[];
};

function validRank(value: unknown, candidateCount: number, label: string): number {
  const rank = Number(value);
  if (!Number.isInteger(rank) || rank < 1 || rank > candidateCount)
    throw new Error(`${label} refers to candidate ${String(value)}, which is not in the article`);
  return rank;
}

function score(value: unknown, field: string, rank: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw new Error(`Reddit life WeChat selection rank ${rank} has invalid ${field}`);
  return parsed;
}

function reason(value: unknown, rank: number): string {
  const parsed = compact(String(value || ""));
  if (!parsed || !/[一-鿿]/.test(parsed)) throw new Error(`Reddit life WeChat selection rank ${rank} needs a Chinese reason`);
  return parsed;
}

export function validateRedditLifeWechatSelection(raw: unknown, candidateCount: number): RedditLifeWechatSelection {
  if (!Number.isInteger(candidateCount) || candidateCount < 1) throw new Error(`invalid Reddit life WeChat candidate count: ${candidateCount}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reddit life WeChat selection must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.selected) || !Array.isArray(value.rejected))
    throw new Error("Reddit life WeChat selection must contain selected and rejected arrays");
  if (value.selected.length > REDDIT_LIFE_WECHAT_TOTAL_POSTS) {
    throw new Error(`Reddit life WeChat selection picked ${value.selected.length} posts, at most ${REDDIT_LIFE_WECHAT_TOTAL_POSTS} are allowed`);
  }

  const selected = value.selected.map((rawEntry, index): RedditLifeWechatSelectedPost => {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) throw new Error(`Reddit life WeChat selected entry ${index + 1} is invalid`);
    const entry = rawEntry as Record<string, unknown>;
    const rank = validRank(entry.rank, candidateCount, `Reddit life WeChat selected entry ${index + 1}`);
    return {
      rank,
      longTail: score(entry.longTail, "longTail", rank),
      resonance: score(entry.resonance, "resonance", rank),
      reason: reason(entry.reason, rank),
    };
  });
  const categories = new Set<string>(REDDIT_LIFE_WECHAT_REJECTION_CATEGORIES);
  const rejected = value.rejected.map((rawEntry, index): RedditLifeWechatRejectedPost => {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) throw new Error(`Reddit life WeChat rejected entry ${index + 1} is invalid`);
    const entry = rawEntry as Record<string, unknown>;
    const rank = validRank(entry.rank, candidateCount, `Reddit life WeChat rejected entry ${index + 1}`);
    const category = String(entry.category || "");
    if (!categories.has(category)) throw new Error(`Reddit life WeChat selection rank ${rank} has invalid rejection category: ${category || "missing"}`);
    return { rank, category: category as RedditLifeWechatRejectionCategory, reason: reason(entry.reason, rank) };
  });

  const ranks = [...selected, ...rejected].map(item => item.rank);
  if (ranks.length !== candidateCount || new Set(ranks).size !== candidateCount) {
    throw new Error(`Reddit life WeChat selection must cover all ${candidateCount} candidates exactly once`);
  }
  return { selected, rejected };
}

export function parseRedditLifeWechatSelection(raw: string, candidateCount: number): RedditLifeWechatSelection {
  return validateRedditLifeWechatSelection(parseModelJsonObject(raw, "Reddit life WeChat selection"), candidateCount);
}

export function rankedRedditLifeCandidates(candidates: RedditLifeCandidate[], selection: RedditLifeWechatSelection): RedditLifeCandidate[] {
  const byRank = new Map(candidates.map(candidate => [candidate.rank, candidate]));
  return selection.selected.map(item => {
    const candidate = byRank.get(item.rank);
    if (!candidate) throw new Error(`Reddit life WeChat selection refers to missing candidate ${item.rank}`);
    return candidate;
  });
}

/**
 * 两篇微信稿需要均摊 AI 的高优先级选题：第 1、3、5… 名进第一篇，第 2、4、6… 名进第二篇。
 * 只有凑满十题才拆成两篇；不足时保留成一篇，避免为少量选题额外发一篇短稿。
 */
export function splitRedditLifeWechatCandidates(candidates: RedditLifeCandidate[]): RedditLifeCandidate[][] {
  if (candidates.length > REDDIT_LIFE_WECHAT_TOTAL_POSTS) {
    throw new Error(`Reddit life WeChat can split at most ${REDDIT_LIFE_WECHAT_TOTAL_POSTS} selected posts`);
  }
  if (candidates.length < REDDIT_LIFE_WECHAT_TOTAL_POSTS) return candidates.length ? [candidates] : [];
  return [candidates.filter((_, index) => index % 2 === 0), candidates.filter((_, index) => index % 2 === 1)];
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

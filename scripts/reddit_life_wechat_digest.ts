// 微信稿的标题与摘要：这是本条管线里唯一的模型调用。
// 一篇稿子收录三帖之后，上游 frontmatter 的 description 只覆盖第一帖，标题也不该再由某一帖独占，
// 因此由模型读三帖内容后统一给一个话题串和一句摘要。
import fs from "node:fs";
import path from "node:path";
import { compact, repoRoot, writeStderr } from "./blog_common.ts";
import { resolvePromptFile } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries, writeAiArtifact } from "./ai_json_stage.ts";
import { parseModelJsonObject } from "./compose_common.ts";
import { limitedStoryText, type RedditLifeCandidate } from "./reddit_life_wechat_compose.ts";

const PROMPT_TASK = "reddit-life-wechat-digest";
// 标题后缀「｜Reddit 热帖精选 #N」占 15–17 字符，64 字上限下真实预算是 47；
// 给模型 34 字留足余量，redditLifeWechatTitle 的码点级硬截断继续兜底。
const HEADLINE_MAX_CHARS = 34;
// astro-wechat 的 FIELD_LIMITS.digest.max。
const DESCRIPTION_MAX_CHARS = 120;

export type RedditLifeWechatDigest = { headline: string; description: string };

function hasChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

export function parseRedditLifeWechatDigest(raw: string): RedditLifeWechatDigest {
  const payload = parseModelJsonObject(raw, "Reddit life WeChat digest");
  const headline = compact(String(payload.title_zh || ""));
  const description = compact(String(payload.description || ""));
  if (!headline || !hasChinese(headline)) throw new Error("Reddit life WeChat digest needs a Chinese title_zh");
  if (!description || !hasChinese(description)) throw new Error("Reddit life WeChat digest needs a Chinese description");
  if ([...headline].length > HEADLINE_MAX_CHARS) throw new Error(`Reddit life WeChat digest title_zh is too long: ${[...headline].length} > ${HEADLINE_MAX_CHARS}`);
  if ([...description].length > DESCRIPTION_MAX_CHARS) throw new Error(`Reddit life WeChat digest description is too long: ${[...description].length} > ${DESCRIPTION_MAX_CHARS}`);
  return { headline, description };
}

export function redditLifeWechatDigestSource(candidates: RedditLifeCandidate[], replyLimit?: number): string {
  return candidates.map(candidate => `## ${candidate.rank}. ${candidate.title}\n\n${limitedStoryText(candidate.body, replyLimit)}`).join("\n\n");
}

/**
 * 取标题与摘要。模型不可用时回落到第一帖标题与上游 description，也就是收录单帖时的行为，
 * 并打 WARN——归档草稿是这条管线的职责，润色步骤不该有能力弄挂它。
 */
export async function redditLifeWechatDigest({
  candidates,
  fallbackDescription,
  date,
  model,
  repo = repoRoot(),
  promptDir = "",
  artifactsDir = "",
  replyLimit,
}: {
  candidates: RedditLifeCandidate[];
  fallbackDescription: string;
  date: string;
  model: string;
  repo?: string;
  promptDir?: string;
  artifactsDir?: string;
  replyLimit?: number;
}): Promise<RedditLifeWechatDigest> {
  if (!candidates.length) throw new Error("Reddit life WeChat digest needs at least one post");
  const fallback: RedditLifeWechatDigest = { headline: candidates[0].title, description: fallbackDescription };
  const resolvedPromptDir = promptDir || path.join(repo, "prompts/blog");
  const template = fs.readFileSync(resolvePromptFile(resolvedPromptDir, PROMPT_TASK), "utf8");
  const prompt = template.replaceAll("{date}", date).replaceAll("{source_text}", redditLifeWechatDigestSource(candidates, replyLimit));
  writeAiArtifact(artifactsDir, PROMPT_TASK, "prompt.md", prompt);
  return generateJsonStageWithRetries<RedditLifeWechatDigest>({
    task: PROMPT_TASK,
    stage: "Reddit life WeChat digest",
    artifactPrefix: "digest",
    prompt,
    model,
    artifactsDir,
    parse: parseRedditLifeWechatDigest,
    onExhausted: message => {
      writeStderr(`WARN: [reddit-life-wechat] ${message}; falling back to the first post's title and the upstream description`);
      return fallback;
    },
  });
}

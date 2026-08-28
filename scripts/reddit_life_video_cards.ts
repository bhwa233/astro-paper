// 竖屏视频的 AI 编辑层：从当天全部候选回答里挑出上镜的几条，并把每条压成一句能一眼读完的话。
// JSON 重试、模型调用与提示词寻址复用博客生成基础设施；本模块只持有这条管线的判断契约。
import { readPromptTemplate } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries, writeAiArtifact } from "./ai_json_stage.ts";
import { compact } from "./blog_common.ts";
import { parseModelJsonObject } from "./compose_common.ts";
import { CARD_BODY_MAX_CHARS, CARD_TITLE_MAX_CHARS, type RedditLifeVideoCandidate } from "./reddit_life_video_compose.ts";

const PROMPT_TASK = "reddit-life-video-cards";
const MIN_BODY_LEAD_CHARS = 6;

export type RedditLifeVideoCard = {
  index: number;
  title: string;
  body: string;
  sourceIndex: number;
  sourceQuestion: string;
};

function chineseText(value: unknown, max: number, label: string): string {
  const text = compact(String(value || ""));
  if (!text) throw new Error(`${label} is empty`);
  if (!/[一-鿿]/.test(text)) throw new Error(`${label} must be Chinese: ${text}`);
  if ([...text].length > max) throw new Error(`${label} is ${[...text].length} characters, at most ${max} are allowed: ${text}`);
  return text;
}

export function validateRedditLifeVideoCards(raw: unknown, candidates: RedditLifeVideoCandidate[], wanted: number): RedditLifeVideoCard[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reddit life video cards must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.cards)) throw new Error("Reddit life video cards must contain a cards array");
  if (value.cards.length !== wanted) throw new Error(`Reddit life video needs exactly ${wanted} cards, got ${value.cards.length}`);

  const byIndex = new Map(candidates.map(candidate => [candidate.index, candidate]));
  const used = new Set<number>();

  return value.cards.map((rawCard, position): RedditLifeVideoCard => {
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) throw new Error(`Reddit life video card ${position + 1} is invalid`);
    const card = rawCard as Record<string, unknown>;
    const sourceIndex = Number(card.sourceIndex);
    const candidate = byIndex.get(sourceIndex);
    if (!candidate) throw new Error(`Reddit life video card ${position + 1} refers to candidate ${String(card.sourceIndex)}, which does not exist`);
    if (used.has(sourceIndex)) throw new Error(`Reddit life video card ${position + 1} reuses candidate ${sourceIndex}`);
    used.add(sourceIndex);

    const title = chineseText(card.title, CARD_TITLE_MAX_CHARS, `Reddit life video card ${position + 1} title`);
    const body = chineseText(card.body, CARD_BODY_MAX_CHARS, `Reddit life video card ${position + 1} body`);
    // 正文只是标题的复述，等于观众盯着这张卡五秒却没拿到新信息。
    // 用长度差判定：标题是话题，正文得给出具体内容，短于标题 +6 字的多半只是换了个说法。
    if ([...body].length < [...title].length + MIN_BODY_LEAD_CHARS) {
      throw new Error(`Reddit life video card ${position + 1} body is too close to its title (${title} / ${body})`);
    }

    return { index: position + 1, title, body, sourceIndex, sourceQuestion: candidate.question };
  });
}

export function parseRedditLifeVideoCards(raw: string, candidates: RedditLifeVideoCandidate[], wanted: number): RedditLifeVideoCard[] {
  return validateRedditLifeVideoCards(parseModelJsonObject(raw, "Reddit life video cards"), candidates, wanted);
}

export async function selectRedditLifeVideoCards({
  candidates,
  wanted,
  date,
  model,
  promptDir,
  artifactsDir,
  evidence,
}: {
  candidates: RedditLifeVideoCandidate[];
  wanted: number;
  date: string;
  model: string;
  promptDir: string;
  artifactsDir: string;
  evidence: string;
}): Promise<RedditLifeVideoCard[]> {
  if (!candidates.length) throw new Error("Reddit life video card selection needs at least one candidate");
  const prompt = readPromptTemplate(promptDir, PROMPT_TASK)
    .replaceAll("{date}", date)
    .replaceAll("{candidate_count}", String(candidates.length))
    .replaceAll("{card_count}", String(wanted))
    .replaceAll("{title_max}", String(CARD_TITLE_MAX_CHARS))
    .replaceAll("{body_max}", String(CARD_BODY_MAX_CHARS))
    .replaceAll("{source_text}", evidence);
  writeAiArtifact(artifactsDir, PROMPT_TASK, "prompt.md", prompt);
  return generateJsonStageWithRetries({
    task: PROMPT_TASK,
    stage: "Reddit life video cards",
    artifactPrefix: "cards",
    prompt,
    model,
    artifactsDir,
    parse: content => parseRedditLifeVideoCards(content, candidates, wanted),
  });
}

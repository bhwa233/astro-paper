// Reddit 视频与图片消息共用的 AI 编辑层：一次选两个问题，各挑十条回答，超长的压到上限内。
// JSON 重试、模型调用与提示词寻址复用博客生成基础设施；本模块只持有这条管线的判断契约。
import { readPromptTemplate } from "./ai_blog_writer.ts";
import { generateJsonStageWithRetries, writeAiArtifact } from "./ai_json_stage.ts";
import { parseModelJsonObject } from "./compose_common.ts";
import {
  CARD_BODY_MAX_CHARS,
  REDDIT_LIFE_DAILY_ISSUE_COUNT,
  REDDIT_LIFE_VIDEO_ANSWER_COUNT,
  REDDIT_LIFE_VIDEO_TITLE_MAX_CHARS,
  stripLatinGloss,
  validateRedditLifeVideoTitle,
  type RedditLifeVideoQuestion,
} from "./reddit_life_video_compose.ts";

const PROMPT_TASK = "reddit-life-video-cards";

export type RedditLifeVideoCard = {
  index: number;
  body: string;
  sourceIndex: number;
  /** 正文是否与归档原文逐字相同。由代码比对得出，不采信模型的自述。 */
  verbatim: boolean;
};

export type RedditLifeVideoIssueSelection = {
  questionIndex: number;
  title: string;
  question: string;
  cards: RedditLifeVideoCard[];
};

export type RedditLifeVideoSelection = {
  issues: RedditLifeVideoIssueSelection[];
};

function validateIssue(raw: unknown, position: number, questions: RedditLifeVideoQuestion[]): RedditLifeVideoIssueSelection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Reddit life issue ${position + 1} must be a JSON object`);
  const value = raw as Record<string, unknown>;
  const questionIndex = Number(value.questionIndex);
  const question = questions.find(entry => entry.index === questionIndex);
  if (!question) throw new Error(`Reddit life issue ${position + 1} picked question ${String(value.questionIndex)}, which is not in the candidate list`);
  const title = validateRedditLifeVideoTitle(value.title, question.question);

  if (!Array.isArray(value.cards)) throw new Error("Reddit life video selection must contain a cards array");
  if (value.cards.length !== REDDIT_LIFE_VIDEO_ANSWER_COUNT) {
    throw new Error(`Reddit life video needs exactly ${REDDIT_LIFE_VIDEO_ANSWER_COUNT} cards, got ${value.cards.length}`);
  }

  // 只认这道题下的回答。跨题混选会让封面上的问题和后面的内容对不上，
  // 而那正是这一版要消灭的东西。
  const answersByIndex = new Map(question.answers.map(entry => [entry.index, entry.answer]));
  const used = new Set<number>();

  const cards = value.cards.map((rawCard, position): RedditLifeVideoCard => {
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) throw new Error(`Reddit life video card ${position + 1} is invalid`);
    const card = rawCard as Record<string, unknown>;

    const sourceIndex = Number(card.sourceIndex);
    const source = answersByIndex.get(sourceIndex);
    if (source === undefined) {
      throw new Error(`Reddit life video card ${position + 1} refers to answer ${String(card.sourceIndex)}, which does not belong to question ${questionIndex}`);
    }
    if (used.has(sourceIndex)) throw new Error(`Reddit life video card ${position + 1} reuses answer ${sourceIndex}`);
    used.add(sourceIndex);

    // 证据里已经没有英文括注了，模型正常不会写出来；这里再剥一次是为了让
    // 「模型自作主张补一个」的情况被静默修掉，而不是让整次生成因为多两个字失败。
    const body = stripLatinGloss(String(card.body || ""));
    if (!body) throw new Error(`Reddit life video card ${position + 1} has an empty body`);
    if (!/[一-鿿]/.test(body)) throw new Error(`Reddit life video card ${position + 1} body must be Chinese: ${body}`);
    if ([...body].length > CARD_BODY_MAX_CHARS) {
      throw new Error(`Reddit life video card ${position + 1} body is ${[...body].length} characters, at most ${CARD_BODY_MAX_CHARS} are allowed: ${body}`);
    }
    // 比原文还长说明模型在扩写，那不是这一步该做的事——它只负责挑和缩。
    if ([...body].length > [...source].length) {
      throw new Error(`Reddit life video card ${position + 1} body is longer than the archived answer; this stage only shortens`);
    }

    return { index: position + 1, body, sourceIndex, verbatim: body === source };
  });

  return { questionIndex, title, question: question.question, cards };
}

export function validateRedditLifeVideoSelection(raw: unknown, questions: RedditLifeVideoQuestion[]): RedditLifeVideoSelection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reddit life video selection must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.issues) || value.issues.length !== REDDIT_LIFE_DAILY_ISSUE_COUNT) {
    throw new Error(`Reddit life video selection needs exactly ${REDDIT_LIFE_DAILY_ISSUE_COUNT} issues`);
  }
  const issues = value.issues.map((issue, position) => validateIssue(issue, position, questions));
  if (new Set(issues.map(issue => issue.questionIndex)).size !== issues.length) {
    throw new Error("Reddit life video selection must use different questions for its daily issues");
  }
  return { issues };
}

export function parseRedditLifeVideoSelection(raw: string, questions: RedditLifeVideoQuestion[]): RedditLifeVideoSelection {
  return validateRedditLifeVideoSelection(parseModelJsonObject(raw, "Reddit life video selection"), questions);
}

export async function selectRedditLifeVideoCards({
  questions,
  date,
  model,
  promptDir,
  artifactsDir,
  evidence,
}: {
  questions: RedditLifeVideoQuestion[];
  date: string;
  model: string;
  promptDir: string;
  artifactsDir: string;
  evidence: string;
}): Promise<RedditLifeVideoSelection> {
  if (questions.length < REDDIT_LIFE_DAILY_ISSUE_COUNT) {
    throw new Error(`Reddit life video selection needs at least ${REDDIT_LIFE_DAILY_ISSUE_COUNT} eligible questions`);
  }
  const prompt = readPromptTemplate(promptDir, PROMPT_TASK)
    .replaceAll("{date}", date)
    .replaceAll("{question_count}", String(questions.length))
    .replaceAll("{issue_count}", String(REDDIT_LIFE_DAILY_ISSUE_COUNT))
    .replaceAll("{card_count}", String(REDDIT_LIFE_VIDEO_ANSWER_COUNT))
    .replaceAll("{body_max}", String(CARD_BODY_MAX_CHARS))
    .replaceAll("{title_max}", String(REDDIT_LIFE_VIDEO_TITLE_MAX_CHARS))
    .replaceAll("{source_text}", evidence);
  writeAiArtifact(artifactsDir, PROMPT_TASK, "prompt.md", prompt);
  return generateJsonStageWithRetries({
    task: PROMPT_TASK,
    stage: "Reddit life video selection",
    artifactPrefix: "cards",
    prompt,
    model,
    artifactsDir,
    parse: content => parseRedditLifeVideoSelection(content, questions),
  });
}

// Reddit 图片消息的规则层：输入是已归档的视频选题，不重新抓取 Reddit 或调用模型。
import { compact, frontmatter } from "./blog_common.ts";
import { validateRedditLifeVideoTitle } from "./reddit_life_video_compose.ts";
import { REDDIT_LIFE_DAILY_NEWSPIC_COUNT } from "../src/utils/redditLifePublishing.ts";

// 草稿 sync ID 与 Release 资产名都用两位篇号。
const MAX_ISSUE_NUMBER = 99;
import { VIDEO_MANIFEST_VERSION } from "../video/src/contract.ts";

export const REDDIT_LIFE_NEWSPIC_TAG = "Reddit人生讨论";
export const REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT = 10;

export type RedditLifeNewspicCard = {
  index: number;
  body: string;
  sourceIndex: number;
};

export type RedditLifeNewspicSelection = {
  archiveDate: string;
  issueNumber: number;
  title: string;
  question: string;
  cards: RedditLifeNewspicCard[];
};

function validDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be YYYY-MM-DD: ${value || "missing"}`);
  return value;
}

function parseIssue(raw: unknown, expectedDate: string, issueNumber: number): RedditLifeNewspicSelection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Reddit life newspic issue ${issueNumber} must be a JSON object`);
  const value = raw as Record<string, unknown>;
  const question = compact(String(value.question || ""));
  if (!question || !/[一-鿿]/.test(question)) throw new Error(`Reddit life newspic issue ${issueNumber} needs a Chinese question`);
  const title = validateRedditLifeVideoTitle(value.title, question);
  if (!Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT) {
    throw new Error(`Reddit life newspic issue ${issueNumber} needs 1-${REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT} answers`);
  }

  const sourceIndexes = new Set<number>();
  const cards = value.cards.map((rawCard, position): RedditLifeNewspicCard => {
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) throw new Error(`Reddit life newspic answer ${position + 1} is invalid`);
    const card = rawCard as Record<string, unknown>;
    const index = Number(card.index);
    const sourceIndex = Number(card.sourceIndex);
    const body = compact(String(card.body || ""));
    if (!Number.isInteger(index) || index !== position + 1) throw new Error(`Reddit life newspic answer ${position + 1} has an invalid index`);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 1 || sourceIndexes.has(sourceIndex)) {
      throw new Error(`Reddit life newspic answer ${position + 1} has an invalid or duplicate source index`);
    }
    if (!body || !/[一-鿿]/.test(body)) throw new Error(`Reddit life newspic answer ${position + 1} needs Chinese text`);
    sourceIndexes.add(sourceIndex);
    return { index, body, sourceIndex };
  });

  return { archiveDate: expectedDate, issueNumber, title, question, cards };
}

/** 同一份选题归档覆盖视频与图文，图文侧不再抓取或调用模型。 */
/** count：当天要出的图文篇数（SparkHub 配置 newspic_per_day）；选题归档至少要有这么多组。 */
export function parseRedditLifeNewspicSelections(raw: unknown, expectedDate: string, count = REDDIT_LIFE_DAILY_NEWSPIC_COUNT): RedditLifeNewspicSelection[] {
  validDate(expectedDate, "Reddit life newspic archive date");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reddit life newspic selection must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (value.version !== VIDEO_MANIFEST_VERSION) {
    throw new Error(`Reddit life newspic needs video selection version ${VIDEO_MANIFEST_VERSION}, got ${String(value.version)}`);
  }
  if (value.archiveDate !== expectedDate) throw new Error(`Reddit life newspic selection date ${String(value.archiveDate)} does not match ${expectedDate}`);
  const expectedAdditionalIssues = count - 1;
  // 选题组数取图文与视频的较大者，多出来的组随后截掉。
  if (!Array.isArray(value.additionalIssues) || value.additionalIssues.length < expectedAdditionalIssues) {
    throw new Error(`Reddit life newspic selection needs at least ${expectedAdditionalIssues} additional issues`);
  }

  const selections = [value, ...value.additionalIssues]
    .slice(0, count)
    .map((issue, index) => parseIssue(issue, expectedDate, index + 1));
  if (new Set(selections.map(selection => selection.question)).size !== selections.length) {
    throw new Error("Reddit life newspic daily issues must use different questions");
  }
  return selections;
}

export function redditLifeNewspicSyncId(archiveDate: string, issueNumber: number): string {
  validDate(archiveDate, "Reddit life newspic archive date");
  if (!Number.isInteger(issueNumber) || issueNumber < 1 || issueNumber > MAX_ISSUE_NUMBER) {
    throw new Error(`invalid Reddit life newspic issue number: ${issueNumber}`);
  }
  return `reddit-life-newspic-${archiveDate}-${String(issueNumber).padStart(2, "0")}`;
}

export function redditLifeNewspicCardFile(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT) {
    throw new Error(`invalid Reddit life newspic card index: ${index}`);
  }
  return `card-${String(index).padStart(2, "0")}.png`;
}

/** 图片消息没有「阅读原文」：新草稿在创建前不存在可公开、自指向的 URL。 */
export function renderRedditLifeNewspicMarkdown(selection: RedditLifeNewspicSelection): string {
  const { archiveDate, issueNumber, title, question, cards } = selection;
  validDate(archiveDate, "Reddit life newspic archive date");
  if (!question) throw new Error("Reddit life newspic needs a question");
  if (!cards.length || cards.length > REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT) {
    throw new Error(`Reddit life newspic needs 1-${REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT} answers`);
  }

  const metadata = frontmatter({
    title,
    date: archiveDate,
    description: question,
    tags: [REDDIT_LIFE_NEWSPIC_TAG],
    ogImage: redditLifeNewspicCardFile(0),
    wechat: { enabled: true, syncId: redditLifeNewspicSyncId(archiveDate, issueNumber), articleType: "newspic" },
  });
  const images = Array.from({ length: cards.length + 1 }, (_, index) => `![](${redditLifeNewspicCardFile(index)})`);
  return `${metadata}${question}\n\n${images.join("\n\n")}\n`;
}

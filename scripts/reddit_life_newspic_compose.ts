// Reddit 图片消息的规则层：输入是已归档的视频选题，不重新抓取 Reddit 或调用模型。
import { compact, frontmatter } from "./blog_common.ts";
import { validateRedditLifeVideoTitle } from "./reddit_life_video_compose.ts";

export const REDDIT_LIFE_NEWSPIC_TAG = "Reddit人生讨论";
export const REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT = 10;

export type RedditLifeNewspicCard = {
  index: number;
  body: string;
  sourceIndex: number;
};

export type RedditLifeNewspicSelection = {
  archiveDate: string;
  title: string;
  question: string;
  cards: RedditLifeNewspicCard[];
};

function validDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be YYYY-MM-DD: ${value || "missing"}`);
  return value;
}

/** 视频选题是唯一内容输入，图片消息与同日视频因此讲同一个问题。 */
export function parseRedditLifeNewspicSelection(raw: unknown, expectedDate: string): RedditLifeNewspicSelection {
  validDate(expectedDate, "Reddit life newspic archive date");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reddit life newspic selection must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (value.version !== 3) throw new Error(`Reddit life newspic needs video selection version 3, got ${String(value.version)}`);
  if (value.archiveDate !== expectedDate) throw new Error(`Reddit life newspic selection date ${String(value.archiveDate)} does not match ${expectedDate}`);

  const question = compact(String(value.question || ""));
  if (!question || !/[一-鿿]/.test(question)) throw new Error("Reddit life newspic selection needs a Chinese question");
  const title = validateRedditLifeVideoTitle(value.title, question);
  if (!Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT) {
    throw new Error(`Reddit life newspic selection needs 1-${REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT} answers`);
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

  return { archiveDate: expectedDate, title, question, cards };
}

export function redditLifeNewspicSyncId(archiveDate: string): string {
  validDate(archiveDate, "Reddit life newspic archive date");
  return `reddit-life-newspic-${archiveDate}`;
}

export function redditLifeNewspicCardFile(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > REDDIT_LIFE_NEWSPIC_ANSWER_LIMIT) {
    throw new Error(`invalid Reddit life newspic card index: ${index}`);
  }
  return `card-${String(index).padStart(2, "0")}.png`;
}

/** 图片消息没有「阅读原文」：新草稿在创建前不存在可公开、自指向的 URL。 */
export function renderRedditLifeNewspicMarkdown(selection: RedditLifeNewspicSelection): string {
  const { archiveDate, title, question, cards } = selection;
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
    wechatEnabled: true,
  }).replace(
    "wechat:\n  enabled: true",
    ["wechat:", "  enabled: true", `  syncId: \"${redditLifeNewspicSyncId(archiveDate)}\"`, '  articleType: "newspic"'].join("\n"),
  );
  const images = Array.from({ length: cards.length + 1 }, (_, index) => `![](${redditLifeNewspicCardFile(index)})`);
  return `${metadata}${question}\n\n${images.join("\n\n")}\n`;
}

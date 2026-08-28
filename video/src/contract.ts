// video.json 的契约。选卡脚本（scripts/generate_reddit_life_video.ts）写它，
// Remotion 侧只读它——两边不共享代码，因此形状必须在这里明确校验，
// 而不是靠 TypeScript 断言假装它一定对。

/** 一张内容卡，就是所选问题下的一条回答。`sourceIndex` 指回归档里的回答序号。 */
export type VideoCard = {
  index: number;
  body: string;
  sourceIndex: number;
  /** 正文是否与归档原文逐字相同。只作审计用，不影响渲染。 */
  verbatim: boolean;
};

export type VideoManifest = {
  version: 3;
  archiveDate: string;
  /** 同一次选题 AI 根据最终问题和回答生成的发行标题。 */
  title: string;
  /** 封面上的问题。一支视频只讲一个问题，后面全是它的回答。 */
  question: string;
  cards: VideoCard[];
};

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

export function parseVideoManifest(raw: unknown): VideoManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("video manifest must be a JSON object");
  const value = raw as Record<string, unknown>;
  // v1 没有 question，v2 没有 AI 内容标题；都不能满足当前下游契约。
  if (value.version !== 3) throw new Error(`unsupported video manifest version: ${String(value.version)}; regenerate with --force`);

  const archiveDate = requireString(value.archiveDate, "video manifest archiveDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) throw new Error(`invalid video manifest archiveDate: ${archiveDate}`);
  const question = requireString(value.question, "video manifest question");
  const title = requireString(value.title, "video manifest title");
  if (!/[一-鿿]/.test(title) || [...title].length > 20) throw new Error(`video manifest title must be Chinese and at most 20 characters: ${title}`);
  if (!Array.isArray(value.cards) || !value.cards.length) throw new Error("video manifest needs at least one card");

  const cards = value.cards.map((rawCard, position): VideoCard => {
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) throw new Error(`video manifest card ${position + 1} is invalid`);
    const card = rawCard as Record<string, unknown>;
    const index = requireInteger(card.index, `video manifest card ${position + 1} index`);
    if (index !== position + 1) throw new Error(`video manifest card ${position + 1} has out-of-order index ${index}`);
    return {
      index,
      body: requireString(card.body, `video manifest card ${index} body`),
      sourceIndex: requireInteger(card.sourceIndex, `video manifest card ${index} sourceIndex`),
      verbatim: card.verbatim === true,
    };
  });

  return { version: 3, archiveDate, title, question, cards };
}

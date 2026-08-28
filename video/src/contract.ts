// video.json 的契约。选卡脚本（scripts/generate_reddit_life_video.ts）写它，
// Remotion 侧只读它——两边不共享代码，因此形状必须在这里明确校验，
// 而不是靠 TypeScript 断言假装它一定对。

/** 一张内容卡。`sourceIndex` 指回当天归档里的候选序号，用于追溯模型改写了什么。 */
export type VideoCard = {
  index: number;
  title: string;
  body: string;
  sourceIndex: number;
  sourceQuestion: string;
};

export type VideoManifest = {
  version: 1;
  archiveDate: string;
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
  if (value.version !== 1) throw new Error(`unsupported video manifest version: ${String(value.version)}`);
  const archiveDate = requireString(value.archiveDate, "video manifest archiveDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) throw new Error(`invalid video manifest archiveDate: ${archiveDate}`);
  if (!Array.isArray(value.cards) || !value.cards.length) throw new Error("video manifest needs at least one card");

  const cards = value.cards.map((rawCard, position): VideoCard => {
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) throw new Error(`video manifest card ${position + 1} is invalid`);
    const card = rawCard as Record<string, unknown>;
    const index = requireInteger(card.index, `video manifest card ${position + 1} index`);
    if (index !== position + 1) throw new Error(`video manifest card ${position + 1} has out-of-order index ${index}`);
    return {
      index,
      title: requireString(card.title, `video manifest card ${index} title`),
      body: requireString(card.body, `video manifest card ${index} body`),
      sourceIndex: requireInteger(card.sourceIndex, `video manifest card ${index} sourceIndex`),
      sourceQuestion: requireString(card.sourceQuestion, `video manifest card ${index} sourceQuestion`),
    };
  });

  return { version: 1, archiveDate, cards };
}

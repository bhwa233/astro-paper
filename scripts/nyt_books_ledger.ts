// NYT 图书推荐账本：通用 recommendation_ledger 之上的一层薄封装，只提供 ISBN 身份与 source 反解。
import path from "node:path";
import { compact, repoRoot } from "./blog_common.ts";
import { bulletValue, extractBullets, numberedBlocks } from "./compose_common.ts";
import { NYT_BOOK_SECTIONS, sectionByLabel } from "./nyt_books_sections.ts";
import { type Archived, type RecommendationLedgerSpec, appendRecommendations, loadRecommendationKeys } from "./recommendation_ledger.ts";

// listType 取分节 key（fiction / nonfiction）；仅作元数据，去重靠 ISBN key。
export type NytBookListType = string;

export type NytBookRecommendation = {
  key: string;
  listType: NytBookListType;
  bookId: string;
  title: string;
};

export type ArchivedNytBookRecommendation = Archived<NytBookRecommendation>;

export const NYT_BOOKS_LEDGER_REL_PATH = "data/nyt-books-weekly/recommended.json";

export function nytBooksLedgerPath(): string {
  return process.env.NYT_BOOKS_RECOMMENDED_LEDGER_FILE || path.join(repoRoot(), NYT_BOOKS_LEDGER_REL_PATH);
}

export function nytBookRecommendationKey(bookId: string): string {
  const id = compact(bookId);
  if (!id) throw new Error("invalid NYT book identifier: empty");
  return `book:${id}`;
}

const SPEC: RecommendationLedgerSpec<NytBookRecommendation> = {
  label: "NYT books",
  expectedKey: entry => nytBookRecommendationKey(entry.bookId),
};

export function loadNytBookRecommendationKeys(file = nytBooksLedgerPath(), excludePostPath = ""): Set<string> {
  return loadRecommendationKeys(SPEC, file, excludePostPath);
}

export function appendNytBookRecommendations(
  recommendations: NytBookRecommendation[],
  meta: { archivedAt: string; postPath: string },
  file = nytBooksLedgerPath()
): void {
  appendRecommendations(SPEC, recommendations, meta, file);
}

function listTypeFromLabel(label: string): NytBookListType {
  return sectionByLabel(label).key;
}

// 从候选源 markdown 反解出本篇推荐的图书身份，供归档后写入 ledger。
export function parseNytBookRecommendationsFromSource(source: string): NytBookRecommendation[] {
  // 按分节标题「# {label}候选」切段，逐段解析编号块。
  const marks = NYT_BOOK_SECTIONS.map(section => ({ section, at: source.indexOf(`# ${section.label}候选`) }))
    .filter(entry => entry.at >= 0)
    .sort((a, b) => a.at - b.at);
  return marks.flatMap((entry, index) => {
    const text = source.slice(entry.at, index + 1 < marks.length ? marks[index + 1].at : undefined);
    return numberedBlocks(text).map(block => {
      const bullets = extractBullets(block);
      const listType = listTypeFromLabel(bulletValue(bullets, "榜单类型"));
      if (listType !== entry.section.key) throw new Error(`NYT books source block list type mismatch: ${listType} vs ${entry.section.key}`);
      const bookId = bulletValue(bullets, "ISBN");
      const title = bulletValue(bullets, "原书名") || block.match(/^##\s+\d+\.\s+(.+)$/m)?.[1]?.trim() || "";
      return {
        key: nytBookRecommendationKey(bookId),
        listType,
        bookId: compact(bookId),
        title,
      };
    });
  });
}

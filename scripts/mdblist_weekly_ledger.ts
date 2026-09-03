// MDBList 影视推荐账本：通用 recommendation_ledger 之上的一层薄封装，只提供 TMDB 身份与 source 反解。
import path from "node:path";
import { repoRoot } from "./blog_common.ts";
import { bulletValue, extractBullets, numberedBlocks } from "./compose_common.ts";
import { type Archived, type RecommendationLedgerSpec, appendRecommendations, loadRecommendationKeys } from "./recommendation_ledger.ts";

export type MdblistMediaType = "movie" | "show";

export type MdblistRecommendation = {
  key: string;
  mediaType: MdblistMediaType;
  tmdbId: number;
  seasonNumber?: number;
  title: string;
};

export type ArchivedMdblistRecommendation = Archived<MdblistRecommendation>;

export const MDBLIST_LEDGER_REL_PATH = "data/mdblist-weekly/recommended.json";

export function mdblistLedgerPath(): string {
  return process.env.MDBLIST_RECOMMENDED_LEDGER_FILE || path.join(repoRoot(), MDBLIST_LEDGER_REL_PATH);
}

export function mdblistRecommendationKey(mediaType: MdblistMediaType, tmdbId: number, seasonNumber?: number): string {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new Error(`invalid MDBList TMDB id: ${tmdbId}`);
  if (mediaType === "movie") return `movie:${tmdbId}`;
  if (!Number.isInteger(seasonNumber) || Number(seasonNumber) <= 0) {
    throw new Error(`invalid MDBList season number for show ${tmdbId}: ${String(seasonNumber)}`);
  }
  return `show:${tmdbId}:season:${seasonNumber}`;
}

const SPEC: RecommendationLedgerSpec<MdblistRecommendation> = {
  label: "MDBList",
  // 存量条目从 JSON 读回时 tmdbId 可能是字符串，重算 key 前先归一。
  expectedKey: entry => mdblistRecommendationKey(entry.mediaType, Number(entry.tmdbId), entry.seasonNumber),
};

export function loadMdblistRecommendationKeys(file = mdblistLedgerPath(), excludePostPath = ""): Set<string> {
  return loadRecommendationKeys(SPEC, file, excludePostPath);
}

export function appendMdblistRecommendations(
  recommendations: MdblistRecommendation[],
  meta: { archivedAt: string; postPath: string },
  file = mdblistLedgerPath()
): void {
  appendRecommendations(SPEC, recommendations, meta, file);
}

export function parseMdblistRecommendationsFromSource(source: string): MdblistRecommendation[] {
  return numberedBlocks(source).map(block => {
    const bullets = extractBullets(block);
    const mediaLabel = bulletValue(bullets, "媒体类型");
    const mediaType: MdblistMediaType =
      mediaLabel === "电影"
        ? "movie"
        : mediaLabel === "剧集"
          ? "show"
          : (() => {
              throw new Error(`MDBList source has unsupported media type: ${mediaLabel || "missing"}`);
            })();
    const tmdbId = Number(bulletValue(bullets, "TMDB ID"));
    const seasonText = bulletValue(bullets, "推荐季度");
    const seasonNumber = mediaType === "show" ? Number(seasonText) : undefined;
    const title = bulletValue(bullets, "原标题") || block.match(/^##\s+\d+\.\s+(.+)$/m)?.[1]?.trim() || "";
    return {
      key: mdblistRecommendationKey(mediaType, tmdbId, seasonNumber),
      mediaType,
      tmdbId,
      ...(mediaType === "show" ? { seasonNumber } : {}),
      title,
    };
  });
}

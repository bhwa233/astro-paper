#!/usr/bin/env tsx
import { bjtTimestamp, clipText, compact, envPositiveInt, fetchJson, parseArgs, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import {
  type MdblistMediaType,
  type MdblistRecommendation,
  loadMdblistRecommendationKeys,
  mdblistLedgerPath,
  mdblistRecommendationKey,
} from "./mdblist_weekly_ledger.ts";

const MDBLIST_API = "https://api.mdblist.com";
const DEFAULT_LIMIT = 8;
const DEFAULT_CANDIDATE_LIMIT = 50;
const MIN_IMDB_RATING = 6;
const MIN_WEEKLY_ITEMS = 6;
const RATING_MATURITY_DAYS = 21;
const RELEASE_WINDOW_DAYS = [30, 45, 60] as const;
// mdblist 上 snoak 维护的 Trakt 趋势榜（数字 list id 比 slug 稳定），可用环境变量覆盖。
const DEFAULT_MOVIES_LIST = "87667"; // Trakt's Trending Movies
const DEFAULT_SHOWS_LIST = "88434"; // Trakt's Trending Shows

type MdblistIds = {
  imdb?: string | null;
  trakt?: number | string | null;
  tmdb?: number | string | null;
};

export type MdblistItem = {
  id?: number | string;
  title?: string;
  mediatype?: string;
  imdb_id?: string | null;
  release_year?: number;
  language?: string | null;
  ids?: MdblistIds | null;
};

type MdblistListResponse = { movies?: MdblistItem[]; shows?: MdblistItem[]; error?: string };

type MdblistRating = { source?: string; value?: number | null };
type MdblistGenre = { title?: string; name?: string };
export type MdblistSeasonEpisode = { votes?: number | null; rating?: number | null; episode_number?: number | null };
export type MdblistSeason = { season_number?: number | null; episodes?: MdblistSeasonEpisode[] | null };
export type MdblistMediaInfo = {
  description?: string | null;
  tagline?: string | null;
  year?: number | null;
  runtime?: number | null;
  released?: string | null;
  genres?: MdblistGenre[] | null;
  ratings?: MdblistRating[] | null;
  backdrop?: string | null;
  poster?: string | null;
  seasons?: MdblistSeason[] | null;
  error?: string;
};

type ListSpec = { label: string; mediaLabel: string; mediaType: "movie" | "show"; list: string };

type MdblistFilterDiagnostics = {
  listed: number;
  serverDateCandidates: number;
  rejectedDate: number;
  rejectedImdb: number;
  rejectedSeason: number;
  rejectedHistory: number;
  invalidTmdbId: number;
  eligible: number;
  selected: number;
  rejectedCandidates: MdblistRejectedCandidate[];
};

type MdblistRejectedCandidate = {
  title: string;
  tmdbId: string;
  releaseDate: string;
  imdbRating: string;
  reason: string;
};

export type EnrichedItem = { item: MdblistItem; info: MdblistMediaInfo | null };
export type SelectedMdblistCandidate = EnrichedItem & { recommendation: MdblistRecommendation };
export type MdblistReleaseWindow = { days: number; from: string; to: string };

function apiKey(): string {
  const key = compact(process.env.MDBLIST_API_KEY || "");
  if (!key) throw new Error("MDBLIST_API_KEY is required for mdblist-weekly source");
  return key;
}

function itemLimit(): number {
  return envPositiveInt("MDBLIST_ITEM_LIMIT", DEFAULT_LIMIT);
}

function candidateLimit(): number {
  return envPositiveInt("MDBLIST_CANDIDATE_LIMIT", DEFAULT_CANDIDATE_LIMIT);
}

function apiUrl(pathname: string, key: string, params: Record<string, string> = {}): string {
  const url = new URL(`${MDBLIST_API}${pathname}`);
  url.searchParams.set("apikey", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

function listItemsPath(list: string): string {
  const trimmed = compact(list).replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new Error("mdblist list identifier is empty");
  // `user/listname` 与数字 list id 都命中 /lists/{list}/items。
  return `/lists/${trimmed}/items`;
}

export function rollingMdblistReleaseWindows(
  date: string,
  windowDays: readonly number[] = RELEASE_WINDOW_DAYS,
  maturityDays = RATING_MATURITY_DAYS,
): MdblistReleaseWindow[] {
  const archiveDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(archiveDate.getTime()) || archiveDate.toISOString().slice(0, 10) !== date) {
    throw new Error(`invalid MDBList archive date: ${date}`);
  }
  if (!Number.isInteger(maturityDays) || maturityDays < 0) throw new Error(`invalid MDBList maturity days: ${maturityDays}`);
  if (!windowDays.length || windowDays.some(days => !Number.isInteger(days) || days < 1)) throw new Error("MDBList release windows need positive integer day counts");

  const to = new Date(archiveDate);
  to.setUTCDate(to.getUTCDate() - maturityDays);
  const toDate = to.toISOString().slice(0, 10);
  return [...windowDays]
    .sort((left, right) => left - right)
    .map(days => {
      const from = new Date(to);
      from.setUTCDate(from.getUTCDate() - (days - 1));
      return { days, from: from.toISOString().slice(0, 10), to: toDate };
    });
}

function isReleaseWithinWindow(released: string | null | undefined, releaseWindow: { from: string; to: string }): boolean {
  const releaseDate = compact(released || "").match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1];
  if (!releaseDate) return false;
  return releaseDate >= releaseWindow.from && releaseDate <= releaseWindow.to;
}

async function fetchListItems(spec: ListSpec, key: string, count: number, releaseWindow?: { from: string; to: string }): Promise<MdblistItem[]> {
  const params: Record<string, string> = { limit: String(count) };
  if (releaseWindow) {
    params.released_from = releaseWindow.from;
    params.released_to = releaseWindow.to;
  }
  const payload = await fetchJson<MdblistListResponse | MdblistItem[]>(apiUrl(listItemsPath(spec.list), key, params), {
    headers: { accept: "application/json" },
  });
  if (!Array.isArray(payload) && payload.error) throw new Error(`mdblist API error for ${spec.label}: ${payload.error}`);
  const items = Array.isArray(payload) ? payload : [...(payload.movies || []), ...(payload.shows || [])];
  const trimmed = items.slice(0, count);
  return trimmed;
}

async function fetchMediaInfo(item: MdblistItem, mediaType: "movie" | "show", key: string): Promise<MdblistMediaInfo | null> {
  const tmdb = item.ids?.tmdb;
  const imdb = compact(item.imdb_id || item.ids?.imdb || "");
  const path = tmdb ? `/tmdb/${mediaType}/${tmdb}` : imdb ? `/imdb/${mediaType}/${imdb}` : "";
  if (!path) return null;
  try {
    const info = await fetchJson<MdblistMediaInfo>(apiUrl(path, key), { headers: { accept: "application/json" } });
    return info && !info.error ? info : null;
  } catch {
    return null; // 补全失败不致命，退回稀疏字段。
  }
}

function genreText(info: MdblistMediaInfo | null): string {
  const names = (info?.genres || []).map(genre => compact(genre.title || genre.name || "")).filter(Boolean);
  return names.length ? names.join("、") : "-";
}

function ratingValue(info: MdblistMediaInfo | null, source: string): number | null {
  const rating = (info?.ratings || []).find(entry => entry.source === source);
  return typeof rating?.value === "number" && Number.isFinite(rating.value) ? rating.value : null;
}

function ratingText(info: MdblistMediaInfo | null): string {
  const parts: string[] = [];
  const imdb = ratingValue(info, "imdb");
  if (imdb !== null) parts.push(`IMDb ${imdb.toFixed(1)}`);
  const tomatoes = ratingValue(info, "tomatoes");
  if (tomatoes !== null) parts.push(`烂番茄 ${Math.round(tomatoes)}%`);
  const trakt = ratingValue(info, "trakt");
  if (trakt !== null) parts.push(`Trakt ${Math.round(trakt)}`);
  return parts.length ? parts.join(" / ") : "-";
}

function overviewText(info: MdblistMediaInfo | null): string {
  const overview = compact(info?.description || "");
  return overview ? clipText(overview, 400) : "-";
}

function releaseDateText(info: MdblistMediaInfo | null, item: MdblistItem): string {
  const released = compact(info?.released || "");
  if (released) return released;
  const year = info?.year || item.release_year;
  return typeof year === "number" && year > 0 ? String(year) : "-";
}

function posterUrl(info: MdblistMediaInfo | null): string {
  return compact(info?.backdrop || info?.poster || "") || "-";
}

export function latestStartedSeasonNumber(seasons: MdblistSeason[] | null | undefined): number | null {
  const started = (seasons || [])
    .filter(season => {
      const number = Number(season.season_number);
      if (!Number.isInteger(number) || number <= 0) return false;
      return (season.episodes || []).some(episode => Number(episode.votes || 0) > 0 || (typeof episode.rating === "number" && Number.isFinite(episode.rating)));
    })
    .map(season => Number(season.season_number));
  return started.length ? Math.max(...started) : null;
}

function recommendationForCandidate(candidate: EnrichedItem, mediaType: MdblistMediaType): MdblistRecommendation | null {
  if (!candidate.info) return null;
  const tmdbId = Number(candidate.item.ids?.tmdb);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  const imdbRating = ratingValue(candidate.info, "imdb");
  if (imdbRating === null || imdbRating < MIN_IMDB_RATING) return null;
  const seasonNumber = mediaType === "show" ? latestStartedSeasonNumber(candidate.info.seasons) : undefined;
  if (mediaType === "show" && seasonNumber === null) return null;
  return {
    key: mdblistRecommendationKey(mediaType, tmdbId, seasonNumber ?? undefined),
    mediaType,
    tmdbId,
    ...(mediaType === "show" ? { seasonNumber: seasonNumber as number } : {}),
    title: compact(candidate.item.title || ""),
  };
}

export function selectUnrecommendedMdblistCandidates(
  candidates: EnrichedItem[],
  mediaType: MdblistMediaType,
  recommendedKeys: Set<string>,
  count: number,
): SelectedMdblistCandidate[] {
  const blocked = new Set(recommendedKeys);
  const selected: SelectedMdblistCandidate[] = [];
  for (const candidate of candidates) {
    const recommendation = recommendationForCandidate(candidate, mediaType);
    if (!recommendation || blocked.has(recommendation.key)) continue;
    selected.push({ ...candidate, recommendation });
    blocked.add(recommendation.key);
    if (selected.length >= count) break;
  }
  return selected;
}

export function planMdblistWeeklySelection<T extends EnrichedItem>(
  movies: T[],
  shows: T[],
  windows: MdblistReleaseWindow[],
  targetCount = DEFAULT_LIMIT,
  minimumCount = Math.min(MIN_WEEKLY_ITEMS, targetCount),
): { window: MdblistReleaseWindow; movies: T[]; shows: T[]; eligibleCounts: Array<{ days: number; movies: number; shows: number; total: number }> } {
  if (!windows.length) throw new Error("MDBList selection needs at least one release window");
  if (!Number.isInteger(targetCount) || targetCount < 1) throw new Error(`invalid MDBList target count: ${targetCount}`);
  if (!Number.isInteger(minimumCount) || minimumCount < 1 || minimumCount > targetCount) throw new Error(`invalid MDBList minimum count: ${minimumCount}`);

  const candidatesByWindow = windows.map(window => {
    const windowMovies = movies.filter(candidate => isReleaseWithinWindow(candidate.info?.released, window));
    const windowShows = shows.filter(candidate => isReleaseWithinWindow(candidate.info?.released, window));
    return { window, movies: windowMovies, shows: windowShows, total: windowMovies.length + windowShows.length };
  });
  const chosen = candidatesByWindow.find(candidate => candidate.total >= minimumCount) || candidatesByWindow.at(-1)!;

  const movieTarget = Math.ceil(targetCount / 2);
  const showTarget = targetCount - movieTarget;
  const selectedMovies = chosen.movies.slice(0, movieTarget);
  const selectedShows = chosen.shows.slice(0, showTarget);
  let remaining = targetCount - selectedMovies.length - selectedShows.length;
  const movieOverflow = chosen.movies.slice(selectedMovies.length);
  const showOverflow = chosen.shows.slice(selectedShows.length);
  for (let index = 0; remaining > 0 && (index < movieOverflow.length || index < showOverflow.length); index += 1) {
    if (index < movieOverflow.length && remaining > 0) {
      selectedMovies.push(movieOverflow[index]);
      remaining -= 1;
    }
    if (index < showOverflow.length && remaining > 0) {
      selectedShows.push(showOverflow[index]);
      remaining -= 1;
    }
  }

  return {
    window: chosen.window,
    movies: selectedMovies,
    shows: selectedShows,
    eligibleCounts: candidatesByWindow.map(candidate => ({
      days: candidate.window.days,
      movies: candidate.movies.length,
      shows: candidate.shows.length,
      total: candidate.total,
    })),
  };
}

function sourceBlock(enriched: SelectedMdblistCandidate, index: number, spec: ListSpec): string {
  const { item, info, recommendation } = enriched;
  const title = compact(item.title || `未命名作品 ${index + 1}`);
  // 剧集的 runtime 是全季累计分钟，作为单片「片长」会误导，只在电影里给出。
  const runtimeLine = spec.mediaType === "movie" && typeof info?.runtime === "number" && info.runtime > 0 ? [`- 片长：${info.runtime} 分钟`] : [];
  return [
    `## ${index + 1}. ${title}`,
    `- 原标题：${title}`,
    `- 媒体类型：${spec.mediaLabel}`,
    `- TMDB ID：${recommendation.tmdbId}`,
    ...(recommendation.seasonNumber ? [`- 推荐季度：${recommendation.seasonNumber}`] : []),
    `- 题材(EN)：${genreText(info)}`,
    `- 上映日期：${releaseDateText(info, item)}`,
    ...runtimeLine,
    `- 评分：${ratingText(info)}`,
    `- 海报：${posterUrl(info)}`,
    `- 语言：${compact(item.language || "-") || "-"}`,
    `- IMDb：${item.imdb_id ? `https://www.imdb.com/title/${item.imdb_id}/` : "-"}`,
    `- 简介(EN)：${overviewText(info)}`,
  ].join("\n");
}

function formatFilterDiagnostics(spec: ListSpec, diagnostics: MdblistFilterDiagnostics): string {
  return `- ${spec.mediaLabel}：榜单候选 ${diagnostics.listed}，60 天日期候选 ${diagnostics.serverDateCandidates}，日期淘汰 ${diagnostics.rejectedDate}，IMDb 淘汰 ${diagnostics.rejectedImdb}，剧季淘汰 ${diagnostics.rejectedSeason}，账本淘汰 ${diagnostics.rejectedHistory}，无有效 TMDB ID ${diagnostics.invalidTmdbId}，60 天内通过全部规则 ${diagnostics.eligible}，最终入选 ${diagnostics.selected}`;
}

function rejectedCandidate(
  item: MdblistItem,
  info: MdblistMediaInfo | null,
  tmdbId: number | null,
  reason: string,
): MdblistRejectedCandidate {
  const imdbRating = ratingValue(info, "imdb");
  return {
    title: compact(item.title || "") || "未命名作品",
    tmdbId: tmdbId && tmdbId > 0 ? String(tmdbId) : "-",
    releaseDate: releaseDateText(info, item),
    imdbRating: imdbRating === null ? "缺失" : imdbRating.toFixed(1),
    reason,
  };
}

function formatRejectedCandidateDiagnostics(spec: ListSpec, diagnostics: MdblistFilterDiagnostics): string[] {
  const heading = `### ${spec.mediaLabel}淘汰明细`;
  if (!diagnostics.rejectedCandidates.length) return [heading, "", "- 无（服务端日期候选均通过后续规则或没有日期候选）", ""];
  return [
    heading,
    "",
    ...diagnostics.rejectedCandidates.map(candidate => `- ${candidate.title}｜TMDB ID：${candidate.tmdbId}｜上映日期：${candidate.releaseDate}｜IMDb：${candidate.imdbRating}｜淘汰原因：${candidate.reason}`),
    "",
  ];
}

async function buildSection(
  spec: ListSpec,
  key: string,
  candidatesToFetch: number,
  recommendedKeys: Set<string>,
  releaseWindow: MdblistReleaseWindow,
): Promise<{ candidates: SelectedMdblistCandidate[]; diagnostics: MdblistFilterDiagnostics }> {
  // 日期条件继续由 MDBList 服务端执行；同时读取同一榜单的未过滤计数，供只读诊断产物解释日期层淘汰量。
  const [allItems, items] = await Promise.all([
    fetchListItems(spec, key, candidatesToFetch),
    fetchListItems(spec, key, candidatesToFetch, releaseWindow),
  ]);
  const diagnostics: MdblistFilterDiagnostics = {
    listed: allItems.length,
    serverDateCandidates: items.length,
    rejectedDate: Math.max(0, allItems.length - items.length),
    rejectedImdb: 0,
    rejectedSeason: 0,
    rejectedHistory: 0,
    invalidTmdbId: 0,
    eligible: 0,
    selected: 0,
    rejectedCandidates: [],
  };
  const candidates: SelectedMdblistCandidate[] = [];
  const blocked = new Set(recommendedKeys);
  for (const item of items) {
    const tmdbId = Number(item.ids?.tmdb);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      diagnostics.invalidTmdbId += 1;
      diagnostics.rejectedCandidates.push(rejectedCandidate(item, null, null, "无有效 TMDB ID"));
      continue;
    }
    const candidate: EnrichedItem = { item, info: await fetchMediaInfo(item, spec.mediaType, key) };
    if (!isReleaseWithinWindow(candidate.info?.released, releaseWindow)) {
      diagnostics.rejectedDate += 1;
      diagnostics.rejectedCandidates.push(rejectedCandidate(item, candidate.info, tmdbId, `详情上映日期不在 ${releaseWindow.days} 天滚动窗口`));
      continue;
    }
    const imdbRating = ratingValue(candidate.info, "imdb");
    if (imdbRating === null || imdbRating < MIN_IMDB_RATING) {
      diagnostics.rejectedImdb += 1;
      diagnostics.rejectedCandidates.push(rejectedCandidate(item, candidate.info, tmdbId, imdbRating === null ? "IMDb 评分缺失" : `IMDb ${imdbRating.toFixed(1)} < ${MIN_IMDB_RATING.toFixed(1)}`));
      continue;
    }
    if (spec.mediaType === "show" && latestStartedSeasonNumber(candidate.info?.seasons) === null) {
      diagnostics.rejectedSeason += 1;
      diagnostics.rejectedCandidates.push(rejectedCandidate(item, candidate.info, tmdbId, "没有已开播季度"));
      continue;
    }
    const recommendation = recommendationForCandidate(candidate, spec.mediaType);
    if (!recommendation) {
      diagnostics.invalidTmdbId += 1;
      diagnostics.rejectedCandidates.push(rejectedCandidate(item, candidate.info, tmdbId, "无法建立推荐身份"));
      continue;
    }
    if (blocked.has(recommendation.key)) {
      diagnostics.rejectedHistory += 1;
      diagnostics.rejectedCandidates.push(rejectedCandidate(item, candidate.info, tmdbId, "已在推荐账本中"));
      continue;
    }
    diagnostics.eligible += 1;
    candidates.push({ ...candidate, recommendation });
    blocked.add(recommendation.key);
  }
  return { candidates, diagnostics };
}

function listSpecs(): ListSpec[] {
  return [
    { label: "movies", mediaLabel: "电影", mediaType: "movie", list: compact(process.env.MDBLIST_MOVIES_LIST || DEFAULT_MOVIES_LIST) },
    { label: "shows", mediaLabel: "剧集", mediaType: "show", list: compact(process.env.MDBLIST_SHOWS_LIST || DEFAULT_SHOWS_LIST) },
  ];
}

export async function buildMdblistWeeklySource(
  date: string,
  count = itemLimit(),
  {
    candidatesToFetch = candidateLimit(),
    ledgerFile = mdblistLedgerPath(),
    excludePostPath = "",
  }: { candidatesToFetch?: number; ledgerFile?: string; excludePostPath?: string } = {},
): Promise<string> {
  const key = apiKey();
  const specs = listSpecs();
  if (!Number.isInteger(candidatesToFetch) || candidatesToFetch < count) {
    throw new Error(`MDBList candidate limit must be at least the final item limit: ${candidatesToFetch} < ${count}`);
  }
  const recommendedKeys = loadMdblistRecommendationKeys(ledgerFile, excludePostPath);
  const releaseWindows = rollingMdblistReleaseWindows(date);
  const widestWindow = releaseWindows.at(-1)!;
  const sections = await Promise.all(specs.map(spec => buildSection(spec, key, candidatesToFetch, recommendedKeys, widestWindow)));
  const selection = planMdblistWeeklySelection(sections[0].candidates, sections[1].candidates, releaseWindows, count);
  const selectedBySection = [selection.movies, selection.shows];
  sections.forEach((section, index) => {
    section.diagnostics.selected = selectedBySection[index].length;
  });
  const sourceSections = selectedBySection.map((selected, index) =>
    selected.length ? [`# ${specs[index].mediaLabel}候选`, "", ...selected.map((entry, rank) => sourceBlock(entry, rank, specs[index])), ""] : [],
  );
  return [
    `# 每周影视推荐候选源｜${date}`,
    "",
    "来源：mdblist 聚合的 Trakt 趋势电影与剧集榜单（media 元数据来自 IMDb/TMDb/Trakt 等）",
    `接口：${MDBLIST_API}/lists/{list}/items`,
    `抓取时间：${bjtTimestamp()}`,
    `评分成熟截止：${selection.window.to}（归档日前 ${RATING_MATURITY_DAYS} 天）`,
    `上映日期：${selection.window.from} 至 ${selection.window.to}（最终采用 ${selection.window.days} 天滚动窗口）`,
    `候选池：电影与剧集各取最多 ${candidatesToFetch} 部，按 ${RELEASE_WINDOW_DAYS.join(" / ")} 天逐级扩窗，过滤 IMDb >= ${MIN_IMDB_RATING.toFixed(1)} 与历史推荐后，目标 ${count} 部、最低 ${Math.min(MIN_WEEKLY_ITEMS, count)} 部`,
    "类型配比：优先电影与剧集各占一半，一侧不足时由另一侧补齐",
    "剧集额外要求：存在已开播季度；同一剧集按最新已开播季去重",
    "",
    "筛选诊断（只读产物）：",
    ...selection.eligibleCounts.map(window => `- ${window.days} 天窗口：电影 ${window.movies}，剧集 ${window.shows}，合计 ${window.total}`),
    ...sections.map((section, index) => formatFilterDiagnostics(specs[index], section.diagnostics)),
    "",
    "筛选明细（只读产物，仅列出服务端日期候选中在后续规则被淘汰的作品）：",
    ...sections.flatMap((section, index) => formatRejectedCandidateDiagnostics(specs[index], section.diagnostics)),
    "数据说明：榜单代表近期 Trakt 趋势热度，不是官方权威排名。请据证据写推荐，不要编造评分、剧情或上线日期。",
    "",
    ...sourceSections.flat(),
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = stringArg(args, "date", new Date().toISOString().slice(0, 10));
  const count = Number(stringArg(args, "limit", String(itemLimit())));
  const candidatesToFetch = Number(stringArg(args, "candidate-limit", String(candidateLimit())));
  writeStdout(
    await buildMdblistWeeklySource(date, Number.isInteger(count) && count > 0 ? count : itemLimit(), {
      candidatesToFetch: Number.isInteger(candidatesToFetch) && candidatesToFetch > 0 ? candidatesToFetch : candidateLimit(),
      ledgerFile: stringArg(args, "ledger-file", mdblistLedgerPath()),
      excludePostPath: stringArg(args, "exclude-post-path"),
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(`ERROR: ${message}`);
    process.exit(1);
  });
}

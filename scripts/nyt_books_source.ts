#!/usr/bin/env tsx
import { bjtTimestamp, clipText, compact, fetchJson, parseArgs, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { splitBookBlurb } from "./book_blurb.ts";
import { fetchGoogleBookInfo } from "./google_books.ts";
import { NYT_BOOK_SECTIONS, type NytBookSection } from "./nyt_books_sections.ts";
import { type NytBookRecommendation, loadNytBookRecommendationKeys, nytBookRecommendationKey, nytBooksLedgerPath } from "./nyt_books_ledger.ts";

const NYT_BOOKS_API = "https://api.nytimes.com/svc/books/v3";
// 只推「本周首次上榜」的真·新书：weeks_on_list==1 排除回榜老书。
const MAX_WEEKS_ON_LIST = 1;

type NytBook = {
  rank?: number;
  rank_last_week?: number;
  weeks_on_list?: number;
  title?: string;
  author?: string;
  publisher?: string;
  description?: string;
  book_image?: string;
  primary_isbn13?: string;
  primary_isbn10?: string;
};

type NytOverviewList = { list_name_encoded?: string; books?: NytBook[] };
type NytOverviewResponse = {
  status?: string;
  results?: { published_date?: string; lists?: NytOverviewList[] };
  fault?: { faultstring?: string };
};

// 证据层补齐的字段：简介来自 Google Books，荣誉与书评从同一段出版社文案里拆出。
type NytBookEnrichment = { honors: string[]; praise: string[] };

export type NytBookCandidate = { book: NytBook; recommendation: NytBookRecommendation; enrichment: NytBookEnrichment };

// 抛出后由 generate_scheduled_post 识别为「本周无新书」跳过，而不是记为失败。
export class NytBooksNoNewReleasesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NytBooksNoNewReleasesError";
  }
}

function apiKey(): string {
  const key = compact(process.env.NYT_API_KEY || "");
  if (!key) throw new Error("NYT_API_KEY is required for nyt-books-weekly source");
  return key;
}

const MIN_SYNOPSIS_CHARS = 60;

// 逐本补证据：Google Books 提供出版社文案（简介 + 荣誉 + 书评引文）。
// 顺序执行避免打爆配额（默认 1000 次/天）；失败静默，不阻断生成。
async function enrichCandidates(candidates: NytBookCandidate[]): Promise<void> {
  for (const candidate of candidates) {
    const { book, enrichment } = candidate;
    const title = compact(book.title || "");
    const author = compact(book.author || "");

    // NYT 的 description 是一句话导语，荣誉与书评只有出版社文案里有，所以每本都查。
    const info = await fetchGoogleBookInfo(bookId(book), title, author);
    if (info) {
      const blurb = splitBookBlurb(info.description);
      enrichment.honors = blurb.honors;
      enrichment.praise = blurb.praise;
      // 只有拆出的正文足够长才替换 NYT 简介，避免整段都是引文时正文被清空。
      const nytSynopsis = compact(book.description || "");
      if (blurb.synopsis.length >= MIN_SYNOPSIS_CHARS && blurb.synopsis.length > nytSynopsis.length) {
        book.description = blurb.synopsis;
      }
    }
  }
}

// overview.json 一次返回全部活跃榜单，避开 NYT 5 次/分钟的逐榜限流。
async function fetchOverview(key: string): Promise<Map<string, NytBook[]>> {
  const url = new URL(`${NYT_BOOKS_API}/lists/overview.json`);
  url.searchParams.set("api-key", key);
  const payload = await fetchJson<NytOverviewResponse>(url.toString(), { headers: { accept: "application/json" } });
  if (payload.status && payload.status !== "OK") throw new Error(`NYT overview API error: ${payload.fault?.faultstring || payload.status}`);
  const lists = payload.results?.lists || [];
  if (!lists.length) throw new Error("NYT overview returned no lists");
  const byEncoded = new Map<string, NytBook[]>();
  for (const list of lists) {
    const encoded = compact(list.list_name_encoded || "");
    if (encoded) byEncoded.set(encoded, list.books || []);
  }
  return byEncoded;
}

function bookId(book: NytBook): string {
  return compact(book.primary_isbn13 || book.primary_isbn10 || "");
}

function isNewRelease(book: NytBook): boolean {
  const weeks = Number(book.weeks_on_list);
  return Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_WEEKS_ON_LIST;
}

// 本轮跨榜兜底去重：同名同作者视为同一本，防止个别格式榜用不同 ISBN 造成重复条目。
function titleAuthorKey(book: NytBook): string {
  return `${compact(book.title || "").toLowerCase()}|${compact(book.author || "").toLowerCase()}`;
}

function coverUrl(book: NytBook): string {
  return compact(book.book_image || "") || "-";
}

// 荣誉与书评分行给出，别和简介混在一起：模型看到整段营销文案会把书评人的主观评价
// 当成客观事实写进内容简介。
function sourceBlock(candidate: NytBookCandidate, index: number, section: NytBookSection): string {
  const { book, recommendation, enrichment } = candidate;
  const title = compact(book.title || `未命名图书 ${index + 1}`);
  return [
    `## ${index + 1}. ${title}`,
    `- 原书名：${title}`,
    `- 榜单类型：${section.label}`,
    `- ISBN：${recommendation.bookId}`,
    `- 作者：${compact(book.author || "-") || "-"}`,
    `- 封面：${coverUrl(book)}`,
    `- 简介(EN)：${compact(book.description || "") ? clipText(book.description || "", 400) : "-"}`,
    `- 荣誉(EN)：${enrichment.honors.length ? clipText(enrichment.honors.join(" / "), 240) : "-"}`,
    `- 书评(EN)：${enrichment.praise.length ? clipText(enrichment.praise.join(" | "), 400) : "-"}`,
  ].join("\n");
}

function selectSection(
  section: NytBookSection,
  overview: Map<string, NytBook[]>,
  blockedKeys: Set<string>,
  blockedTitleAuthor: Set<string>
): NytBookCandidate[] {
  const selected: NytBookCandidate[] = [];
  for (const list of section.lists) {
    for (const book of overview.get(list) || []) {
      if (!isNewRelease(book)) continue;
      const id = bookId(book);
      if (!id) continue; // 畅销书基本都有 ISBN，缺失无法稳定去重，跳过。
      const key = nytBookRecommendationKey(id);
      const taKey = titleAuthorKey(book);
      if (blockedKeys.has(key) || blockedTitleAuthor.has(taKey)) continue;
      blockedKeys.add(key);
      blockedTitleAuthor.add(taKey);
      selected.push({
        book,
        recommendation: { key, listType: section.key, bookId: id, title: compact(book.title || "") },
        enrichment: { honors: [], praise: [] },
      });
    }
  }
  return selected;
}

function renderSection(section: NytBookSection, selected: NytBookCandidate[]): { blocks: string[]; recommendations: NytBookRecommendation[] } {
  if (!selected.length) return { blocks: [], recommendations: [] };
  return {
    blocks: [`# ${section.label}候选`, "", ...selected.map((entry, index) => sourceBlock(entry, index, section)), ""],
    recommendations: selected.map(entry => entry.recommendation),
  };
}

export async function buildNytBooksWeeklySource(
  date: string,
  { ledgerFile = nytBooksLedgerPath(), excludePostPath = "" }: { ledgerFile?: string; excludePostPath?: string } = {}
): Promise<string> {
  const overview = await fetchOverview(apiKey());
  const blockedKeys = loadNytBookRecommendationKeys(ledgerFile, excludePostPath);
  const blockedTitleAuthor = new Set<string>();
  const selections = NYT_BOOK_SECTIONS.map(section => selectSection(section, overview, blockedKeys, blockedTitleAuthor));
  const total = selections.reduce((sum, selected) => sum + selected.length, 0);
  if (!total) {
    throw new NytBooksNoNewReleasesError(`NYT books lists have no brand-new (week 1) unrecommended titles for ${date}`);
  }
  // NYT 常缺 description，先用 Google Books 补齐并拆出荣誉/书评再渲染，避免模型靠书名编空话。
  await enrichCandidates(selections.flat());
  const sections = NYT_BOOK_SECTIONS.map((section, index) => renderSection(section, selections[index]));
  const sourceLists = [...new Set(NYT_BOOK_SECTIONS.flatMap(section => section.lists))].join(", ");
  return [
    `# 每周图书推荐候选源｜${date}`,
    "",
    `来源：纽约时报畅销书榜 overview（${NYT_BOOK_SECTIONS.map(section => section.label).join(" / ")}）`,
    `接口：${NYT_BOOKS_API}/lists/overview.json`,
    `聚合榜单：${sourceLists}`,
    `抓取时间：${bjtTimestamp()}`,
    `筛选口径：仅保留本周首次上榜（上榜周数 = ${MAX_WEEKS_ON_LIST}）且未推荐过的图书，跨榜按 ISBN 与书名作者去重`,
    "",
    "数据说明：榜单代表纽约时报统计的近期销量热度。请据证据翻译改写，不要编造作者、情节或评分。",
    "字段说明：「简介」为剧情正文；「荣誉」为媒体书单与榜单头衔；「书评」为出版社文案中带署名的评论引文，",
    "三者已在证据层拆开，写作时不要互相混用，尤其不要把书评人的主观评价写成客观事实。",
    "",
    ...sections.flatMap(section => section.blocks),
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = stringArg(args, "date", new Date().toISOString().slice(0, 10));
  writeStdout(
    await buildNytBooksWeeklySource(date, {
      ledgerFile: stringArg(args, "ledger-file", nytBooksLedgerPath()),
      excludePostPath: stringArg(args, "exclude-post-path"),
    })
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(`ERROR: ${message}`);
    process.exit(1);
  });
}

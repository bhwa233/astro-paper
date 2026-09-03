// Google Books 取简介：NYT overview 对新书常缺 description，靠书名硬编简介会得到空话。
// 取代此前的 OpenLibrary 兜底——同一批 NYT 新书实测 OpenLibrary 命中 4/11，Google Books 11/11。
// 注意：averageRating 已全线不返回（热门书同样为空），本模块不取评分。
import { compact, fetchJson, stripHtml } from "./blog_common.ts";

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";

export type GoogleBookInfo = {
  description: string;
  categories: string[];
};

type GoogleVolumeInfo = {
  title?: string;
  authors?: string[];
  description?: string;
  categories?: string[];
  language?: string;
  industryIdentifiers?: { identifier?: string }[];
};

type GoogleVolumesResponse = {
  totalItems?: number;
  items?: { volumeInfo?: GoogleVolumeInfo }[];
};

export function googleBooksApiKey(): string {
  return compact(process.env.GOOGLE_BOOKS_API_KEY || "");
}

// 姓氏级别的宽松比对：Google 的 authors 常带中间名或 "et al"，全串相等会误杀。
function authorMatches(expected: string, candidates: string[] = []): boolean {
  const surname = compact(expected).split(/\s+/).pop()?.toLowerCase() || "";
  if (!surname) return true;
  return candidates.some(name => name.toLowerCase().includes(surname));
}

function queryUrl(query: string, key: string): string {
  const url = new URL(GOOGLE_BOOKS_API);
  url.searchParams.set("q", query);
  url.searchParams.set("key", key);
  url.searchParams.set("maxResults", "5");
  return url.toString();
}

async function search(query: string, key: string): Promise<GoogleVolumeInfo[]> {
  try {
    const payload = await fetchJson<GoogleVolumesResponse>(queryUrl(query, key), {
      headers: { accept: "application/json" },
      retries: 1,
    });
    return (payload.items || []).map(item => item.volumeInfo || {});
  } catch {
    return []; // 配额耗尽 / 限流 / 网络故障：不阻断生成
  }
}

function isEnglish(volume: GoogleVolumeInfo): boolean {
  const language = compact(volume.language || "").toLowerCase();
  return !language || language.startsWith("en");
}

// 书名搜索会捞到蹭原作的解读本、速读本，它们的作者字段也常带上原作者。
const DERIVATIVE_TITLE = /\b(summary|analysis|study guide|workbook|sidekick|conversation starters|in \d+ minutes)\b/i;

function normalizeTitle(text: string): string {
  return compact(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function bestDescription(volumes: GoogleVolumeInfo[], author = "", wantedTitle = ""): GoogleBookInfo | null {
  const wanted = normalizeTitle(wantedTitle);
  const scored = volumes
    .map(volume => ({ volume, description: compact(stripHtml(volume.description || "")) }))
    .filter(entry => entry.description.length > 0)
    .filter(entry => !author || authorMatches(author, entry.volume.authors || []))
    .filter(entry => !DERIVATIVE_TITLE.test(compact(entry.volume.title || "")))
    .sort((a, b) => {
      // 书名完全一致的版本优先，避免选中同系列的其它卷。
      if (wanted) {
        const byTitle = Number(normalizeTitle(b.volume.title || "") === wanted) - Number(normalizeTitle(a.volume.title || "") === wanted);
        if (byTitle) return byTitle;
      }
      // 再按语言。只按长度排会选中其它语种版本
      // （实测 Outliers 的西班牙语版文案最长，直接把简介变成了西班牙文）。
      const byLanguage = Number(isEnglish(b.volume)) - Number(isEnglish(a.volume));
      if (byLanguage) return byLanguage;
      // 同语言下，文案最长的那版通常带完整荣誉与书评引文。
      return b.description.length - a.description.length;
    });
  const top = scored[0];
  if (!top) return null;
  return { description: top.description, categories: (top.volume.categories || []).map(compact).filter(Boolean) };
}

/**
 * 先按 ISBN 精确查；查不到再按「书名 + 作者」兜底（命中的往往是同书的其它版本 ISBN，
 * 简介一致，可用）。无 API key 或全部落空时返回 null，调用方自行回落。
 */
export async function fetchGoogleBookInfo(isbn: string, title = "", author = ""): Promise<GoogleBookInfo | null> {
  const key = googleBooksApiKey();
  if (!key) return null;

  const id = compact(isbn);
  if (id) {
    // ISBN 唯一确定一个版本，只认真正登记了该 ISBN 的条目。
    // 否则同一次查询里的改写本、导读本会被当成同书（实测 Outliers 会命中一本 30 分钟速读指南）。
    const exact = (await search(`isbn:${id}`, key)).filter(volume => (volume.industryIdentifiers || []).some(entry => compact(entry.identifier || "") === id));
    const byIsbn = bestDescription(exact);
    if (byIsbn) return byIsbn;
  }

  const name = compact(title);
  if (!name) return null;
  const authorClause = compact(author) ? ` inauthor:${compact(author)}` : "";
  return bestDescription(await search(`intitle:${name}${authorClause}`, key), author, name);
}

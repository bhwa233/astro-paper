// 豆瓣中译本书名：官方译名优于模型自己翻的名字。
// 豆瓣已无公开 API（api.douban.com/v2 与 frodo 接口均已关闭），这里只用读书站的补全接口，
// 再跟一跳详情页核对「原作名」——补全接口会串到同名笔记本、系列前作甚至无关书，
// 只靠书名相似度挂钩会挂错书。
//
// 现实预期：NYT 新书当周基本没有中译本，命中率接近 0；老书才有戏。因此全程失败静默，
// 拿不到就留空，交回模型翻译。GitHub 托管 runner 是境外机房 IP，被拒的概率不低。
import { compact, fetchJson, fetchText } from "./blog_common.ts";

const DOUBAN_SUGGEST_API = "https://book.douban.com/j/subject_suggest";
const DOUBAN_SUBJECT_URL = "https://book.douban.com/subject";

type DoubanSuggestItem = {
  title?: string;
  author_name?: string;
  year?: string;
  type?: string; // "b" = 图书，"a" = 作者
  id?: string;
};

export type DoubanBookMatch = {
  titleZh: string;
  id: string;
};

export function doubanLookupEnabled(): boolean {
  return compact(process.env.DOUBAN_LOOKUP || "1") !== "0";
}

function hasChineseChars(text: string): boolean {
  return /[一-鿿]/.test(text);
}

// 比对用的归一化：只留字母数字，避免副标题标点、大小写、连字符造成的假阴性。
function normalizeTitle(text: string): string {
  return compact(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mainTitle(text: string): string {
  return compact(text).split(/[:：]/)[0] || compact(text);
}

/**
 * 补全接口的怪癖（实测）：
 * - 查询里带作者名几乎必然返回 []（"Sapiens Harari" 就是空的），所以只用书名查。
 * - 带完整副标题会命中英文原版条目，去掉副标题反而返回中译本，因此两种都试。
 */
function suggestQueries(title: string): string[] {
  const full = compact(title);
  const main = mainTitle(full);
  return full === main ? [full] : [full, main];
}

function suggestUrl(query: string): string {
  const url = new URL(DOUBAN_SUGGEST_API);
  url.searchParams.set("q", query);
  return url.toString();
}

async function suggest(query: string): Promise<DoubanSuggestItem[]> {
  try {
    const items = await fetchJson<DoubanSuggestItem[]>(suggestUrl(query), {
      headers: { accept: "application/json", referer: "https://book.douban.com/" },
      retries: 0, // 反爬敏感，不重试，失败即放弃
      timeoutMs: 10_000,
    });
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

/**
 * 详情页核对「原作名」。豆瓣中译本条目会登记英文原名，两边主标题一致才认。
 * 页面拿不到或没有该字段时返回 false——宁可留空，也不要挂错书。
 */
async function matchesOriginalTitle(id: string, englishTitle: string): Promise<boolean> {
  try {
    const html = await fetchText(`${DOUBAN_SUBJECT_URL}/${id}/`, {
      headers: { referer: "https://book.douban.com/" },
      retries: 0,
      timeoutMs: 12_000,
      maxChars: 400_000,
    });
    const original = compact(html.match(/原作名:<\/span>([^<]+)/)?.[1] || "");
    if (!original) return false;
    const wanted = normalizeTitle(englishTitle);
    const got = normalizeTitle(original);
    if (!wanted || !got) return false;
    if (got.startsWith(wanted) || wanted.startsWith(got)) return true;
    // 副标题差异：主标题相同也算命中（Salt vs Salt: A World History）。
    return normalizeTitle(mainTitle(original)) === normalizeTitle(mainTitle(englishTitle));
  } catch {
    return false;
  }
}

/**
 * 用英文书名查中译本。只接受标题含中文、且详情页「原作名」与英文书名对得上的条目。
 * 作者名不参与校验：中译本条目的作者是译名（如「[以色列] 尤瓦尔·赫拉利」），无法与英文原名比对。
 */
export async function fetchDoubanChineseTitle(title: string): Promise<DoubanBookMatch | null> {
  if (!doubanLookupEnabled()) return null;
  const name = compact(title);
  if (!name) return null;

  const seen = new Set<string>();
  for (const query of suggestQueries(name)) {
    for (const item of await suggest(query)) {
      if (compact(item.type || "") !== "b") continue;
      const titleZh = compact(item.title || "");
      const id = compact(item.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (!titleZh || !hasChineseChars(titleZh)) continue; // 英文原版条目对中文读者没意义
      if (await matchesOriginalTitle(id, name)) return { titleZh, id };
    }
  }
  return null;
}

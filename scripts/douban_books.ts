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

// 单次生成里最多访问的详情页数，防止某本书的版本列表很长时把请求量放大。
const MAX_SUBJECT_FETCHES = 4;

type DoubanSubject = {
  titleZh: string;
  originalTitle: string;
  otherEditionIds: string[];
};

function titlesAlign(original: string, englishTitle: string): boolean {
  const wanted = normalizeTitle(englishTitle);
  const got = normalizeTitle(original);
  if (!wanted || !got) return false;
  if (got.startsWith(wanted) || wanted.startsWith(got)) return true;
  // 副标题差异：主标题相同也算命中（Salt vs Salt: A World History）。
  return normalizeTitle(mainTitle(original)) === normalizeTitle(mainTitle(englishTitle));
}

// 「这本书的其他版本」区块里只有出版社和年份，书名要跟进各版本页面才拿得到。
function parseOtherEditionIds(html: string): string[] {
  const at = html.indexOf("这本书的其他版本");
  if (at < 0) return [];
  const block = html.slice(at, at + 3_000);
  const ids = [...block.matchAll(/book\.douban\.com\/subject\/(\d+)\//g)].map(match => match[1]);
  return [...new Set(ids)];
}

async function fetchSubject(id: string): Promise<DoubanSubject | null> {
  try {
    const html = await fetchText(`${DOUBAN_SUBJECT_URL}/${id}/`, {
      headers: { referer: "https://book.douban.com/" },
      retries: 0, // 反爬敏感，不重试，失败即放弃
      timeoutMs: 12_000,
      maxChars: 400_000,
    });
    return {
      titleZh: compact(html.match(/<span property="v:itemreviewed">([^<]+)/)?.[1] || ""),
      originalTitle: compact(html.match(/原作名:<\/span>([^<]+)/)?.[1] || ""),
      otherEditionIds: parseOtherEditionIds(html),
    };
  } catch {
    return null;
  }
}

/**
 * 用英文书名查中译本。
 *
 * 补全接口用英文名查，返回的几乎总是英文原版条目（查 Outliers 只返回英文版 3134517，
 * 中译本《异类》只有用中文名才搜得到），所以命中英文条目时要再跟一跳「这本书的其他版本」。
 *
 * 无论走哪条路，最终都要求落地条目「标题含中文」且「原作名」与英文书名对得上。
 * 作者名不参与校验：中译本的作者字段是译名（如「[以色列] 尤瓦尔·赫拉利」），没法跟英文原名比。
 */
export async function fetchDoubanChineseTitle(title: string): Promise<DoubanBookMatch | null> {
  if (!doubanLookupEnabled()) return null;
  const name = compact(title);
  if (!name) return null;

  const visited = new Set<string>();
  const fetchOnce = async (id: string): Promise<DoubanSubject | null> => {
    if (visited.has(id) || visited.size >= MAX_SUBJECT_FETCHES) return null;
    visited.add(id);
    return fetchSubject(id);
  };

  for (const query of suggestQueries(name)) {
    for (const item of await suggest(query)) {
      if (compact(item.type || "") !== "b") continue;
      const id = compact(item.id || "");
      if (!id) continue;

      const subject = await fetchOnce(id);
      if (!subject) continue;

      // 补全接口偶尔直接给出中译本（Sapiens 就是），能自证就不用再跳。
      if (hasChineseChars(subject.titleZh) && titlesAlign(subject.originalTitle, name)) {
        return { titleZh: subject.titleZh, id };
      }
      // 命中的是英文原版：确认确实是同一本，再逐个看它的其它版本。
      if (!titlesAlign(subject.titleZh, name)) continue;
      for (const editionId of subject.otherEditionIds) {
        const edition = await fetchOnce(editionId);
        if (!edition) continue;
        if (hasChineseChars(edition.titleZh) && titlesAlign(edition.originalTitle, name)) {
          return { titleZh: edition.titleZh, id: editionId };
        }
      }
    }
  }
  return null;
}

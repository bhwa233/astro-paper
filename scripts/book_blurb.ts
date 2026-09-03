// 出版社文案拆解：Google Books 的 description 把「媒体荣誉」「书评引文」「剧情简介」揉成一段。
// 整段喂给模型会让它把书评人的主观评价当客观事实写进内容简介，所以在证据层先拆开。
//
// 这类文案没有换行、项目符号或稳定的句号（实测 Google Books 返回的是纯文本长串），
// 只能靠「标题式大写词串」判断边界：荣誉与署名几乎全是 Title Case，正文一进入普通英文
// 句子就会出现连续小写词。因此统一用一个 token 扫描器找结尾，而不是用贪婪正则。
import { compact, stripHtml } from "./blog_common.ts";

export type BookBlurb = {
  synopsis: string;
  honors: string[];
  praise: string[];
};

// Title Case 串里允许夹带的小写虚词，后面必须再跟大写词才算延续（如 Books of Summer）。
const CONNECTORS = new Set(["of", "the", "and", "for", "to", "in", "on", "a", "an", "de", "von"]);

// 正文常见的起句词。出现在串的中后段时，说明荣誉/署名已经结束、剧情简介开始了。
const SENTENCE_STARTERS = new Set([
  "From",
  "In",
  "When",
  "After",
  "Before",
  "With",
  "Now",
  "Set",
  "Born",
  "Told",
  "It",
  "She",
  "He",
  "They",
  "But",
  "And",
  "As",
  "By",
  "Here",
  "There",
  "A",
  "An",
]);

// 起句词要出现在第 4 个 token 之后才当作边界，否则 "A Good Morning America ... Pick!"
// 这类以起句词开头的荣誉会被从头截断。
const STARTER_MIN_INDEX = 3;

function isCapitalized(token: string): boolean {
  return /^[A-Z#(]/.test(token) || /^\d/.test(token);
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * 从 text 开头取一段「标题式大写词串」，返回其字符长度。
 * 遇到连续小写词、起句词或超出 maxTokens 即停止。
 */
function titleCaseRunLength(text: string, maxTokens: number): number {
  const tokens = tokenize(text);
  let kept = 0;
  for (let i = 0; i < tokens.length && i < maxTokens; i += 1) {
    const token = tokens[i];
    // 引号是硬边界：多条书评首尾相接时，署名会一路吃进下一条引文的开头。
    if (/["“”]/.test(token)) break;
    const bare = token.replace(/^[^\w#(]+/, "");
    if (i >= STARTER_MIN_INDEX && SENTENCE_STARTERS.has(bare.replace(/[^A-Za-z]/g, ""))) break;
    if (isCapitalized(bare)) {
      kept = i + 1;
      continue;
    }
    // 小写虚词只有在后面还接大写词时才算串的一部分。
    const next = tokens[i + 1];
    if (CONNECTORS.has(bare.toLowerCase()) && next && isCapitalized(next.replace(/^[^\w#(]+/, ""))) continue;
    break;
  }
  // 串尾若是正文起句词（"… —Bill Bryson An enthralling…"），连它一起丢掉。
  while (kept > 1 && SENTENCE_STARTERS.has(tokens[kept - 1].replace(/[^A-Za-z]/g, ""))) kept -= 1;
  if (!kept) return 0;
  // 把前 kept 个 token 还原成原文长度（保留 token 之间的原始空白）。
  let cursor = 0;
  for (let i = 0; i < kept; i += 1) {
    const at = text.indexOf(tokens[i], cursor);
    cursor = at + tokens[i].length;
  }
  return cursor;
}

function tidy(text: string): string {
  return compact(text)
    .replace(/\s+([,.;:!?])/g, "$1") // 剪掉引文后残留的孤立标点
    .replace(/^[\s•|,–—-]+/, "")
    .replace(/[\s•|,–—-]+$/, "");
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const QUOTE_PATTERN = /["“]([^"”]{15,400})["”]/g;
const ATTRIBUTION_LEAD = /^\s*[—–-]{1,2}\s*/;

// 署名优先在逗号处截断（"—Ava Reid, #1 New York Times bestselling author of ..." 只要姓名），
// 没有逗号就取一段大写词串（"—New York Times In her luminous debut" 只要报名）。
function attributionLength(text: string): number {
  const lead = text.match(ATTRIBUTION_LEAD);
  if (!lead) return 0;
  const rest = text.slice(lead[0].length);
  const comma = rest.indexOf(",");
  // 5 个词足够容纳最长的报刊名（New York Times Book Review），再多就会吃进正文首词。
  const run = titleCaseRunLength(rest, 5);
  if (!run) return 0;
  const take = comma > 0 && comma < run ? comma : run;
  return lead[0].length + take;
}

// 自成一体、边界明确的荣誉句式。其余靠 titleCaseRunLength 收尾。
// 刻意不匹配裸的「The X's …」所有格：实测它命中的全是书名（The Handmaid's Tale、
// The Winemaker's Wife），把书名当荣誉剪掉会让正文断句。
const HONOR_HEADS = [
  /(?:#\d+\s+)?(?:INSTANT\s+)?(?:NEW YORK TIMES|USA TODAY|WALL STREET JOURNAL|NATIONAL|INTERNATIONAL)\s+BESTSELLER/gi,
  /An?\s+[A-Z][^.!•|]{3,80}?\s+Pick!/g,
  /One of\s+[A-Z]/g,
];

export function splitBookBlurb(description = ""): BookBlurb {
  const text = compact(stripHtml(description));
  if (!text) return { synopsis: "", honors: [], praise: [] };

  // 先按字符打掩码，最后一次性取出未被占用的部分作为正文，避免多次 replace 破坏下标。
  const masked = new Array<boolean>(text.length).fill(false);
  const mask = (start: number, end: number) => {
    for (let i = start; i < end && i < masked.length; i += 1) masked[i] = true;
  };

  const praise: string[] = [];
  QUOTE_PATTERN.lastIndex = 0;
  for (let match = QUOTE_PATTERN.exec(text); match; match = QUOTE_PATTERN.exec(text)) {
    const quoteEnd = match.index + match[0].length;
    const attribution = attributionLength(text.slice(quoteEnd));
    if (!attribution) continue; // 没有署名的引号多半是书名或强调，不当书评
    const source = tidy(text.slice(quoteEnd, quoteEnd + attribution).replace(ATTRIBUTION_LEAD, ""));
    const quote = tidy(match[1]);
    if (quote && source) {
      praise.push(`${quote} —— ${source.replace(/[.,;:]$/, "")}`);
      mask(match.index, quoteEnd + attribution);
    }
  }

  const honors: string[] = [];
  for (const head of HONOR_HEADS) {
    head.lastIndex = 0;
    for (let match = head.exec(text); match; match = head.exec(text)) {
      if (masked[match.index]) continue;
      // BESTSELLER / Pick! 两类自带结尾，直接用整段匹配；其余从匹配起点继续吃大写词串。
      const selfClosing = /BESTSELLER$/i.test(match[0]) || match[0].endsWith("Pick!");
      const length = selfClosing ? match[0].length : titleCaseRunLength(text.slice(match.index), 18);
      if (!length) continue;
      const honor = tidy(text.slice(match.index, match.index + length));
      if (honor.length < 6) continue;
      honors.push(honor);
      mask(match.index, match.index + length);
    }
  }

  const synopsis = tidy(
    text
      .split("")
      .map((char, index) => (masked[index] ? " " : char))
      .join("")
  );
  return { synopsis, honors: dedupe(honors), praise: dedupe(praise) };
}

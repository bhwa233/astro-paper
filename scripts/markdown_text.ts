// 纯文本 / Markdown 工具层：不碰文件系统、不引第三方，任何层都可以安全引用。
// 这些函数原先住在 astro_paper_archive.ts 里，而那个模块（经 magazine.ts）会拖入
// adm-zip / jsdom / fast-xml-parser，导致每个 compose 模块和它们的测试都要加载一整套 DOM 实现。
import { compact } from "./blog_common.ts";

export function hasChinese(text: string): boolean {
  return /[㐀-鿿]/.test(text);
}

// HN 标题原则上必须翻译；只有紧凑的产品/模型专名可保留英文，例如 Pixel Watch 5、Qwen3.8-2.4T。
export function isCompactProperNameOrModelTitle(title: string): boolean {
  const parts = title.trim().split(/\s+/);
  return parts.length >= 1 && parts.length <= 4 && parts.some(part => /\d/.test(part)) && parts.every(part => /^[A-Z0-9][A-Za-z0-9.-]*$/.test(part));
}

export function looksLowSignal(text = ""): boolean {
  const c = compact(text);
  if (!c) return true;
  return /评论(?:补充)?信息不足|信息不足|评论信号不足|原文页面提取失败|页面提取失败|待补充/.test(c);
}

export function extractBullets(block: string): string[] {
  return block
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("- "))
    .map(line => line.slice(2).trim());
}

export function bulletValue(bullets: string[], label: string): string {
  return (
    bullets
      .find(bullet => bullet.startsWith(label))
      ?.split("：")
      .slice(1)
      .join("：")
      .trim() || ""
  );
}

// source 与中间契约 Markdown 都以 `## N. 标题` / `### N. 标题` 编号块承载证据。
export function numberedBlocks(text: string, depth = 2): string[] {
  const marker = new RegExp(`^#{${depth}}\\s+\\d+\\.\\s+`);
  return text
    .split(new RegExp(`(?=^#{${depth}}\\s+\\d+\\.\\s+)`, "gm"))
    .map(block => block.trim())
    .filter(block => marker.test(block));
}

// CommonMark 右向定界规则：闭合的 **（含 * __ _）若紧邻标点、又紧跟非空白非标点
// 字符，就不构成 right-flanking，无法闭合，整段被当作字面量星号。中文句子常以 。！？
// 结尾紧接下一句、中间无空格，正好命中，导致 `**要点。**后文` 里的加粗失效。
// 把贴着闭合标记的尾随标点移到标记外部（`**要点**。后文`），让加粗正常闭合。
const EMPHASIS_TRAIL_PUNCT = "。！？；：，、．….!?;:";
// 其后若已是这些标点，本就满足 right-flanking、能正常闭合，无需改写。
const EMPHASIS_FOLLOW_PUNCT = EMPHASIS_TRAIL_PUNCT + "）】」』〉》”’\"')]}";

function escapeCharClass(chars: string): string {
  return chars.replace(/[\]\\^-]/g, "\\$&");
}

const EMPHASIS_BOUNDARY_RE = new RegExp(
  "(`+[^`\\n]*`+)" + // 行内代码：原样保留，避免误伤其中标点
    // (?<![*_]) 与后面排除 *_：避免从 ** 连续星号里切走单个 *，否则会把
    // 已正常闭合（如后接空格/行尾）的加粗拆坏。
    "|(?<![*_])(\\*\\*|__|\\*|_)([^*_\\n]+?)([" +
    escapeCharClass(EMPHASIS_TRAIL_PUNCT) +
    "]+)\\2(?=[^\\s*_" +
    escapeCharClass(EMPHASIS_FOLLOW_PUNCT) +
    "])",
  "g"
);

export function fixEmphasisPunctuationBoundary(text: string): string {
  return text.replace(EMPHASIS_BOUNDARY_RE, (match, code, open, inner, punct) => (code !== undefined ? code : `${open}${inner}${open}${punct}`));
}

// Markdown 正文块：保留段落与列表结构，只压掉多余空白。
// sanitizeGeneratedText 相反，它会把整块压成单行纯文本，只适合单句字段。
export function normalizeMarkdownBlock(raw: unknown): string {
  return fixEmphasisPunctuationBoundary(
    String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

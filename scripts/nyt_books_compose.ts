// NYT 每周图书规则层：模型只返回语义字段（中文书名/类型/内容简介），
// 事实字段（原书名、作者、封面、书评链接）一律取自 source。分节由 nyt_books_sections 集中配置。
import { bulletValue, extractBullets, hasChinese, looksLowSignal, parseModelJsonObject } from "./compose_common.ts";
import { NYT_BOOK_SECTIONS } from "./nyt_books_sections.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type NytBookModelItem = {
  rank: number;
  title_zh: string;
  genre_zh: string;
  summary: string;
};

export type NytBookFact = {
  rank: number;
  original_title: string;
  author: string;
  review_link: string;
  cover: string;
};

function parseSectionFacts(sectionText: string): NytBookFact[] {
  const blocks = sectionText
    .split(/(?=^##\s+\d+\.\s+)/gm)
    .map(block => block.trim())
    .filter(block => /^##\s+\d+\.\s+/.test(block));
  return blocks.map((block, index) => {
    const bullets = extractBullets(block);
    const link = bulletValue(bullets, "书评链接");
    return {
      rank: index + 1,
      original_title: bulletValue(bullets, "原书名") || block.match(/^##\s+\d+\.\s+(.+)$/m)?.[1]?.trim() || "",
      author: bulletValue(bullets, "作者"),
      review_link: link && link !== "-" ? link : "",
      cover: bulletValue(bullets, "封面"),
    };
  });
}

// source 按「# {label}候选」分段，任一节可能缺席（当周该类无新书）。返回以分节 key 为索引的事实表。
export function parseNytBookFacts(source: string): Record<string, NytBookFact[]> {
  const marks = NYT_BOOK_SECTIONS.map(section => ({ section, at: source.indexOf(`# ${section.label}候选`) }))
    .filter(entry => entry.at >= 0)
    .sort((a, b) => a.at - b.at);
  const facts: Record<string, NytBookFact[]> = {};
  for (const section of NYT_BOOK_SECTIONS) facts[section.key] = [];
  marks.forEach((entry, index) => {
    const text = source.slice(entry.at, index + 1 < marks.length ? marks[index + 1].at : undefined);
    facts[entry.section.key] = parseSectionFacts(text);
  });
  return facts;
}

function validateModelItems(rawItems: unknown, label: string): NytBookModelItem[] {
  if (rawItems === undefined) return [];
  if (!Array.isArray(rawItems)) throw new Error(`nyt-books model JSON ${label} must be an array`);
  return rawItems.map((entry, index) => {
    const item = (entry || {}) as Record<string, unknown>;
    const rank = Number(item.rank);
    if (!Number.isInteger(rank) || rank < 1) throw new Error(`nyt-books ${label} item ${index + 1} has invalid rank: ${String(item.rank)}`);
    const titleZh = String(item.title_zh || "").trim();
    if (!titleZh || !hasChinese(titleZh)) throw new Error(`nyt-books ${label} rank ${rank} title_zh should use a Chinese title: ${titleZh}`);
    const genreZh = String(item.genre_zh || "").trim();
    if (!genreZh) throw new Error(`nyt-books ${label} rank ${rank} is missing genre_zh`);
    const summary = String(item.summary || "").trim();
    if (!summary || looksLowSignal(summary)) throw new Error(`nyt-books ${label} rank ${rank} has empty or low-signal summary`);
    return { rank, title_zh: titleZh, genre_zh: genreZh, summary };
  });
}

export function parseNytBookModelJson(raw: string): Record<string, NytBookModelItem[]> {
  const parsed = parseModelJsonObject(raw, "nyt-books");
  const model: Record<string, NytBookModelItem[]> = {};
  let total = 0;
  for (const section of NYT_BOOK_SECTIONS) {
    model[section.key] = validateModelItems(parsed[section.key], section.key);
    total += model[section.key].length;
  }
  if (total < 1) throw new Error("nyt-books model JSON needs at least one book");
  return model;
}

function composeWork(model: NytBookModelItem, fact: NytBookFact): string {
  const lines = [`### ${model.title_zh}（${fact.original_title}）`, ""];
  if (fact.cover && fact.cover !== "-") lines.push(`![${model.title_zh}](${fact.cover})`, "");
  const review = fact.review_link ? `<br><br>书评链接：${escapeHtml(fact.review_link)}` : "";
  // A single compact block avoids dozens of repeatedly styled heading and
  // paragraph nodes when a full weekly list contains many books.
  lines.push(
    `<div style="margin:0 8px 1.5em">作者：${escapeHtml(fact.author || "未标明")} ｜ 类型：${escapeHtml(model.genre_zh)}<br><br>${escapeHtml(model.summary)}${review}</div>`,
  );
  return lines.join("\n");
}

function composeSection(heading: string, models: NytBookModelItem[], facts: NytBookFact[]): string {
  if (!models.length) return "";
  if (models.length !== facts.length) {
    throw new Error(`nyt-books ${heading} model count does not match source count: ${models.length} vs ${facts.length}`);
  }
  const modelRanks = new Set(models.map(model => model.rank));
  if (modelRanks.size !== models.length) throw new Error(`nyt-books ${heading} model contains duplicate ranks`);
  const byRank = new Map(facts.map(fact => [fact.rank, fact]));
  const works = models.map(model => {
    const fact = byRank.get(model.rank);
    if (!fact) throw new Error(`nyt-books ${heading} model JSON references missing rank ${model.rank}`);
    return composeWork(model, fact);
  });
  return [`## ${heading}`, "", works.join("\n\n")].join("\n");
}

export function composeNytBooksBody(model: Record<string, NytBookModelItem[]>, facts: Record<string, NytBookFact[]>): string {
  const sections = NYT_BOOK_SECTIONS.map(section => composeSection(section.label, model[section.key] || [], facts[section.key] || [])).filter(Boolean);
  if (!sections.length) throw new Error("nyt-books produced no book sections");
  return `${sections.join("\n\n")}\n`;
}

export function nytBooksMarkdownFromModelJson(raw: string, source: string): string {
  const facts = parseNytBookFacts(source);
  const model = parseNytBookModelJson(raw);
  return composeNytBooksBody(model, facts);
}

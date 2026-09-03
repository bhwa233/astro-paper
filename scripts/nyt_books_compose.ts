// NYT 每周图书规则层：模型只返回语义字段（中文书名/类型/内容简介，以及荣誉与书评的译文），
// 事实字段（原书名、作者、封面）一律取自 source。分节由 nyt_books_sections 集中配置。
//
// 荣誉与书评只做翻译、不做生成：证据缺失时对应段落整块不渲染，宁可空着也不让模型自拟推荐语。
import { bulletValue, extractBullets, hasChinese, looksLowSignal, numberedBlocks, parseModelJsonObject } from "./compose_common.ts";
import { NYT_BOOK_SECTIONS } from "./nyt_books_sections.ts";

export type NytBookModelItem = {
  rank: number;
  title_zh: string;
  genre_zh: string;
  summary: string;
  honors: string;
  praise: string;
};

export type NytBookFact = {
  rank: number;
  original_title: string;
  author: string;
  cover: string;
};

function parseSectionFacts(sectionText: string): NytBookFact[] {
  const blocks = numberedBlocks(sectionText);
  return blocks.map((block, index) => {
    const bullets = extractBullets(block);
    return {
      rank: index + 1,
      original_title: bulletValue(bullets, "原书名") || block.match(/^##\s+\d+\.\s+(.+)$/m)?.[1]?.trim() || "",
      author: bulletValue(bullets, "作者"),
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
    // 荣誉与书评都是可选证据：source 里为「-」时模型应输出空串，不能自己补一条。
    const honors = String(item.honors || "").trim();
    const praise = String(item.praise || "").trim();
    return { rank, title_zh: titleZh, genre_zh: genreZh, summary, honors, praise };
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
  const title = model.title_zh;
  const hardBreak = "\\";
  const lines = [`### ${title}（${fact.original_title}）`, ""];
  if (fact.cover && fact.cover !== "-") lines.push(`![${title}](${fact.cover})`, "");
  lines.push(`作者：${fact.author || "未标明"}${hardBreak}`, `类型：${model.genre_zh}${hardBreak}`, `内容简介：${hardBreak}`, model.summary);
  if (model.honors) lines.push("", `荣誉：${hardBreak}`, model.honors);
  if (model.praise) lines.push("", `书评：${hardBreak}`, model.praise);
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
  return [heading, "", works.join("\n\n")].join("\n");
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

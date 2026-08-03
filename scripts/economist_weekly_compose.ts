import { bulletValue, decodeMarkdownBlock, extractBullets, hasChinese, looksLowSignal } from "./compose_common.ts";

export type EconomistArticleSummary = {
  rank: number;
  titleZh: string;
  oneSentenceSummary: string;
  corePoint: string;
  contentSummary: string;
};

function sourceBlocks(source: string): string[] {
  return source
    .split(/(?=^##\s+\d+\.\s+)/gm)
    .map(block => block.trim())
    .filter(block => /^##\s+\d+\.\s+/.test(block));
}

export function parseEconomistArticleSummaries(source: string): EconomistArticleSummary[] {
  const ranks = new Set<number>();
  return sourceBlocks(source).map((block, index) => {
    const rank = Number(block.match(/^##\s+(\d+)\./m)?.[1]);
    const bullets = extractBullets(block);
    const titleZh = bulletValue(bullets, "中文标题");
    const oneSentenceSummary = bulletValue(bullets, "一句话摘要");
    const corePoint = bulletValue(bullets, "核心观点");
    const contentSummary = decodeMarkdownBlock(bulletValue(bullets, "内容总结"));
    if (!Number.isInteger(rank) || rank < 1 || ranks.has(rank)) throw new Error(`economist weekly article ${index + 1} has invalid or duplicate rank`);
    ranks.add(rank);
    if (!titleZh || !hasChinese(titleZh)) throw new Error(`economist weekly rank ${rank} needs a Chinese title`);
    if ([oneSentenceSummary, corePoint, contentSummary].some(looksLowSignal)) throw new Error(`economist weekly rank ${rank} has empty or low-signal summary`);
    if (![oneSentenceSummary, corePoint, contentSummary].every(hasChinese)) throw new Error(`economist weekly rank ${rank} summaries must be Chinese`);
    if (/^\s{0,3}#{1,6}\s/m.test(contentSummary)) throw new Error(`economist weekly rank ${rank} content_summary must not use Markdown headings`);
    return { rank, titleZh, oneSentenceSummary, corePoint, contentSummary };
  });
}

// Derive the frontmatter description from the first article's one-sentence summary.
function economistWeeklyDescription(articles: EconomistArticleSummary[]): string {
  return (articles[0]?.oneSentenceSummary || "").replace(/\s+/g, " ").trim().slice(0, 30);
}

// The per-article summaries are already fully generated upstream; the issue post is a
// deterministic aggregation of them — no issue-level model call, no overview/reading-route.
export function economistWeeklyMarkdown(source: string): { markdown: string; description: string } {
  const articles = parseEconomistArticleSummaries(source);
  if (articles.length < 3) throw new Error(`economist weekly source needs at least three articles, got ${articles.length}`);
  const renderedArticles = articles.map(article => {
    const lines = [`## ${article.titleZh}`, ""];
    lines.push(
      "### 一句话摘要",
      "",
      article.oneSentenceSummary,
      "",
      "### 核心观点",
      "",
      article.corePoint,
      "",
      "### 内容总结",
      "",
      article.contentSummary,
    );
    return lines.join("\n");
  });
  return { markdown: `${renderedArticles.join("\n\n")}\n`, description: economistWeeklyDescription(articles) };
}

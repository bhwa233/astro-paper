export type BalancedTitle = { fontSize: number; lines: string[] };

function characterWidth(character: string): number {
  if (/\s/.test(character)) return 0.35;
  return character.codePointAt(0)! <= 0x7f ? 0.55 : 1;
}

function tokenWidth(token: string): number {
  return [...token].reduce((sum, character) => sum + characterWidth(character), 0);
}

function tokenizeChineseTitle(text: string): string[] {
  const openingPunctuation = new Set(["（", "【", "《", "「", "『", "“"]);
  const closingPunctuation = new Set(["，", "。", "！", "？", "、", "）", "】", "》", "」", "』", "”"]);
  const suffixes = new Set(["了", "的", "地", "得", "着", "过", "后", "前", "中", "内", "外", "上", "下", "里", "间", "时", "人员", "们", "吗", "呢", "吧", "啊", "呀"]);
  const segments = [...new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(text)].map(item => item.segment);
  const tokens: string[] = [];
  let prefix = "";
  for (const segment of segments) {
    if (openingPunctuation.has(segment)) {
      prefix += segment;
    } else if ((closingPunctuation.has(segment) || suffixes.has(segment)) && tokens.length) {
      tokens[tokens.length - 1] += segment;
    } else {
      tokens.push(`${prefix}${segment}`);
      prefix = "";
    }
  }
  if (prefix) {
    if (tokens.length) tokens[tokens.length - 1] += prefix;
    else tokens.push(prefix);
  }
  return tokens;
}

function balancedLines(tokens: string[], maxWidth: number): string[] | null {
  const widths = tokens.map(tokenWidth);
  if (widths.some(width => width > maxWidth)) return null;
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const lineCount = Math.max(1, Math.ceil(totalWidth / maxWidth));
  const idealWidth = totalWidth / lineCount;
  const memo = new Map<string, { cost: number; lines: string[] } | null>();

  const solve = (start: number, linesLeft: number): { cost: number; lines: string[] } | null => {
    const key = `${start}:${linesLeft}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (linesLeft === 0) return start === tokens.length ? { cost: 0, lines: [] } : null;
    let width = 0;
    let best: { cost: number; lines: string[] } | null = null;
    for (let end = start; end < tokens.length; end += 1) {
      width += widths[end]!;
      if (width > maxWidth) break;
      const remainder = solve(end + 1, linesLeft - 1);
      if (!remainder) continue;
      const cost = (width - idealWidth) ** 2 + remainder.cost;
      if (!best || cost < best.cost) best = { cost, lines: [tokens.slice(start, end + 1).join(""), ...remainder.lines] };
    }
    memo.set(key, best);
    return best;
  };

  return solve(0, lineCount)?.lines ?? null;
}

/** Fits a Chinese title by word groups, then balances its HTML lines around the center axis. */
export function fitBalancedChineseTitle({
  text,
  width,
  height,
  lineHeight,
  min,
  max,
}: {
  text: string;
  width: number;
  height: number;
  lineHeight: number;
  min: number;
  max: number;
}): BalancedTitle {
  const tokens = tokenizeChineseTitle(text);
  for (let fontSize = max; fontSize >= min; fontSize -= 1) {
    const lines = balancedLines(tokens, width / fontSize);
    if (lines && lines.length * fontSize * lineHeight <= height) return { fontSize, lines };
  }
  return { fontSize: min, lines: balancedLines(tokens, width / min) ?? [text] };
}

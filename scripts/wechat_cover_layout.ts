// 微信首图的条目字号：Reddit 与微博两张封面共用同一套 satori 版式，只有品牌行不同，
// 因此排版尺寸这一段抽出来共享——两边各留一份分档表的话，改了条数只改一边就会裁字。
//
// 版式尺寸（两张封面都是 1175×500，卡片宽 88%、高 80%，内框宽 90%、条目区 maxHeight 84%）：
//   文本列宽 = 1175 × 88% − 8(边框) → 内框 90% ≈ 923px，扣掉项目符号与它的 14px 间距，按 860px 估
//   条目区高 = 500 × 80% − 8(边框) → 内框 90% ≈ 353px，× 84% ≈ 296px
const TEXT_WIDTH = 860;
const LIST_HEIGHT = 296;
const ENTRY_GAP = 10;
const LINE_HEIGHT = 1.35;
// 上游译名卡在 40 字，40 × 20px = 800px 仍是单行，所以 20 是「最长标题也不折行」的下界。
// 再往下缩字就小到封面读不清，与其继续缩不如让它折行。
const MIN_FONT_SIZE = 20;

/**
 * 取宽度与高度两个约束的较小值：宽度保证最长的一条不折行，高度保证 n 条不被 overflow 裁掉。
 * CJK 字形按 1.0em 估宽，标题里的 ASCII 更窄，因此这个估计只会偏保守。
 */
export function coverEntryFontSize(titles: string[], maxFontSize: number): number {
  if (!titles.length) throw new Error("WeChat cover font sizing needs at least one title");
  const longest = Math.max(...titles.map(title => [...title].length));
  const widthFit = Math.floor(TEXT_WIDTH / longest);
  const heightFit = Math.floor((LIST_HEIGHT - ENTRY_GAP * (titles.length - 1)) / (titles.length * LINE_HEIGHT));
  return Math.max(MIN_FONT_SIZE, Math.min(maxFontSize, widthFit, heightFit));
}

// 微信图片消息的共用尺寸与文字适配公式。业务卡片自己决定信息层级和版式。

/** 微信图片消息按 1:1 展示。1080 是公众号图片的常用长边，再大只是徒增素材体积。 */
export const WECHAT_CARD_SIZE = 1080;

/**
 * 自动字号：让 `characters` 个字排进 `width × height` 的框里。
 *
 * CJK 一字约 1em 宽，于是 n 个字占 n·f 的行长，折成 n·f/width 行，每行 lineHeight·f 高：
 *
 *   n·f/width × lineHeight·f ≤ height  ⇒  f ≤ √(width × height / (lineHeight × n))
 *
 * 拉丁字符比 1em 窄，所以这个估计只会偏保守——宁可字小一号，也不要 satori 把末尾几行
 * 溢出裁掉，那是静默丢内容。
 */
export function cardFontSize({
  characters,
  width,
  height,
  lineHeight,
  min,
  max,
}: {
  characters: number;
  width: number;
  height: number;
  lineHeight: number;
  min: number;
  max: number;
}): number {
  if (!Number.isInteger(characters) || characters < 1) throw new Error(`invalid WeChat card character count: ${characters}`);
  const fitted = Math.floor(Math.sqrt((width * height) / (lineHeight * characters)));
  return Math.max(min, Math.min(max, fitted));
}

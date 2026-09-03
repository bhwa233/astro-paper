import type { FontData } from "astro:assets";

/**
 * 找某个字重、样式下指定格式的字体文件路径。
 *
 * astro 的 fontData 是「一个格式一条记录」而不是「一条记录多个 src」：同一字重会有
 * 一条 woff2（可变字体，各字重共用一个文件）和一条 woff。所以要扫完全部记录再挑格式，
 * 不能在第一条字重匹配的记录里就地回退——那样拿到的永远是 woff2，而 satori 不认它。
 */
export function getFontPathByWeight(
  fonts: FontData[],
  weight: number,
  options?: {
    style?: "normal" | "italic";
    format?: string;
  }
): string | undefined {
  const style = options?.style ?? "normal";
  const format = options?.format ?? "woff";

  const candidates = fonts.filter(
    font => font.weight === String(weight) && font.style === style
  );
  for (const font of candidates) {
    const src = font.src.find(file => file.format === format);
    if (src) return src.url;
  }
  return candidates[0]?.src[0]?.url;
}

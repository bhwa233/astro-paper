/**
 * Estimate reading time in minutes from raw markdown.
 *
 * CJK-aware: counts CJK characters and Latin words separately, since a
 * whitespace split badly undercounts Chinese/Japanese/Korean text. Uses
 * ~400 CJK chars/min and ~200 words/min as blended reading speeds.
 */
const CJK = /[一-鿿぀-ヿㇰ-ㇿ가-힯]/g;

export function getReadingTime(body: string): number {
  const text = body ?? "";
  const cjkChars = (text.match(CJK) || []).length;
  const words = (text.replace(CJK, " ").match(/[A-Za-z0-9]+/g) || []).length;
  const minutes = cjkChars / 400 + words / 200;
  return Math.max(1, Math.round(minutes));
}

/**
 * Compact word counts for the post meta line: 942 stays 942, 5432 becomes
 * 5.4k, 12000 becomes 12k.
 *
 * Hand-rolled rather than Intl.NumberFormat compact notation, which renders
 * "5.4千" / "1.2万" under zh-CN and would read differently per locale in a
 * line that is otherwise icons and digits.
 */
export function formatCompactCount(count: number): string {
  if (count < 1000) return String(count);
  const thousands = (count / 1000).toFixed(1).replace(/\.0$/, "");
  return `${thousands}k`;
}

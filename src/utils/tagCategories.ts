/**
 * 两层标签体系的第一层。
 *
 * 放在 src/ 而不是 scripts/，理由和 platformTheme.ts 一样：站点运行时够不着 scripts 的模块解析，
 * 反过来 scripts 用相对路径 import 这里没有障碍。本文件只有常量和纯函数，
 * 不碰 astro:content、@/ 别名和任何 Node API，两边都能安全引用。
 *
 * 生成侧的约束在 scripts/blog_tasks.ts：每个任务挑一个分类，taskTags() 输出 [分类, 栏目]。
 * 站点侧只需要判断某个 tag 是不是分类，用来把 /tags 分成两组。
 */

/**
 * 顺序即展示顺序，不按字母排。这一层只有六项，人工排比 localeCompare 更贴近阅读预期：
 * 先按站点更新频率，最后放已停更的 `财经`。
 */
export const TAG_CATEGORIES = [
  "技术",
  "播客",
  "社区",
  "阅读",
  "推荐",
  "财经",
] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number];

/**
 * `财经` 名下的两个栏目（市场日报、数字货币日报）都已停更，只存在于存量文章，
 * 在 BLOG_TASKS 里没有对应任务。它照样是分类：读者看到的是文章，不是任务表。
 */
const CATEGORY_SET: ReadonlySet<string> = new Set(TAG_CATEGORIES);

export function isTagCategory(tag: string): tag is TagCategory {
  return CATEGORY_SET.has(tag);
}

/**
 * 把标签列表拆成「分类」和「栏目」两组。
 *
 * 分类按 TAG_CATEGORIES 的固定顺序，栏目保持调用方给的顺序（getUniqueTags 已按 slug 排过）。
 * 手写文章的 `随笔`、`notes` 这类真标签不属于任何分类，会落在栏目组里——
 * 这是对的：它们和栏目一样，都是「点进去看一批文章」的叶子节点。
 */
export function partitionTagsByCategory<
  T extends { tag: string; tagName: string },
>(tags: readonly T[]): { categories: T[]; columns: T[] } {
  const categories: T[] = [];
  const columns: T[] = [];

  for (const entry of tags) {
    if (isTagCategory(entry.tagName)) continue;
    columns.push(entry);
  }

  for (const name of TAG_CATEGORIES) {
    const hit = tags.find(entry => entry.tagName === name);
    if (hit) categories.push(hit);
  }

  return { categories, columns };
}

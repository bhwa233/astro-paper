#!/usr/bin/env tsx
// 一次性迁移：把存量文章的 frontmatter tags 改成两层「分类 / 栏目」。
// 跑完即删。留在仓库里没有意义——它只对迁移前的那批文件成立，第二次跑是空操作。
//
// 顺序有硬约束：这个脚本必须先落地，blog_tasks.ts 的改名才能合。
// 反过来做，中间那段窗口里 verify_blog_generation.ts 的 `frontmatter.includes(info.tag)`
// 会让月更任务在历史归档上判失败（2026-08-11 杂志改名连挂两轮就是这个形状）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeStderr, writeStdout } from "./blog_common.ts";

// 不复用 blog_common 的 repoRoot()：它走 `new URL(...).pathname`，UNC 路径下会把主机名丢掉，
// 开发机是 Windows 挂 WSL 时算出来的根目录不存在。CI 在 Linux 上跑不到这个问题，所以不动那边。
function repoRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

const POSTS_DIR = "src/content/posts";

/** 五个分类之外多出来的 `财经`：三批已停更的行情日报，栏目名在 BLOG_TASKS 里已经没有对应任务。 */
const CATEGORIES = ["技术", "播客", "社区", "阅读", "推荐", "财经"] as const;
type Category = (typeof CATEGORIES)[number];

/** 按现有栏目 tag 迁移。值是迁移后的完整 tags。 */
const BY_TAG: Record<string, readonly [Category, string]> = {
  HackerNews: ["技术", "HackerNews"],
  GitHub项目日报: ["技术", "GitHub项目日报"],
  技术日报: ["技术", "技术日报"],
  Apple播客榜: ["播客", "Apple播客榜"],
  // `播客` 从栏目升为分类，原栏目改名让位。/tags/播客/ 这个 URL 不死，覆盖面从 60 涨到 155。
  播客: ["播客", "海外播客榜"],
  中文播客榜: ["播客", "中文播客榜"],
  Reddit热门: ["社区", "Reddit热门"],
  Reddit热搜: ["社区", "Reddit热搜"],
  微博热搜: ["社区", "微博热搜"],
  经济学人: ["阅读", "经济学人"],
  每周影视推荐: ["推荐", "每周影视推荐"],
  每周图书推荐: ["推荐", "每周图书推荐"],
};

/**
 * `杂志` 一个 tag 罩着三本刊，刊名只在标题里，筛不出单本。拆开后和 Substack 的刊名 tag 对齐。
 * 三个任务的 fileName 各不相同，按文件名前缀分流即可。
 */
const MAGAZINE_BY_PREFIX: Record<string, string> = {
  纽约客: "纽约客",
  大西洋月刊: "大西洋月刊",
  连线: "连线",
};

/**
 * 54 篇早期文章的 `tags:` 是空的（schema 把它们兜底成 `others`）。
 * 这些栏目名在 BLOG_TASKS 里已经不存在，只能按文件名前缀反推。
 * 前缀按长度降序匹配，`市场日报` 不能先于 `全球市场日报` 命中。
 */
const BY_FILENAME_PREFIX: Record<string, readonly [Category, string]> = {
  Apple热门播客: ["播客", "Apple播客榜"],
  海外科技播客: ["播客", "海外播客榜"],
  "foreign-tech-podcast": ["播客", "海外播客榜"],
  AI工程日报: ["技术", "技术日报"],
  技术工程日报: ["技术", "技术日报"],
  科技商业观察日报: ["技术", "技术日报"],
  比特币日报: ["财经", "数字货币日报"],
  数字货币日报: ["财经", "数字货币日报"],
  美股市场日报: ["财经", "市场日报"],
  亚洲市场日报: ["财经", "市场日报"],
  全球市场晨报: ["财经", "市场日报"],
  全球市场日报: ["财经", "市场日报"],
  市场日报: ["财经", "市场日报"],
  // draft: true 的链路验证样例稿，内容是影视推荐。
  "weekly-watchlist": ["推荐", "每周影视推荐"],
};

/** Substack 译文原本是 `海外长文 + 刊名`，是全仓唯一的双 tag。统一两层后类别位换成 `阅读`。 */
const SUBSTACK_CATEGORY_TAG = "海外长文";

/** 手写文章的 tag 是真标签，不是栏目，不进两层体系。 */
const HANDWRITTEN_TAGS = new Set(["随笔", "notes", "blog", "configuration", "i18n"]);

type Migration = { file: string; before: string[]; after: string[] };

function listMarkdown(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(full);
    return entry.name.endsWith(".md") || entry.name.endsWith(".mdx") ? [full] : [];
  });
}

type TagBlock = { start: number; end: number; tags: string[]; lines: string[] };

/**
 * 只认块状序列（`tags:` 后跟 `  - x`），因为全仓 frontmatter 都是这一种形态。
 * 遇到内联数组会当成没有 tag，宁可漏迁移也不猜着改。
 */
function findTagBlock(lines: string[]): TagBlock | null {
  const start = lines.findIndex(line => line === "tags:" || line.startsWith("tags: "));
  if (start === -1) return null;
  if (lines[start] !== "tags:") return null;

  const tags: string[] = [];
  const raw: string[] = [];
  let end = start + 1;
  while (end < lines.length && lines[end].startsWith("  - ")) {
    tags.push(unquote(lines[end].slice(4).trim()));
    raw.push(lines[end]);
    end += 1;
  }
  return { start, end, tags, lines: raw };
}

function unquote(value: string): string {
  const quoted = value.match(/^"(.*)"$/) || value.match(/^'(.*)'$/);
  return quoted ? quoted[1] : value;
}

/**
 * 留下来的 tag 一律复用原行，不重新渲染。
 * Substack 刊名在 substack_archive.ts 里走 yamlString()，`Commoncog` 这种单词也带引号；
 * 这里按「需要才加引号」重渲染会把引号抹掉，迁移后的旧稿和 CI 之后产出的新稿就对不上了。
 * 新增的分类与栏目名都是中文或字母数字，不需要引号。
 */
function renderTag(tag: string, original: Map<string, string>): string {
  const kept = original.get(tag);
  if (kept) return kept;
  return `  - ${/^[\w一-鿿]+$/u.test(tag) ? tag : JSON.stringify(tag)}`;
}

function filenamePrefixTags(file: string): readonly [Category, string] | null {
  const name = path.basename(file).replace(/\.mdx?$/, "");
  const prefixes = Object.keys(BY_FILENAME_PREFIX).sort((a, b) => b.length - a.length);
  const hit = prefixes.find(prefix => name.startsWith(prefix));
  return hit ? BY_FILENAME_PREFIX[hit] : null;
}

/** 返回迁移后的 tags；返回 null 表示这篇不该动。 */
export function migratedTags(file: string, tags: string[]): string[] | null {
  // 幂等判据必须是「首位是分类且确实有第二层」，不能只看分类词是否出现：
  // `播客` 同时是新分类名和旧栏目名，只按包含判断会把待迁移的 60 篇旧稿当成已完成。
  if (tags.length >= 2 && (CATEGORIES as readonly string[]).includes(tags[0])) return null;
  if (tags.some(tag => HANDWRITTEN_TAGS.has(tag))) return null;

  if (tags.length === 0) {
    const derived = filenamePrefixTags(file);
    return derived ? [...derived] : null;
  }

  if (tags.includes(SUBSTACK_CATEGORY_TAG)) {
    const publication = tags.find(tag => tag !== SUBSTACK_CATEGORY_TAG);
    if (!publication) throw new Error(`${file}: 海外长文 缺少刊名 tag`);
    return ["阅读", publication];
  }

  if (tags.includes("杂志")) {
    const name = path.basename(file);
    const prefix = Object.keys(MAGAZINE_BY_PREFIX).find(key => name.startsWith(key));
    if (!prefix) throw new Error(`${file}: 杂志文章的文件名前缀不在拆分表里`);
    return ["阅读", MAGAZINE_BY_PREFIX[prefix]];
  }

  for (const tag of tags) {
    const mapped = BY_TAG[tag];
    if (mapped) return [...mapped];
  }

  throw new Error(`${file}: 未知 tag ${JSON.stringify(tags)}`);
}

function migrateFile(file: string, rel: string, apply: boolean): Migration | null {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const block = findTagBlock(lines);
  if (!block) return null;

  const after = migratedTags(rel, block.tags);
  if (!after) return null;

  if (apply) {
    const original = new Map(block.tags.map((tag, index) => [tag, block.lines[index]]));
    const rendered = ["tags:", ...after.map(tag => renderTag(tag, original))];
    lines.splice(block.start, block.end - block.start, ...rendered);
    fs.writeFileSync(file, lines.join("\n"));
  }
  return { file: rel, before: block.tags, after };
}

function main(): void {
  const apply = !process.argv.includes("--dry-run");
  const repo = repoRoot();
  const files = listMarkdown(path.join(repo, POSTS_DIR));

  const migrations: Migration[] = [];
  const failures: string[] = [];
  for (const file of files) {
    const rel = path.relative(repo, file).split(path.sep).join("/");
    try {
      const migration = migrateFile(file, rel, apply);
      if (migration) migrations.push(migration);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const counts = new Map<string, number>();
  for (const migration of migrations) {
    const key = `${migration.before.join(",") || "(空)"} -> ${migration.after.join(",")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    writeStdout(`${String(count).padStart(4)}  ${key}\n`);
  }
  writeStdout(`\n${apply ? "migrated" : "would migrate"} ${migrations.length}/${files.length} posts\n`);

  if (failures.length) {
    for (const failure of failures) writeStderr(failure);
    writeStderr(`migration failed: ${failures.length} post(s)`);
    process.exit(1);
  }
}

// 仓库其它脚本用 `file://${process.argv[1]}` 比较，那在 Windows/UNC 路径下永远不等；
// 这个脚本要在开发机上手跑，所以走 pathToFileURL 做规范化比较。
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

#!/usr/bin/env tsx
// 跨文件约定检查器：扫全目录，对新文件自动生效，失败时直接指出违规位置。
// 这里只放「不执行代码就能判定」的规则；需要跑起来才知道对错的属于测试。
//
// 与 verify_blog_generation.ts 的分工：那个在发布流水线上校验一次运行产出的文章，
// 这个在 lint 阶段校验仓库自身的结构，不需要任何运行产物。
import fs from "node:fs";
import path from "node:path";
import { repoRoot, writeStderr, writeStdout } from "./blog_common.ts";
import { TASKS } from "./blog_tasks.ts";

type Violation = { file: string; message: string };

// 第三方库经内部封装使用：包名 -> 允许直接 import 它的唯一文件。
// 换库、加默认值、统一错误处理时，改动面就是这一个文件；新增调用点必须走封装。
const DEPENDENCY_OWNERS: Record<string, string> = {
  jsdom: "scripts/html_dom.ts",
  "adm-zip": "scripts/magazine.ts",
  "fast-xml-parser": "scripts/magazine.ts",
  "@mozilla/readability": "scripts/hn_top10_source.ts",
  sharp: "scripts/image_raster.ts",
};

function listFiles(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, extension);
    return entry.name.endsWith(extension) ? [full] : [];
  });
}

function checkDependencyOwners(repo: string): Violation[] {
  const violations: Violation[] = [];
  for (const file of listFiles(path.join(repo, "scripts"), ".ts")) {
    const rel = path.relative(repo, file).split(path.sep).join("/");
    const text = fs.readFileSync(file, "utf8");
    for (const [pkg, owner] of Object.entries(DEPENDENCY_OWNERS)) {
      if (rel === owner) continue;
      if (text.includes(`from "${pkg}"`)) violations.push({ file: rel, message: `直接 import ${pkg}；应经 ${owner} 封装引用` });
    }
  }
  return violations;
}

// prompts/blog 下的每个模板都必须有人用：要么是任务名，要么被脚本按名字点到。
// 重命名任务后遗留的孤儿模板不会报错，只会让生成悄悄走别的分支——这条规则就是为它准备的。
function checkPromptsAreReferenced(repo: string): Violation[] {
  const scriptText = listFiles(path.join(repo, "scripts"), ".ts")
    .map(file => fs.readFileSync(file, "utf8"))
    .join("\n");
  const taskNames = new Set<string>(TASKS);
  const violations: Violation[] = [];
  for (const file of listFiles(path.join(repo, "prompts", "blog"), ".md")) {
    const rel = path.relative(repo, file).split(path.sep).join("/");
    const name = path.basename(file, ".md");
    if (name.startsWith("_")) continue; // 下划线开头是被 renderPrompt 无条件拼接的公共片段
    if (taskNames.has(name) || scriptText.includes(`"${name}"`)) continue;
    violations.push({ file: rel, message: `模板没有任何引用：既不是 blog_tasks.ts 里的任务名，也没有脚本按名字点到` });
  }
  return violations;
}

export function checkConventions(repo = repoRoot()): Violation[] {
  return [...checkDependencyOwners(repo), ...checkPromptsAreReferenced(repo)];
}

function main(): void {
  const violations = checkConventions();
  for (const violation of violations) writeStderr(`${violation.file}: ${violation.message}`);
  if (violations.length) {
    writeStderr(`convention check failed: ${violations.length} violation(s)`);
    process.exit(1);
  }
  writeStdout("convention check passed\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();

#!/usr/bin/env tsx
// 跨文件约定检查器：扫全目录，对新文件自动生效，失败时直接指出违规位置。
// 这里只放「不执行代码就能判定」的规则；需要跑起来才知道对错的属于测试。
//
// 与 verify_blog_generation.ts 的分工：那个在发布流水线上校验一次运行产出的文章，
// 这个在 lint 阶段校验仓库自身的结构，不需要任何运行产物。
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { repoRoot, writeStderr, writeStdout } from "./blog_common.ts";
import { SCHEDULED_TASK_INPUTS, TASKS } from "./blog_tasks.ts";

type Violation = { file: string; message: string };

// 第三方库经内部封装使用：包名 -> 允许直接 import 它的唯一文件。
// 换库、加默认值、统一错误处理时，改动面就是这一个文件；新增调用点必须走封装。
const DEPENDENCY_OWNERS: Record<string, string> = {
  jsdom: "scripts/html_dom.ts",
  "adm-zip": "scripts/magazine.ts",
  "fast-xml-parser": "scripts/magazine.ts",
  "@mozilla/readability": "scripts/hn_top10_source.ts",
  sharp: "scripts/image_raster.ts",
  "qrcode-generator": "scripts/qr_code.ts",
  feedsmith: "scripts/substack_feed.ts",
  turndown: "scripts/html_to_markdown.ts",
  "file-type": "scripts/substack_image.ts",
};

// 站点侧的同一条规则。src/pages 的两个 OG 端点曾各自直接调 satori + sharp，
// 和 scripts 里的封装互不知情；现在都走 src/utils/renderPng.ts。
const SRC_DEPENDENCY_OWNERS: Record<string, string> = {
  sharp: "src/utils/renderPng.ts",
  satori: "src/utils/renderPng.ts",
};

function listFiles(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, extension);
    return entry.name.endsWith(extension) ? [full] : [];
  });
}

// scripts/wechat 是整棵搬进来的微信发布器，依赖治理和代码风格都自成一套：
// 它直接 import cheerio/juice/markdown-it，不走本仓的封装表。把它排除在两条
// scripts 规则之外，规则就只管本仓自己写的脚本。
function ownScriptFiles(repo: string): string[] {
  const wechat = path.join(repo, "scripts", "wechat") + path.sep;
  return listFiles(path.join(repo, "scripts"), ".ts").filter(file => !file.startsWith(wechat));
}

function checkDependencyOwners(repo: string): Violation[] {
  const violations: Violation[] = [];
  const check = (files: string[], owners: Record<string, string>) => {
    for (const file of files) {
      const rel = path.relative(repo, file).split(path.sep).join("/");
      const text = fs.readFileSync(file, "utf8");
      for (const [pkg, owner] of Object.entries(owners)) {
        if (rel === owner) continue;
        if (text.includes(`from "${pkg}"`)) violations.push({ file: rel, message: `直接 import ${pkg}；应经 ${owner} 封装引用` });
      }
    }
  };
  check(ownScriptFiles(repo), DEPENDENCY_OWNERS);
  const src = path.join(repo, "src");
  check([...listFiles(src, ".ts"), ...listFiles(src, ".astro")], SRC_DEPENDENCY_OWNERS);
  return violations;
}

// prompts/blog 下的每个模板都必须有人用：要么是任务名，要么被脚本按名字点到。
// 重命名任务后遗留的孤儿模板不会报错，只会让生成悄悄走别的分支——这条规则就是为它准备的。
function checkPromptsAreReferenced(repo: string): Violation[] {
  const scriptText = ownScriptFiles(repo)
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

// scheduled-publish.yml 里 cron→task 的表写了两遍（run-name 与 publish.with.task，Actions 的
// run-name 读不到 job 输出），blog_tasks.ts 的 SCHEDULED_TASK_INPUTS 是带时区的第三份。
// 三处不一致的后果是定时任务静默跑成别的任务或算错归档日，所以在 lint 阶段比对。
type ScheduledPublish = {
  "run-name"?: string;
  on?: { schedule?: { cron: string }[] };
  jobs?: { publish?: { with?: { task?: string } } };
};

function checkScheduledPublish(repo: string): Violation[] {
  const rel = ".github/workflows/scheduled-publish.yml";
  const file = path.join(repo, rel);
  if (!fs.existsSync(file)) return [{ file: rel, message: "定时发布入口不存在" }];
  const doc = parseYaml(fs.readFileSync(file, "utf8")) as ScheduledPublish;
  const crons = (doc.on?.schedule || []).map(entry => entry.cron);
  const pairsOf = (expression = "") =>
    new Map([...expression.matchAll(/github\.event\.schedule == '([^']+)' && '([^']+)'/g)].map(match => [match[1], match[2]] as const));
  const tables = { "run-name": pairsOf(doc["run-name"]), "publish.with.task": pairsOf(doc.jobs?.publish?.with?.task) };
  const violations: Violation[] = [];
  for (const cron of crons) {
    const expected = SCHEDULED_TASK_INPUTS[cron]?.task;
    if (!expected) violations.push({ file: rel, message: `cron "${cron}" 在 blog_tasks.ts 的 SCHEDULED_TASK_INPUTS 里没有条目` });
    for (const [where, table] of Object.entries(tables)) {
      const actual = table.get(cron);
      if (actual !== expected)
        violations.push({ file: rel, message: `cron "${cron}" 在 ${where} 里映射到 ${actual ?? "空"}，SCHEDULED_TASK_INPUTS 说是 ${expected ?? "空"}` });
    }
  }
  for (const [where, table] of Object.entries(tables)) {
    for (const cron of table.keys()) {
      if (!crons.includes(cron)) violations.push({ file: rel, message: `${where} 里的 cron "${cron}" 不在 on.schedule 里` });
    }
  }
  return violations;
}

export function checkConventions(repo = repoRoot()): Violation[] {
  return [...checkDependencyOwners(repo), ...checkPromptsAreReferenced(repo), ...checkScheduledPublish(repo)];
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

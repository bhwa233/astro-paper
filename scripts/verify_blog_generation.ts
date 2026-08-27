#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { isTask, taskInfo, taskTags } from "./blog_tasks.ts";

const GENERATED_POST_TECHNICAL_ERROR_PATTERNS = [
  /Traceback \(most recent call last\)/i,
  /Script not found:/i,
  /归档失败/i,
  /上游 .* 未提供可归档的最终正文/i,
  /BLOCKED:/i,
  /\{\{[^}]+\}\}/,
];

function parseJsonOutput(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const start = trimmed.indexOf("{");
  if (start >= 0) return JSON.parse(trimmed.slice(start));
  throw new Error("no JSON object found");
}

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  // Tolerate CRLF so a Windows checkout reports real problems instead of
  // claiming every generated post is missing its frontmatter.
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("post has no frontmatter");
  return { frontmatter: match[1], body: match[2] };
}

function verifyFrontmatter(file: string, expectedTask: string): string {
  const text = fs.readFileSync(file, "utf8");
  const { frontmatter } = splitFrontmatter(text);
  for (const field of ["author:", "pubDatetime:", "title:", "featured:", "draft: false", "tags:", "description:", "timezone: Asia/Shanghai"]) {
    if (!frontmatter.includes(field)) throw new Error(`${file} frontmatter missing ${field}`);
  }
  // 标题前缀不再核对。跳过的条目也会走到这里，所以前缀一改名，历史归档就会把当月任务判失败：
  // 2026-08-11 的杂志改名让月更的 Wired 与 Atlantic 连挂两轮，而文章本身没有任何问题。
  // 前缀由 taskTitle 统一生成，重复校验一遍拦不住新问题，只会拦住改名本身。
  // 两层都要在：只校验栏目位的话，taskTags 少写一层分类也能过，而站点的分组正是按分类位分的。
  if (isTask(expectedTask)) {
    for (const tag of taskTags(expectedTask)) {
      if (!frontmatter.includes(tag)) throw new Error(`${file} frontmatter missing ${tag} tag`);
    }
  }
  return text;
}

function resolveArtifactPath(repo: string, artifactPath: string): string {
  return path.isAbsolute(artifactPath) ? artifactPath : path.join(repo, artifactPath);
}

// 每个任务要求什么，写在 blog_tasks.ts 的注册表里，和它的标题、标签、文件名住在一起。
// 这里只负责执行；新增任务不需要改这个文件。
export function verifySourceContract(repo: string, task: string, sourceArtifact: string): void {
  if (!sourceArtifact) throw new Error(`${task || "unknown task"} generated without source artifact`);
  const sourcePath = resolveArtifactPath(repo, sourceArtifact);
  if (!fs.existsSync(sourcePath)) throw new Error(`source artifact does not exist: ${sourceArtifact}`);
  const source = fs.readFileSync(sourcePath, "utf8");
  const relPath = path.relative(repo, sourcePath) || sourceArtifact;
  if (source.trim().length < 80) throw new Error(`${relPath} source is too short to support generation`);

  const contract = isTask(task) ? taskInfo(task).sourceContract : undefined;
  if (!contract) return;
  if (contract.minNumberedBlocks !== undefined) {
    const blocks = source.match(/^#{2,3}\s+\d+\.\s+/gm) || [];
    if (blocks.length < contract.minNumberedBlocks) {
      throw new Error(`${relPath} source has too few numbered items: ${blocks.length} < ${contract.minNumberedBlocks}`);
    }
  }
  const missing = [
    ...(contract.requiredTerms || []).filter(term => !source.includes(term)),
    ...(contract.requiredPatterns || []).filter(term => !term.pattern.test(source)).map(term => term.label),
  ];
  if (missing.length) throw new Error(`${relPath} missing required source terms: ${missing.join(", ")}`);
}

function sectionHeadingPattern(task: string): RegExp {
  return (isTask(task) && taskInfo(task).bodyHeadingPattern) || /^##\s+/m;
}

export function verifyPostContract(repo: string, relPath: string, task: string): void {
  if (!relPath) throw new Error("post result is missing path");
  const postPath = path.join(repo, relPath);
  if (!fs.existsSync(postPath)) throw new Error(`generated post does not exist: ${relPath}`);
  const text = verifyFrontmatter(postPath, task);
  const { body } = splitFrontmatter(text);
  if (!body.trim()) throw new Error(`${relPath} body is empty`);
  if (!sectionHeadingPattern(task).test(body)) throw new Error(`${relPath} body has no section headings`);
  for (const pattern of GENERATED_POST_TECHNICAL_ERROR_PATTERNS) {
    if (pattern.test(text)) throw new Error(`${relPath} contains generated-post technical error pattern: ${pattern.source}`);
  }
}

export function verifyResultJson(repo: string, resultJson: string): number {
  const payload = parseJsonOutput(fs.readFileSync(resultJson, "utf8")) as { results?: unknown[] };
  if (!Array.isArray(payload.results) || !payload.results.length) throw new Error(`${resultJson} has no results array`);
  let verified = 0;
  for (const item of payload.results) {
    if (!item || typeof item !== "object") throw new Error(`invalid result item: ${String(item)}`);
    const row = item as { task?: string; path?: string; skipped?: boolean; failed?: boolean; error?: string; generation?: { source_artifact?: string } };
    if (row.failed) {
      if (!row.task || !row.error) throw new Error(`failed result item is missing task or error: ${JSON.stringify(row)}`);
      continue;
    }
    if (row.skipped && !row.path) continue;
    verifyPostContract(repo, row.path || "", row.task || "");
    if (row.generation?.source_artifact) verifySourceContract(repo, row.task || "", row.generation.source_artifact);
    verified += 1;
  }
  return verified;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const resultJson = stringArg(args, "result-json");
  if (!resultJson) throw new Error("--result-json is required");
  const repo = path.resolve(stringArg(args, "repo", repoRoot()));
  const verified = verifyResultJson(repo, path.resolve(resultJson));
  writeStdout(`${JSON.stringify({ mode: "result-json", verified })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(`ERROR: ${message}`);
    process.exit(1);
  });
}

// 「已提交交接」编排器的共享层：Reddit 人生微信稿、Reddit 图片消息、微博热搜微信稿三条管线
// 都只消费父任务已经提交进仓库的产物，各自的 run.json 记录父提交、文件路径与 SHA-256。
//
// 这些校验原来在三个编排器里各抄一份，只差报错前缀。其中 assertCommittedHandoff 是安全不变量
// （HEAD 必须等于 --upstream-sha，不接受任意工作区内容冒充父提交），三份就意味着修一处漏两处。
// 各管线自己的 manifest 形状与业务逻辑留在各自文件里，这里只有它们共用的原语。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./blog_common.ts";

export type ArchivedFile = { path: string; sha256: string };

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function isArchivedFile(value: unknown): value is ArchivedFile {
  const file = value as Partial<ArchivedFile> | null;
  return Boolean(file && typeof file.path === "string" && file.path && typeof file.sha256 === "string" && /^[0-9a-f]{64}$/i.test(file.sha256));
}

export function isArchiveDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** `label` 是报错里的管线名，例如 "Reddit life newspic"，让三条管线的失败日志仍能一眼分辨。 */
export function gitOutput(repo: string, args: string[], label: string): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw new Error(`failed to verify the ${label} committed handoff: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 当前 HEAD 必须就是父任务交接的那个提交；返回展开后的完整 SHA。 */
export function assertCommittedHandoff(repo: string, upstreamSha: string, label: string): string {
  if (!/^[0-9a-f]{7,64}$/i.test(upstreamSha)) throw new Error(`invalid --upstream-sha: ${upstreamSha || "missing"}`);
  const expected = gitOutput(repo, ["rev-parse", "--verify", `${upstreamSha}^{commit}`], label).toLowerCase();
  const head = gitOutput(repo, ["rev-parse", "HEAD"], label).toLowerCase();
  if (head !== expected) throw new Error(`${label} HEAD ${head} does not match --upstream-sha ${expected}`);
  return expected;
}

/** 交接路径不能有未提交改动，否则读到的就不是父提交里的内容。被 .gitignore 忽略的文件不算。 */
export function assertCommittedPath(repo: string, relPath: string, label: string): void {
  const status = gitOutput(repo, ["status", "--porcelain", "--untracked-files=all", "--", relPath], label);
  if (status) throw new Error(`${label} handoff path must match HEAD: ${relPath}`);
}

/** 复用旧 manifest 前，确认它记录的已提交文件还在、内容没变。 */
export function verifyArchivedFile(repo: string, archived: ArchivedFile, label: string, what: string): void {
  assertCommittedPath(repo, archived.path, label);
  verifyFileHash(repo, archived, label, what);
}

/** 只核对内容哈希，不要求已提交：给从 Release 恢复回来、本身被 .gitignore 的资产用。 */
export function verifyFileHash(repo: string, archived: ArchivedFile, label: string, what: string): void {
  const file = path.join(repo, archived.path);
  if (!fs.existsSync(file)) throw new Error(`${label} manifest ${what} is missing: ${archived.path}`);
  if (sha256(fs.readFileSync(file)) !== archived.sha256) throw new Error(`${label} manifest ${what} hash does not match: ${archived.path}`);
}

/**
 * 把仍被 git 跟踪的旧文件从索引里拿掉，工作区里的文件留着。
 * 卡片改走 Release 之前的归档日把 PNG 提交进了仓库；同一天重渲染会在同样的路径写新文件，
 * 不先解除跟踪，archive-commit 就会把它们当作修改再提交一次，Release 化等于没做。
 */
export function untrackPaths(repo: string, relPaths: string[], label: string): void {
  if (!relPaths.length) return;
  gitOutput(repo, ["rm", "--cached", "--quiet", "--ignore-unmatch", "--", ...relPaths], label);
}

export function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** artifactsDir 为空表示调用方不要诊断产物（测试里常见），静默跳过。 */
export function writeTextArtifact(dir: string, name: string, content: string): void {
  if (!dir) return;
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, name), content, "utf8");
}

/**
 * 读 run.json：不存在返回 null；`accept` 返回 false（例如旧版本号）也返回 null，交给调用方决定重建；
 * 解析失败必须抛，不能把损坏的 manifest 当成「还没归档」——那会让当天重复渲染、重复建草稿。
 * 各管线的 parse 抛出的错误以 `invalid ${label}` 开头时原样透传，其余包成同一前缀。
 */
export function loadRunManifest<T>(file: string, label: string, parse: (raw: unknown, file: string) => T, accept: (raw: unknown) => boolean = () => true): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!accept(raw)) return null;
    return parse(raw, file);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`invalid ${label}`)) throw error;
    throw new Error(`invalid ${label} run manifest: ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

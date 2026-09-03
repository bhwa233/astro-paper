#!/usr/bin/env tsx
// 归档资产走 GitHub Release，仓库只留 Markdown 与 run.json。
//
// 为什么：图片消息每天 2 到 3MB 的 PNG 进 git，一年就是 1GB 多，而 `git rm` 只清工作区，
// blob 永远留在历史里——那等于没删。视频成片已经这么做了（publish-reddit-life-video.yml），
// 这里把同一做法收成一个模块，给微博与 Reddit 两条图片消息管线共用。
//
// 契约：run.json 里多一段 `release: { tag, assets: [{ asset, path, sha256 }] }`。
// - 生成器渲染完卡片后写下这段，卡片本身被 .gitignore 挡在仓库外；
// - workflow 在提交 run.json 之前先 `upload`，上传失败就不会有「manifest 说有、Release 里没有」的提交；
// - 微信同步 job 与人工补推入口在调用 astro-wechat 之前先 `restore`，把资产按 path 放回原位并核对 SHA-256，
//   所以图片消息草稿的上传流程本身不变：它读到的仍是 Markdown 旁边同名的 PNG。
//
// gh CLI 是唯一的传输方式：GitHub runner 自带，本地需要 `gh auth login`。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { isArchivedFile, sha256, type ArchivedFile } from "./committed_handoff.ts";

export type ReleaseAsset = ArchivedFile & { asset: string };
export type ReleaseManifest = { tag: string; assets: ReleaseAsset[] };

const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * 资产名由归档日目录下的相对路径压平而来：`01/card-00.png` 变成 `01-card-00.png`。
 * Release 资产没有目录，且 GitHub 会把非 ASCII 文件名规范化成别的东西，所以名字必须是稳定的 ASCII。
 */
export function releaseAssetName(relPath: string, dayDir: string): string {
  const relative = path.posix.relative(dayDir.split(path.sep).join("/"), relPath.split(path.sep).join("/"));
  if (!relative || relative.startsWith("..")) throw new Error(`release asset must live under ${dayDir}: ${relPath}`);
  const name = relative.replaceAll("/", "-");
  if (!ASSET_NAME.test(name)) throw new Error(`release asset name must be ASCII: ${name}`);
  return name;
}

export function buildReleaseManifest(tag: string, dayDir: string, files: ArchivedFile[]): ReleaseManifest {
  if (!ASSET_NAME.test(tag)) throw new Error(`invalid release tag: ${tag}`);
  const assets = files.map(file => ({ asset: releaseAssetName(file.path, dayDir), path: file.path, sha256: file.sha256 }));
  if (new Set(assets.map(asset => asset.asset)).size !== assets.length) throw new Error(`release ${tag} has duplicate asset names`);
  return { tag, assets };
}

export function isReleaseManifest(value: unknown): value is ReleaseManifest {
  const release = value as Partial<ReleaseManifest> | null;
  return Boolean(
    release &&
    typeof release.tag === "string" &&
    release.tag &&
    Array.isArray(release.assets) &&
    release.assets.length > 0 &&
    release.assets.every(asset => isArchivedFile(asset) && typeof (asset as ReleaseAsset).asset === "string" && ASSET_NAME.test((asset as ReleaseAsset).asset))
  );
}

export type GhRunner = (args: string[]) => string;

function runGh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

/**
 * 上传 run.json 记录的全部资产。同一天重跑用 --clobber 覆盖，不删任何已发布的东西。
 * 上传前先核对本地文件哈希：manifest 与磁盘不一致时宁可失败，也不要把错的图发出去。
 */
export function uploadReleaseAssets(repo: string, release: ReleaseManifest, { title, notes }: { title: string; notes: string }, gh: GhRunner = runGh): void {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "release-assets-"));
  try {
    const files = release.assets.map(asset => {
      const source = path.join(repo, asset.path);
      if (!fs.existsSync(source)) throw new Error(`release asset is missing on disk: ${asset.path}`);
      if (sha256(fs.readFileSync(source)) !== asset.sha256) throw new Error(`release asset hash does not match the manifest: ${asset.path}`);
      const staged = path.join(staging, asset.asset);
      fs.copyFileSync(source, staged);
      return staged;
    });
    let exists = true;
    try {
      gh(["release", "view", release.tag, "--json", "tagName"]);
    } catch {
      exists = false;
    }
    if (exists) {
      gh(["release", "upload", release.tag, ...files, "--clobber"]);
      gh(["release", "edit", release.tag, "--title", title, "--notes", notes]);
    } else {
      gh(["release", "create", release.tag, ...files, "--title", title, "--notes", notes]);
    }
    writeStderr(`[release-assets] ${release.tag}: uploaded ${files.length} asset(s)`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export type AssetDownloader = (tag: string, assetNames: string[], dir: string) => void;

function downloadWithGh(tag: string, assetNames: string[], dir: string): void {
  runGh(["release", "download", tag, "--dir", dir, "--clobber", ...assetNames.flatMap(name => ["--pattern", name])]);
}

/**
 * 把资产放回 manifest 记录的路径。本地已有且哈希一致的直接跳过，其余从 Release 下载后逐个核对哈希，
 * 缺一张或对不上都失败——图片消息缺图会在微信那边以更难懂的方式炸。
 */
export function restoreReleaseAssets(repo: string, release: ReleaseManifest, download: AssetDownloader = downloadWithGh): { restored: number; reused: number } {
  const missing = release.assets.filter(asset => {
    const file = path.join(repo, asset.path);
    return !fs.existsSync(file) || sha256(fs.readFileSync(file)) !== asset.sha256;
  });
  if (!missing.length) return { restored: 0, reused: release.assets.length };

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "release-assets-"));
  try {
    download(
      release.tag,
      missing.map(asset => asset.asset),
      staging
    );
    for (const asset of missing) {
      const downloaded = path.join(staging, asset.asset);
      if (!fs.existsSync(downloaded)) throw new Error(`release ${release.tag} has no asset ${asset.asset}`);
      const content = fs.readFileSync(downloaded);
      if (sha256(content) !== asset.sha256) throw new Error(`release ${release.tag} asset ${asset.asset} hash does not match the manifest`);
      const target = path.join(repo, asset.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { restored: missing.length, reused: release.assets.length - missing.length };
}

/** 从任意 manifest 里取 `release` 段；没有就是老式全提交归档，调用方按无事可做处理。 */
export function readReleaseManifest(manifestFile: string): ReleaseManifest | null {
  const raw = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { release?: unknown };
  if (raw.release === undefined) return null;
  if (!isReleaseManifest(raw.release)) throw new Error(`invalid release section in ${manifestFile}`);
  return raw.release;
}

/** 人工补推只知道稿子路径：从它所在目录向上找 run.json，找到归档日目录为止。 */
export function findRunManifest(repo: string, articleRel: string): string | null {
  const root = path.resolve(repo);
  let dir = path.dirname(path.resolve(repo, articleRel));
  while (dir.startsWith(root)) {
    const candidate = path.join(dir, "run.json");
    if (fs.existsSync(candidate)) return candidate;
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

function main(): void {
  const args = parseArgs(process.argv.slice(3));
  const command = process.argv[2];
  if (command !== "upload" && command !== "restore") throw new Error("usage: release_assets.ts <upload|restore> --manifest run.json | --article draft.md");
  const repo = path.resolve(stringArg(args, "repo", repoRoot()));
  let manifestFile = stringArg(args, "manifest");
  const article = stringArg(args, "article");
  if (!manifestFile && article) manifestFile = findRunManifest(repo, article) || "";
  if (!manifestFile) {
    if (!article) throw new Error("--manifest or --article is required");
    writeStdout(`${JSON.stringify({ command, article, skipped: "no run.json above the article" })}\n`);
    return;
  }
  manifestFile = path.resolve(repo, manifestFile);
  const release = readReleaseManifest(manifestFile);
  if (!release) {
    writeStdout(`${JSON.stringify({ command, manifest: manifestFile, skipped: "manifest has no release section" })}\n`);
    return;
  }
  if (command === "upload") {
    const title = stringArg(args, "title");
    if (!title) throw new Error("--title is required for upload");
    uploadReleaseAssets(repo, release, { title, notes: stringArg(args, "notes") });
    writeStdout(`${JSON.stringify({ command, tag: release.tag, assets: release.assets.length })}\n`);
    return;
  }
  const result = restoreReleaseAssets(repo, release);
  writeStdout(`${JSON.stringify({ command, tag: release.tag, ...result })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

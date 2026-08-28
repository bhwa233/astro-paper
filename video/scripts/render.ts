// 渲染入口：读 data/reddit-life-video/<date>/video.json，出 out/reddit-life-<date>.mp4。
//
// 走 @remotion/renderer 的 API 而不是 `remotion render` CLI，是为了在这里解析并校验
// video.json：CLI 只能把 JSON 原样塞进 --props，形状错了要等到浏览器里才炸，
// 那时的报错落在渲染日志深处，指不出是哪一天的归档坏了。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { parseVideoManifest } from "../src/contract.ts";
import { COMPOSITION_ID } from "../src/Root.tsx";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "..");

function argValue(name: string): string {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

const date = argValue("date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("usage: render.ts --date YYYY-MM-DD [--out <file>]");

const manifestPath = path.join(repoRoot, "data", "reddit-life-video", date, "video.json");
if (!fs.existsSync(manifestPath)) throw new Error(`missing video manifest: ${manifestPath}`);
const manifest = parseVideoManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));

const outputLocation = argValue("out") || path.join(packageRoot, "out", `reddit-life-${date}.mp4`);
fs.mkdirSync(path.dirname(outputLocation), { recursive: true });

process.stderr.write(`[reddit-life-video] bundling ${manifest.cards.length} cards for ${date}\n`);
const serveUrl = await bundle({ entryPoint: path.join(packageRoot, "src", "index.ts") });

const inputProps = { manifest };
const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });

process.stderr.write(`[reddit-life-video] rendering ${composition.durationInFrames} frames -> ${outputLocation}\n`);
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation,
  inputProps,
  onProgress: ({ progress }) => {
    if (process.stderr.isTTY) process.stderr.write(`\r[reddit-life-video] ${Math.round(progress * 100)}%`);
  },
});
if (process.stderr.isTTY) process.stderr.write("\n");

process.stdout.write(`${JSON.stringify({ date, outputLocation, durationInFrames: composition.durationInFrames, cards: manifest.cards.length })}\n`);

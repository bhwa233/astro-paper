// 渲染入口：读 data/reddit-life-video/<date>/video.json，出 out/<问题>.mp4。
//
// 走 @remotion/renderer 的 API 而不是 `remotion render` CLI，是为了在这里解析并校验
// video.json：CLI 只能把 JSON 原样塞进 --props，形状错了要等到浏览器里才炸，
// 那时的报错落在渲染日志深处，指不出是哪一天的归档坏了。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, type OnBrowserDownload } from "@remotion/renderer";
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
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("usage: render.ts --date YYYY-MM-DD [--out <file>] [--result-json <file>]");

// Remotion 首次运行要下 92MB 的 Chrome Headless Shell，默认那个回调把进度打在 stdout 上，
// 于是 `render.ts | tee result.json` 拿到的是进度行加 JSON，JSON.parse 直接炸。
// 这条管线的 stdout 只属于结果 JSON，进度一律改走 stderr。
const onBrowserDownload: OnBrowserDownload = () => ({
  version: null,
  onProgress: ({ alreadyAvailable, percent }) => {
    if (alreadyAvailable) return;
    process.stderr.write(`\r[reddit-life-video] downloading Chrome Headless Shell ${Math.round(percent * 100)}%`);
  },
});

// 文件名里不能出现的字符。全角的逗号、问号和引号在 Linux、macOS 与 Windows 上都合法，
// 保留它们，下下来的成片就是问题本身；只删掉 ASCII 里那批真正会出事的。
// 空格与连字符不删：它们本身合法，删了只会让含英文词的问题粘成一坨。
const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|]/g;
// UTF-8 下一个汉字三字节，文件名上限 255 字节。问题实测最长 34 字，80 是宽裕的护栏。
const FILENAME_MAX_CHARS = 80;

/** 用问题给成片命名。清洗后为空（理论上不会）时退回日期，免得产出一个只叫 ".mp4" 的文件。 */
function videoFileName(question: string, fallbackDate: string): string {
  const cleaned = [...question.replace(UNSAFE_FILENAME_CHARS, "").replace(/\s+/g, " ").trim()].slice(0, FILENAME_MAX_CHARS).join("").trim();
  return `${cleaned || `reddit-life-${fallbackDate}`}.mp4`;
}

const manifestPath = path.join(repoRoot, "data", "reddit-life-video", date, "video.json");
if (!fs.existsSync(manifestPath)) throw new Error(`missing video manifest: ${manifestPath}`);
const manifest = parseVideoManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));

const outputLocation = argValue("out") || path.join(packageRoot, "out", videoFileName(manifest.question, date));
fs.mkdirSync(path.dirname(outputLocation), { recursive: true });

process.stderr.write(`[reddit-life-video] bundling ${manifest.cards.length} cards for ${date}\n`);
const serveUrl = await bundle({ entryPoint: path.join(packageRoot, "src", "index.ts") });

const inputProps = { manifest };
const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps, onBrowserDownload });

process.stderr.write(`[reddit-life-video] rendering ${composition.durationInFrames} frames -> ${outputLocation}\n`);
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation,
  inputProps,
  onBrowserDownload,
  onProgress: ({ progress }) => {
    if (process.stderr.isTTY) process.stderr.write(`\r[reddit-life-video] ${Math.round(progress * 100)}%`);
  },
});
if (process.stderr.isTTY) process.stderr.write("\n");

// question 也带上：CI 拿它当 Release 标题，否则得在 workflow 里再解析一次 video.json。
const result = { date, question: manifest.question, outputLocation, durationInFrames: composition.durationInFrames, cards: manifest.cards.length };
// 结果既打 stdout（本地看得见）也可以落盘。CI 读文件而不是管道：这条链路的 stdout
// 上有一个第三方渲染器，它今天不再往那里写，不代表下个版本也不写。
const resultJson = argValue("result-json");
if (resultJson) fs.writeFileSync(resultJson, `${JSON.stringify(result)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result)}\n`);

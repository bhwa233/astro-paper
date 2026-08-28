import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition, type OnBrowserDownload } from "@remotion/renderer";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function requiredArg(name: string): string {
  const value = argValue(name);
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

const compositionId = requiredArg("composition");
const propsPath = path.resolve(requiredArg("props"));
const outputDir = path.resolve(requiredArg("out-dir"));
const prefix = argValue("prefix", "card");
const count = Number.parseInt(requiredArg("count"), 10);
if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error(`invalid --count: ${String(count)}`);
if (!/^[a-z0-9][a-z0-9-]*$/i.test(prefix)) throw new Error(`invalid --prefix: ${prefix}`);
if (!fs.existsSync(propsPath)) throw new Error(`missing props file: ${propsPath}`);

const inputProps = JSON.parse(fs.readFileSync(propsPath, "utf8")) as Record<string, unknown>;
const onBrowserDownload: OnBrowserDownload = () => ({
  version: null,
  onProgress: ({ alreadyAvailable, percent }) => {
    if (!alreadyAvailable) process.stderr.write(`\r[static-cards] downloading Chrome Headless Shell ${Math.round(percent * 100)}%`);
  },
});

fs.mkdirSync(outputDir, { recursive: true });
process.stderr.write(`[static-cards] bundling ${compositionId}\n`);
const serveUrl = await bundle({ entryPoint: path.join(packageRoot, "src", "index.ts") });
const browser = await openBrowser("chrome", { logLevel: "error" });
const outputLocations: string[] = [];

try {
  for (let cardIndex = 0; cardIndex < count; cardIndex += 1) {
    const output = path.join(outputDir, `${prefix}-${String(cardIndex).padStart(2, "0")}.png`);
    const cardProps = { ...inputProps, cardIndex };
    const composition = await selectComposition({ serveUrl, id: compositionId, inputProps: cardProps, puppeteerInstance: browser, onBrowserDownload });
    await renderStill({
      composition,
      serveUrl,
      output,
      imageFormat: "png",
      inputProps: cardProps,
      puppeteerInstance: browser,
      logLevel: "error",
    });
    outputLocations.push(output);
    process.stderr.write(`[static-cards] rendered ${output}\n`);
  }
} finally {
  await browser.close({ silent: true });
}

process.stdout.write(`${JSON.stringify({ compositionId, outputLocations })}\n`);

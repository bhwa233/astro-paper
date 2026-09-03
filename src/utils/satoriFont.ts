// satori 的中文字体来源。博客 OG 图、Reddit 封面、微博图片卡片共用这一份。
//
// 两种取法，按调用方的运行环境选：
// - `loadSubsetFonts(text)`：按 text= 裁子集，几 KB。整份 Noto Sans SC 约 10MB，而一张图真正要画的
//   只有几十到几百个字。脚本侧（CI 里一次画几张图）用它。
// - `loadFullFonts(cacheDir)`：整份 400/700 下载一次落盘，之后离线可用。站点 OG 图用它：
//   构建要画几百张，每张一次子集请求在本地网络不稳时会拖垮整个构建，而 astro 以前也是
//   整份下载再缓存，这里只是不再让它跟着进 dist 部署出去。
//
// 为什么按 UA 骗 truetype：Google Fonts 只在浏览器不支持 woff2 时才回 ttf，而 satori 只认 ttf/otf/woff。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SATORI_FONT_FAMILY = "Noto Sans SC";

const LEGACY_USER_AGENT = "Mozilla/4.0";
const SUBSET_TIMEOUT_MS = 15_000;
const FULL_TIMEOUT_MS = 90_000;
const WEIGHTS = [400, 700] as const;

export type LoadedFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

// 同一次运行里可能连着画好几张图，字集常常一模一样。按「到底是哪些字」缓存，重复的不再跑一趟。
const subsetCache = new Map<string, Promise<LoadedFont[]>>();

/**
 * 把要画的文字裁成字体子集。
 *
 * 一次请求带上全部的字，不分批。分批看起来更稳妥，实际不能用：satori 在一个 family 下
 * 只认它找到的第一份字体，不会为了某个码点回退到同名的另一份，于是第二批之后的字全成豆腐块。
 * 要分批就得给每批起不同的 family 名再拼成 fallback 列表，而这没必要——
 * 实测 text= 带 1500 个汉字（URL 13KB）Google Fonts 仍返回 200，一篇稿子的字集远到不了那儿。
 *
 * 因此调用方应当把「这张图之外还要画什么」一并传进来，一次拿到覆盖全篇的子集，
 * 而不是每张图各要一次。
 */
export function loadSubsetFonts(text: string): Promise<LoadedFont[]> {
  const unique = [...new Set([...text])].sort().join("");
  if (!unique.length)
    throw new Error("satori font subset needs at least one character");

  const cached = subsetCache.get(unique);
  if (cached) return cached;

  const pending = fetchFaces(
    `&text=${encodeURIComponent(unique)}`,
    SUBSET_TIMEOUT_MS
  );
  subsetCache.set(unique, pending);
  // 失败的不留在缓存里，否则同一次运行里后续每次调用都会复用这个被拒的 Promise。
  pending.catch(() => subsetCache.delete(unique));
  return pending;
}

let fullFonts: Promise<LoadedFont[]> | undefined;

/**
 * 整份 400/700 字体。第一次从 Google Fonts 下载并写进 `cacheDir`，之后直接读盘。
 * 并发调用共享同一个下载 Promise，几百张 OG 图并行渲染也只下载一次。
 */
export function loadFullFonts(cacheDir: string): Promise<LoadedFont[]> {
  if (fullFonts) return fullFonts;
  const pending = readOrFetchFull(cacheDir);
  fullFonts = pending;
  pending.catch(() => {
    fullFonts = undefined;
  });
  return pending;
}

async function readOrFetchFull(cacheDir: string): Promise<LoadedFont[]> {
  const paths = WEIGHTS.map(weight =>
    join(cacheDir, `noto-sans-sc-${weight}.ttf`)
  );
  if (paths.every(path => existsSync(path))) {
    return WEIGHTS.map((weight, index) => ({
      name: SATORI_FONT_FAMILY,
      data: toArrayBuffer(readFileSync(paths[index])),
      weight,
      style: "normal" as const,
    }));
  }

  const fonts = await fetchFaces("", FULL_TIMEOUT_MS);
  mkdirSync(cacheDir, { recursive: true });
  fonts.forEach((font, index) =>
    writeFileSync(paths[index], Buffer.from(font.data))
  );
  return fonts;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

async function fetchFaces(
  query: string,
  timeoutMs: number
): Promise<LoadedFont[]> {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700${query}`;
  const css = await fetchText(url, timeoutMs);
  const faces = [
    ...css.matchAll(/font-weight:\s*(\d+);\s*src:\s*url\(([^)]+)\)/g),
  ];
  const byWeight = new Map(
    faces.map(face => [Number(face[1]), face[2]] as const)
  );

  return Promise.all(
    WEIGHTS.map(async weight => {
      const fontUrl = byWeight.get(weight);
      if (!fontUrl) throw new Error(`Google Fonts returned no ${weight} face`);
      return {
        name: SATORI_FONT_FAMILY,
        data: await fetchBinary(fontUrl, timeoutMs),
        weight,
        style: "normal" as const,
      };
    })
  );
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": LEGACY_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(`Google Fonts CSS request failed: HTTP ${response.status}`);
  return response.text();
}

async function fetchBinary(
  url: string,
  timeoutMs: number
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": LEGACY_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(
      `Google Fonts file request failed: HTTP ${response.status}`
    );
  return response.arrayBuffer();
}

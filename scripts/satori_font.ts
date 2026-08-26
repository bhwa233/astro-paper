// satori 的中文字体来源。Reddit 封面与微博图片消息卡片共用这一份：
// 原先两张封面各抄了一遍同样的三十行，第三个调用方出现时该收口了。
//
// 为什么按 text= 裁子集：整份 Noto Sans SC 约 10MB，而一张图真正要画的只有几十到几百个字，
// 子集只有几 KB。为什么按 UA 骗 truetype：Google Fonts 只在浏览器不支持 woff2 时才回 ttf，
// 而 satori 只认 ttf/otf/woff。
import { writeStderr } from "./blog_common.ts";

export const SATORI_FONT_FAMILY = "Noto Sans SC";

const LEGACY_USER_AGENT = "Mozilla/4.0";
const FONT_TIMEOUT_MS = 15_000;

export type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

// 同一次运行里可能连着画好几张图，字集常常一模一样。按「到底是哪些字」缓存，重复的不再跑一趟。
const cache = new Map<string, Promise<LoadedFont[]>>();

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
  if (!unique.length) throw new Error("satori font subset needs at least one character");

  const cached = cache.get(unique);
  if (cached) return cached;

  const pending = fetchSubset(unique);
  cache.set(unique, pending);
  // 失败的不留在缓存里，否则同一次运行里后续每次调用都会复用这个被拒的 Promise。
  pending.catch(() => cache.delete(unique));
  return pending;
}

async function fetchSubset(chunk: string): Promise<LoadedFont[]> {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&text=${encodeURIComponent(chunk)}`;
  const css = await fetchText(url);
  const faces = [...css.matchAll(/font-weight:\s*(\d+);\s*src:\s*url\(([^)]+)\)/g)];
  const byWeight = new Map(faces.map(face => [Number(face[1]), face[2]] as const));

  return Promise.all(
    ([400, 700] as const).map(async weight => {
      const fontUrl = byWeight.get(weight);
      if (!fontUrl) throw new Error(`Google Fonts returned no ${weight} face for the subset`);
      return { name: SATORI_FONT_FAMILY, data: await fetchBinary(fontUrl), weight, style: "normal" as const };
    }),
  );
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": LEGACY_USER_AGENT }, signal: AbortSignal.timeout(FONT_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Google Fonts CSS request failed: HTTP ${response.status}`);
  return response.text();
}

async function fetchBinary(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers: { "User-Agent": LEGACY_USER_AGENT }, signal: AbortSignal.timeout(FONT_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Google Fonts file request failed: HTTP ${response.status}`);
  return response.arrayBuffer();
}

/** 供渲染器统一使用的日志格式：字体失败不该看起来像别的什么错。 */
export function warnFontFailure(label: string, error: unknown): void {
  writeStderr(`WARN: [${label}] font subset unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

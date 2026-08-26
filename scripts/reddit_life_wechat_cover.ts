// 微信封面：脱离 Astro 运行时的 satori 渲染。
// 博客那套 OG 图走 `src/pages/posts/[...slug]/index.png.ts`，靠 `astro:assets` 提供字体，
// 而微信稿不进内容集合、也没有页面，那条路够不着，因此这里自带字体获取与排版。
import satori from "satori";
import { PLATFORM_THEMES } from "../src/utils/platformTheme.ts";
import { compact, writeStderr } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";
import { WECHAT_COVER_HEIGHT, WECHAT_COVER_WIDTH, wechatCoverTree } from "./wechat_cover_layout.ts";

// 一天两卷各有一张封面，同目录并存，因此文件名要带卷次。用序号而不是展示标签：
// 这条管线的产物要经 shell 传给 CLI，中文文件名在 WSL 与 Git Bash 之间会被拆坏。
export function redditLifeWechatCoverFile(volumeIndex: number): string {
  if (!Number.isInteger(volumeIndex) || volumeIndex < 1) throw new Error(`invalid Reddit life WeChat cover volume: ${volumeIndex}`);
  return `cover-${volumeIndex}.png`;
}

const FONT_FAMILY = "Noto Sans SC";
// Google Fonts 只在 UA 不支持 woff2 时才回 truetype，而 satori 只认 ttf/otf/woff。
const LEGACY_USER_AGENT = "Mozilla/4.0";
const FONT_TIMEOUT_MS = 15_000;

type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

// 按 text= 裁剪：只下载这张图真正要画的那几十个字，整份 Noto Sans SC 有 10MB，子集只有几 KB。
async function loadSubsetFonts(text: string): Promise<LoadedFont[]> {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&text=${encodeURIComponent(text)}`;
  const css = await fetchText(url);
  const faces = [...css.matchAll(/font-weight:\s*(\d+);\s*src:\s*url\(([^)]+)\)/g)];
  const byWeight = new Map(faces.map(face => [Number(face[1]), face[2]] as const));
  return Promise.all(
    ([400, 700] as const).map(async weight => {
      const fontUrl = byWeight.get(weight);
      if (!fontUrl) throw new Error(`Google Fonts returned no ${weight} face for the cover subset`);
      return { name: FONT_FAMILY, data: await fetchBinary(fontUrl), weight, style: "normal" as const };
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

/**
 * 渲染一张封面。失败时返回 null 而不是抛：封面缺失会让 astro-wechat 回落到配置里的
 * defaultCover，也就是现在的行为，不值得为它中断整篇稿子的归档。
 *
 * 版式与微博那张同构，整棵树在 wechat_cover_layout.ts；这里只挑主题色和喂数据。
 */
export async function renderRedditLifeWechatCover(titles: string[], brand: string): Promise<Buffer | null> {
  const entries = titles.map(title => compact(title)).filter(Boolean);
  if (!entries.length) throw new Error("Reddit life WeChat cover needs at least one title");
  try {
    const fonts = await loadSubsetFonts(`${entries.join("")}${brand}0123456789`);
    const tree = wechatCoverTree({ titles: entries, brand, theme: PLATFORM_THEMES.reddit, fontFamily: FONT_FAMILY });
    const svg = await satori(tree, { width: WECHAT_COVER_WIDTH, height: WECHAT_COVER_HEIGHT, fonts });
    return await svgToPng(svg);
  } catch (error) {
    writeStderr(`WARN: [reddit-life-wechat] cover rendering failed, falling back to the configured defaultCover: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

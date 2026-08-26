// 微博微信封面：与 Reddit 那张共用 wechat_cover_layout.ts 的整棵 satori 树，
// 这里只挑主题色、喂前几条热搜标题。
import satori from "satori";
import { PLATFORM_THEMES } from "../src/utils/platformTheme.ts";
import { compact, writeStderr } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";
import { WECHAT_COVER_HEIGHT, WECHAT_COVER_WIDTH, wechatCoverTree } from "./wechat_cover_layout.ts";

export const WEIBO_TRENDING_WECHAT_COVER_FILE = "cover.png";
// 封面列几条。渲染器自己再 slice 一次是防御：调用方漏截时宁可少画，也不能把条目区撑破。
export const WEIBO_TRENDING_WECHAT_COVER_ITEM_LIMIT = 5;
const BRAND = "微博热搜";

const FONT_FAMILY = "Noto Sans SC";
const LEGACY_USER_AGENT = "Mozilla/4.0";
const FONT_TIMEOUT_MS = 15_000;

type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

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
 * 渲染一张封面。失败返回 null，让 astro-wechat 回落到配置里的 defaultCover。
 *
 * 不再接日期：封面按天推送，日期是冗余信息，旧版式把它摆在右下角与品牌对称，
 * 新版式里它只会跟笔圈抢顶部的视觉重心。
 */
export async function renderWeiboTrendingWechatCover(titles: string[]): Promise<Buffer | null> {
  const entries = titles
    .slice(0, WEIBO_TRENDING_WECHAT_COVER_ITEM_LIMIT)
    .map(title => compact(title))
    .filter(Boolean);
  if (!entries.length) throw new Error("Weibo trending WeChat cover needs at least one title");
  try {
    const fonts = await loadSubsetFonts(`${entries.join("")}${BRAND}0123456789`);
    const tree = wechatCoverTree({ titles: entries, brand: BRAND, theme: PLATFORM_THEMES.weibo, fontFamily: FONT_FAMILY });
    const svg = await satori(tree, { width: WECHAT_COVER_WIDTH, height: WECHAT_COVER_HEIGHT, fonts });
    return await svgToPng(svg);
  } catch (error) {
    writeStderr(`WARN: [weibo-trending-wechat] cover rendering failed, falling back to the configured defaultCover: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

import { fontData, experimental_getFontFileURL } from "astro:assets";
import type { FontData } from "astro:assets";
import { join } from "node:path";
import { getFontPathByWeight } from "@/utils/getFontPathByWeight";
import {
  loadFullFonts,
  SATORI_FONT_FAMILY,
  type LoadedFont,
} from "@/utils/satoriFont";

const PRIMARY_FONT_FAMILY = "Google Sans Code";
const PRIMARY_FONT_DATA = "--font-google-sans-code";

// 与 ogImageCache.ts 同一个理由放在 astro 的 cacheDir 里：CI 只还原这一个目录，
// Cloudflare Pages 也会识别它，字体就跟着 OG PNG 一起跨构建复用，不需要单独的缓存项。
const CJK_FONT_CACHE_DIR = join(
  process.cwd(),
  "node_modules",
  ".astro",
  "og-fonts"
);

// 拉丁字体走 astro 的 fonts[]：站点本来就要它，构建期已经下载并缓存在 cacheDir 里。
// satori 不认 woff2，所以取 woff 那份；浏览器侧仍按 @font-face 的顺序优先用 woff2。
async function loadAstroFont(
  fonts: FontData[],
  weight: 400 | 700,
  url: URL
): Promise<ArrayBuffer> {
  const fontPath = getFontPathByWeight(fonts, weight, { format: "woff" });
  if (fontPath === undefined) {
    throw new Error(`Cannot find Astro font path for weight ${weight}.`);
  }
  return fetch(experimental_getFontFileURL(fontPath, url)).then(res =>
    res.arrayBuffer()
  );
}

/**
 * OG 图的字体集。中文字体不再配进 astro 的 fonts[]——那会让 34MB 的 Noto Sans SC
 * 跟着站点部署出去，而页面样式根本不引用它。这里整份下载一次缓存在 cacheDir。
 */
export async function loadOgFonts(url: URL): Promise<LoadedFont[]> {
  const primaryFonts = fontData[PRIMARY_FONT_DATA];
  if (!primaryFonts) {
    throw new Error("Cannot find configured OG font data.");
  }

  const [regularData, boldData, cjkFonts] = await Promise.all([
    loadAstroFont(primaryFonts, 400, url),
    loadAstroFont(primaryFonts, 700, url),
    loadFullFonts(CJK_FONT_CACHE_DIR),
  ]);

  return [
    {
      name: PRIMARY_FONT_FAMILY,
      data: regularData,
      weight: 400,
      style: "normal",
    },
    {
      name: PRIMARY_FONT_FAMILY,
      data: boldData,
      weight: 700,
      style: "normal",
    },
    ...cjkFonts,
  ];
}

export const OG_FONT_FAMILY = `"${PRIMARY_FONT_FAMILY}", "${SATORI_FONT_FAMILY}"`;

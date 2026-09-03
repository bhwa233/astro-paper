// 微信封面：脱离 Astro 运行时的 satori 渲染。
// 博客那套 OG 图走 `src/pages/posts/[...slug]/index.png.ts`，靠 `astro:assets` 提供字体，
// 而微信稿不进内容集合、也没有页面，那条路够不着，因此这里自带字体获取与排版。
import satori from "satori";
import { PLATFORM_THEMES } from "../src/utils/platformTheme.ts";
import { compact, writeStderr } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";
import { loadSubsetFonts, SATORI_FONT_FAMILY } from "./satori_font.ts";
import { WECHAT_COVER_HEIGHT, WECHAT_COVER_WIDTH, wechatCoverTree } from "./wechat_cover_layout.ts";

// 一天两卷各有一张封面，同目录并存，因此文件名要带卷次。用序号而不是展示标签：
// 这条管线的产物要经 shell 传给 CLI，中文文件名在 WSL 与 Git Bash 之间会被拆坏。
export function redditLifeWechatCoverFile(volumeIndex: number): string {
  if (!Number.isInteger(volumeIndex) || volumeIndex < 1) throw new Error(`invalid Reddit life WeChat cover volume: ${volumeIndex}`);
  return `cover-${volumeIndex}.png`;
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
    const tree = wechatCoverTree({ titles: entries, brand, theme: PLATFORM_THEMES.reddit, fontFamily: SATORI_FONT_FAMILY });
    // 对象树而不是 JSX；转换的理由见 platformTheme.ts 的 SatoriNode。
    const svg = await satori(tree as Parameters<typeof satori>[0], { width: WECHAT_COVER_WIDTH, height: WECHAT_COVER_HEIGHT, fonts });
    return await svgToPng(svg);
  } catch (error) {
    writeStderr(
      `WARN: [reddit-life-wechat] cover rendering failed, falling back to the configured defaultCover: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

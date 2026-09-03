import satori, { type SatoriOptions } from "satori";
import sharp from "sharp";

/**
 * 站点侧 satori + sharp 的唯一入口：OG 图的两个端点都从这里出 PNG。
 * 换库、统一参数、加缓存时只改这一个文件；scripts/check_conventions.ts 会拦下
 * src/ 里其它地方对这两个包的直接 import。脚本侧的对应物是 scripts/image_raster.ts。
 */
export async function renderSatoriPng(
  tree: Parameters<typeof satori>[0],
  options: { width: number; height: number; fonts: SatoriOptions["fonts"] }
): Promise<Buffer> {
  const svg = await satori(tree, { ...options, embedFont: true });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

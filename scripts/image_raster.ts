// sharp 的唯一入口。两个调用点各要一种栅格化：播客封面要缩图成 webp，微信封面要把 satori 的 SVG 转成 png。
// 收在一个文件里，换库或统一压缩参数时改动面就是这里。
import sharp from "sharp";

/** 等比缩到 size 见方以内（不放大），输出 webp。 */
export function resizeToWebp(input: Buffer, size: number, quality: number): Promise<Buffer> {
  return sharp(input).resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
}

/** 把 SVG 源码栅格化成 png，尺寸由 SVG 自身的宽高决定。 */
export function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export type RasterMetadata = {
  width: number;
  height: number;
  format: string;
};

/** Decode enough of an image to verify that it is a supported raster and report its dimensions. */
export async function inspectRaster(input: Buffer): Promise<RasterMetadata> {
  const metadata = await sharp(input, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error("image has no decodable raster dimensions");
  return { width: metadata.width, height: metadata.height, format: metadata.format };
}

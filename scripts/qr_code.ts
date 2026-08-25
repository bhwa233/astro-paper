// 二维码生成的通用入口，不含任何调用方的业务知识。
// qrcode-generator 只负责纠错编码，出的是 SVG；栅格化复用 image_raster，避免多一条出图路径。
import qrcode from "qrcode-generator";
import { svgToPng } from "./image_raster.ts";

// 纠错级别 M 容错约 15%，是印刷与屏幕通用的默认档；类型 0 让库按内容长度自己挑最小版本。
const ERROR_CORRECTION = "M";
const AUTO_TYPE_NUMBER = 0;

export type QrOptions = {
  /** 输出边长（像素），含静区。 */
  size?: number;
  /** 静区宽度，按模块数算。低于 4 个模块部分扫码器会识别失败。 */
  marginModules?: number;
};

/**
 * 把一段文本编码成二维码 PNG。
 *
 * 尺寸走 SVG 缩放而不是按模块数放大：内容长度会改变二维码的版本（模块数），
 * 按模块整数倍出图的话，边长会随内容跳变，排版没法固定。
 */
// async 而不是返回 Promise 的同步函数：签名既然是 Promise，校验失败也该走 reject，
// 否则 .catch() 接不住参数错误，调用方得同时写 try/catch 和 .catch()。
export async function renderQrPng(text: string, { size = 240, marginModules = 4 }: QrOptions = {}): Promise<Buffer> {
  if (!text.trim()) throw new Error("QR code needs a non-empty payload");
  if (!Number.isInteger(size) || size < 1) throw new Error(`invalid QR size: ${size}`);
  if (!Number.isInteger(marginModules) || marginModules < 0) throw new Error(`invalid QR margin: ${marginModules}`);
  const qr = qrcode(AUTO_TYPE_NUMBER, ERROR_CORRECTION);
  qr.addData(text);
  qr.make();
  return svgToPng(qrSvg(qr, size, marginModules));
}

function qrSvg(qr: ReturnType<typeof qrcode>, size: number, marginModules: number): string {
  const modules = qr.getModuleCount();
  const span = modules + marginModules * 2;
  const cells: string[] = [];
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (qr.isDark(row, column)) cells.push(`M${column + marginModules} ${row + marginModules}h1v1h-1z`);
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">`,
    `<rect width="${span}" height="${span}" fill="#fff"/>`,
    `<path fill="#000" d="${cells.join("")}"/>`,
    "</svg>",
  ].join("");
}

// satori 中文字体的脚本侧入口。加载器本体在 src/utils/satoriFont.ts——博客 OG 图也用它，
// 依赖方向与 platformTheme.ts 一致：scripts 引 src，src 不引 scripts。
// 这里只留脚本才需要的日志格式。
import { writeStderr } from "./blog_common.ts";

export { loadSubsetFonts, SATORI_FONT_FAMILY, type LoadedFont } from "../src/utils/satoriFont.ts";

/** 供渲染器统一使用的日志格式：字体失败不该看起来像别的什么错。 */
export function warnFontFailure(label: string, error: unknown): void {
  writeStderr(`WARN: [${label}] font subset unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

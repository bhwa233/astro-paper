// 中文字体。按 text= 裁子集，而不是 @remotion/google-fonts 的 NotoSansSC——
// 那个包把 `chinese-simplified` 展开成 120 个 chunk 子集（合计约 6MB），
// 每个渲染标签页都要重跑这 120 个请求。而一支视频真正要画的只有几百个字，
// 子集只有几十 KB、两个请求。
//
// 与 scripts/satori_font.ts 是同一个思路，但不复用它：那份跑在 Node 里、
// 用 process.stderr 打日志，还要为 satori 骗 UA 拿 ttf（satori 不认 woff2）。
// 这边跑在 Chromium 里，woff2 原生支持，不需要那两样。
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

export const FONT_FAMILY = "Noto Sans SC";

async function loadSubset(text: string): Promise<void> {
  const unique = [...new Set([...text])].sort().join("");
  if (!unique.length) return;

  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&text=${encodeURIComponent(unique)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Fonts subset request failed: HTTP ${response.status}`);

  const style = document.createElement("style");
  style.textContent = await response.text();
  document.head.appendChild(style);

  // document.fonts.ready 只等已经开始加载的字体；@font-face 是惰性的，
  // 不显式 load 一次，它会等到某个元素真正用上才去取，而那时这一帧已经截过图了。
  await Promise.all([document.fonts.load(`400 100px "${FONT_FAMILY}"`, unique), document.fonts.load(`700 100px "${FONT_FAMILY}"`, unique)]);
  await document.fonts.ready;
}

/** 在字体就位之前挂起渲染。text 要覆盖整支视频会出现的全部字符，不只当前这一帧。 */
export function useSubsetFont(text: string): void {
  const [handle] = useState(() => delayRender("Loading Noto Sans SC subset"));
  useEffect(() => {
    loadSubset(text)
      .then(() => continueRender(handle))
      .catch(error => cancelRender(error));
  }, [handle, text]);
}

// 图片消息用 OPPO Sans 4.0。许可只允许随软件分发「未修改」的字体，所以仓库里放的是官方原版
// 可变字重 TTF（约 22MB），不能转 woff2、也不能按 text= 裁子集。字重轴对应 CSS 100–700。
// 字体文件由 Remotion 的本地静态服务提供，每次截图重新加载也只是本机读盘。
export const OPPO_SANS_FAMILY = "OPPO Sans 4.0";

async function loadOppoSans(): Promise<void> {
  const face = new FontFace(OPPO_SANS_FAMILY, `url("${staticFile("fonts/OPPOSans4.0.ttf")}") format("truetype")`, { weight: "100 700" });
  document.fonts.add(await face.load());
  await document.fonts.ready;
}

export function useOppoSans(): void {
  const [handle] = useState(() => delayRender("Loading OPPO Sans 4.0"));
  useEffect(() => {
    loadOppoSans()
      .then(() => continueRender(handle))
      .catch(error => cancelRender(error));
  }, [handle]);
}

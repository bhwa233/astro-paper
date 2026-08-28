// 中文字体。按 text= 裁子集，而不是 @remotion/google-fonts 的 NotoSansSC——
// 那个包把 `chinese-simplified` 展开成 120 个 chunk 子集（合计约 6MB），
// 每个渲染标签页都要重跑这 120 个请求。而一支视频真正要画的只有几百个字，
// 子集只有几十 KB、两个请求。
//
// 与 scripts/satori_font.ts 是同一个思路，但不复用它：那份跑在 Node 里、
// 用 process.stderr 打日志，还要为 satori 骗 UA 拿 ttf（satori 不认 woff2）。
// 这边跑在 Chromium 里，woff2 原生支持，不需要那两样。
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

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

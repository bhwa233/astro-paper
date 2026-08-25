// 微信封面：脱离 Astro 运行时的 satori 渲染。
// 博客那套 OG 图走 `src/pages/posts/[...slug]/index.png.ts`，靠 `astro:assets` 提供字体，
// 而微信稿不进内容集合、也没有页面，那条路够不着，因此这里自带字体获取与排版。
import satori from "satori";
import { compact, writeStderr } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";
import { coverEntryFontSize } from "./wechat_cover_layout.ts";

// 一天两卷各有一张封面，同目录并存，因此文件名要带卷次。用序号而不是展示标签：
// 这条管线的产物要经 shell 传给 CLI，中文文件名在 WSL 与 Git Bash 之间会被拆坏。
export function redditLifeWechatCoverFile(volumeIndex: number): string {
  if (!Number.isInteger(volumeIndex) || volumeIndex < 1) throw new Error(`invalid Reddit life WeChat cover volume: ${volumeIndex}`);
  return `cover-${volumeIndex}.png`;
}

// 微信首图按 2.35:1 裁剪，用别的比例会被两侧切掉。
const COVER_WIDTH = 1175;
const COVER_HEIGHT = 500;

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

// 一篇稿子收录五帖，封面必须给每个问题一个同等清晰的入口。字号统一按最长那条算，
// 让短标题跟随同一基线；上界只在极短标题时生效。
const MAX_ENTRY_FONT_SIZE = 40;

function entryLine(title: string, index: number, fontSize: number) {
  return {
    type: "div",
    props: {
      style: { display: "flex", alignItems: "baseline", width: "100%", fontSize, lineHeight: 1.2, overflow: "hidden" },
      children: [
        { type: "span", props: { style: { width: "42px", marginRight: "8px", color: "#1687d4", fontWeight: 700 }, children: String(index + 1).padStart(2, "0") } },
        { type: "span", props: { style: { fontWeight: 700 }, children: title } },
      ],
    },
  };
}

// 封面是公众号列表里的一张编辑便签：蓝底、暖白纸和笔圈的栏目名借鉴参考图，
// 五个问题是唯一正文，不再塞入日期、卷次或解释性页脚。
function coverTree(titles: string[], brand: string) {
  // 这张白卡比共用布局的文本列更宽，额外的 1px 吃掉横向余量而不牺牲长标题。
  const fontSize = Math.min(MAX_ENTRY_FONT_SIZE, coverEntryFontSize(titles, MAX_ENTRY_FONT_SIZE) + 1);
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2f91df",
        fontFamily: FONT_FAMILY,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              position: "relative",
              width: "94%",
              height: "78%",
              borderRadius: "34px",
              background: "#fffdf8",
            },
            children: {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", margin: "40px 60px", width: "89%", height: "80%" },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        position: "absolute",
                        top: "-20px",
                        left: "-24px",
                        width: "310px",
                        height: "66px",
                        border: "4px solid #1687d4",
                        borderRadius: "50%",
                        transform: "rotate(-3deg)",
                      },
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        position: "absolute",
                        top: "-16px",
                        left: "-18px",
                        width: "304px",
                        height: "60px",
                        border: "3px solid #1687d4",
                        borderRadius: "50%",
                        transform: "rotate(2deg)",
                        opacity: "0.88",
                      },
                    },
                  },
                  {
                    type: "div",
                    props: { style: { display: "flex", fontSize: 36, fontWeight: 700, lineHeight: 1.1 }, children: brand },
                  },
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "26px", overflow: "hidden" },
                      children: titles.map((title, index) => entryLine(title, index, fontSize)),
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  };
}

/**
 * 渲染一张封面。失败时返回 null 而不是抛：封面缺失会让 astro-wechat 回落到配置里的
 * defaultCover，也就是现在的行为，不值得为它中断整篇稿子的归档。
 */
export async function renderRedditLifeWechatCover(titles: string[], brand: string): Promise<Buffer | null> {
  const entries = titles.map(title => compact(title)).filter(Boolean);
  if (!entries.length) throw new Error("Reddit life WeChat cover needs at least one title");
  try {
    const fonts = await loadSubsetFonts(`${entries.join("")}${brand}·0123456789`);
    const svg = await satori(coverTree(entries, brand), { width: COVER_WIDTH, height: COVER_HEIGHT, fonts });
    return await svgToPng(svg);
  } catch (error) {
    writeStderr(`WARN: [reddit-life-wechat] cover rendering failed, falling back to the configured defaultCover: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

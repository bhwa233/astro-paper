// 微信封面：脱离 Astro 运行时的 satori 渲染。
// 博客那套 OG 图走 `src/pages/posts/[...slug]/index.png.ts`，靠 `astro:assets` 提供字体，
// 而微信稿不进内容集合、也没有页面，那条路够不着，因此这里自带字体获取与排版。
import satori from "satori";
import { compact, writeStderr } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";

export const REDDIT_LIFE_WECHAT_COVER_FILE = "cover.png";

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

// 一篇稿子收录三帖，封面改成「大字期号 + 逐条列出帖子标题」：单帖标题当主视觉时另外两帖没有出口。
// 条目字号按最长那条分档，短的跟着一起大会让三行长短不齐。
function entryFontSize(titles: string[]): number {
  const longest = Math.max(...titles.map(title => [...title].length));
  if (longest <= 14) return 40;
  if (longest <= 20) return 34;
  if (longest <= 26) return 30;
  return 26;
}

function entryLine(title: string, fontSize: number) {
  return {
    type: "div",
    props: {
      style: { display: "flex", alignItems: "baseline", width: "100%", fontSize, lineHeight: 1.35, overflow: "hidden" },
      children: [
        { type: "span", props: { style: { marginRight: "14px", fontWeight: 700 }, children: "·" } },
        { type: "span", props: { style: { fontWeight: 700 }, children: title } },
      ],
    },
  };
}

// 版式对齐博客的 OG 图（src/pages/posts/[...slug]/index.png.ts）：白底、两张错位叠放的描边卡片、
// 内容钉顶、页脚一行。那边是 1200×630，这里是 2.35:1，所以只有字号按标题长度分档，比例照搬。
function coverTree(titles: string[], brand: string, issue: string) {
  const fontSize = entryFontSize(titles);
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fefbfb",
        fontFamily: FONT_FAMILY,
      },
      children: [
        // 后面这张卡只负责错位露出一条边，做出叠纸的厚度感，本身不装内容。
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "-1px",
              right: "-1px",
              display: "flex",
              justifyContent: "center",
              margin: "2.5rem",
              width: "88%",
              height: "80%",
              border: "4px solid #000",
              borderRadius: "4px",
              background: "#ecebeb",
              opacity: "0.9",
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "center",
              margin: "2rem",
              width: "88%",
              height: "80%",
              border: "4px solid #000",
              borderRadius: "4px",
              background: "#fefbfb",
            },
            children: {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", justifyContent: "space-between", margin: "20px", width: "90%", height: "90%" },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", gap: "10px", maxHeight: "84%", overflow: "hidden" },
                      children: titles.map(title => entryLine(title, fontSize)),
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", justifyContent: "space-between", width: "100%", marginBottom: "8px", fontSize: 28, fontWeight: 700 },
                      children: [
                        { type: "span", props: { children: brand } },
                        { type: "span", props: { children: issue } },
                      ],
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
export async function renderRedditLifeWechatCover(titles: string[], brand: string, issue: number): Promise<Buffer | null> {
  const entries = titles.map(title => compact(title)).filter(Boolean);
  if (!entries.length) throw new Error("Reddit life WeChat cover needs at least one title");
  const issueLabel = `#${issue}`;
  try {
    const fonts = await loadSubsetFonts(`${entries.join("")}${brand}${issueLabel}·`);
    const svg = await satori(coverTree(entries, brand, issueLabel), { width: COVER_WIDTH, height: COVER_HEIGHT, fonts });
    return await svgToPng(svg);
  } catch (error) {
    writeStderr(`WARN: [reddit-life-wechat] cover rendering failed, falling back to the configured defaultCover: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// 微博微信封面：沿用现有微信首图的 satori 排版，输入只取前三条热搜标题。
import satori from "satori";
import { compact, writeStderr } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";

export const WEIBO_TRENDING_WECHAT_COVER_FILE = "cover.png";

const COVER_WIDTH = 1175;
const COVER_HEIGHT = 500;
const FONT_FAMILY = "Noto Sans SC";
const LEGACY_USER_AGENT = "Mozilla/4.0";
const FONT_TIMEOUT_MS = 15_000;

type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

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

function entryFontSize(titles: string[]): number {
  const longest = Math.max(...titles.map(title => [...title].length));
  if (longest <= 14) return 52;
  if (longest <= 20) return 46;
  if (longest <= 26) return 40;
  return 34;
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

function coverTree(titles: string[], archiveDate: string) {
  const fontSize = entryFontSize(titles);
  return {
    type: "div",
    props: {
      style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fefbfb", fontFamily: FONT_FAMILY },
      children: [
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
            style: { display: "flex", justifyContent: "center", margin: "2rem", width: "88%", height: "80%", border: "4px solid #000", borderRadius: "4px", background: "#fefbfb" },
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
                        { type: "span", props: { children: "每日微博热搜总结" } },
                        { type: "span", props: { children: archiveDate } },
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

export async function renderWeiboTrendingWechatCover(titles: string[], archiveDate: string): Promise<Buffer | null> {
  const entries = titles
    .slice(0, 3)
    .map(title => compact(title))
    .filter(Boolean);
  if (!entries.length) throw new Error("Weibo trending WeChat cover needs at least one title");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) throw new Error(`invalid Weibo trending WeChat cover date: ${archiveDate}`);
  try {
    const fonts = await loadSubsetFonts(`${entries.join("")}每日微博热搜总结${archiveDate}·`);
    const svg = await satori(coverTree(entries, archiveDate), { width: COVER_WIDTH, height: COVER_HEIGHT, fonts });
    return await svgToPng(svg);
  } catch (error) {
    writeStderr(`WARN: [weibo-trending-wechat] cover rendering failed, falling back to the configured defaultCover: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

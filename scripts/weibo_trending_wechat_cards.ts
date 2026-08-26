// 微博热搜图片消息卡片。恢复前的 Reddit 故事卡只有单段正文，容不下「热搜标题 + 摘要」层级；
// 已装的 satori 负责渲染但不提供业务版式，因此这里只手写微博卡片树，并继续复用 platformCard、
// circledBrand、cardFontSize、字体子集与统一栅格化封装。
import satori from "satori";
import { PLATFORM_THEMES, platformCard, type SatoriNode } from "../src/utils/platformTheme.ts";
import { compact } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";
import { loadSubsetFonts, SATORI_FONT_FAMILY, type LoadedFont } from "./satori_font.ts";
import { cardFontSize, WECHAT_CARD_SIZE } from "./wechat_card_layout.ts";
import { circledBrand } from "./wechat_cover_layout.ts";
import type { WeiboTrendingWechatItem } from "./weibo_trending_wechat_compose.ts";

const BRAND = "微博热搜";
const THEME = PLATFORM_THEMES.weibo;
const INNER_WIDTH = 894;
const INNER_MARGIN = "74px 62px";
const TOPIC_INNER_HEIGHT = 741;
const TOPIC_INNER_MARGIN = "50px 62px";

function innerColumn(children: SatoriNode[], topic = false): SatoriNode {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "88%",
        height: topic ? "88%" : "82%",
        margin: topic ? TOPIC_INNER_MARGIN : INNER_MARGIN,
        overflow: topic ? "visible" : "hidden",
        color: "#191919",
      },
      children,
    },
  };
}

function coverTree(date: string, titles: string[]): SatoriNode {
  const entries = titles.slice(0, 10).map(compact).filter(Boolean);
  if (!entries.length) throw new Error("Weibo trending WeChat cover needs at least one title");
  const displayDate = date.replaceAll("-", " / ");
  const titleFontSize = cardFontSize({
    characters: Math.max(...entries.map(title => [...title].length)),
    width: INNER_WIDTH - 68,
    height: 44,
    lineHeight: 1.2,
    min: 28,
    max: 34,
  });

  return platformCard(
    THEME,
    SATORI_FONT_FAMILY,
    innerColumn([
      {
        type: "div",
        props: {
          style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
          children: [
            circledBrand(BRAND, THEME.accent, 42),
            { type: "div", props: { style: { display: "flex", fontSize: 25, color: "#777777" }, children: displayDate } },
          ],
        },
      },
      {
        type: "div",
        props: {
          style: { display: "flex", marginTop: "38px", marginBottom: "24px", width: "54px", height: "5px", background: THEME.accent },
        },
      },
      ...entries.map((title, index) => ({
        type: "div",
        props: {
          style: { display: "flex", alignItems: "baseline", width: "100%", marginTop: index === 0 ? "0" : "11px" },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", width: "68px", fontSize: 24, fontWeight: 700, color: THEME.accent },
                children: String(index + 1).padStart(2, "0"),
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", flex: 1, fontSize: titleFontSize, fontWeight: 700, lineHeight: 1.2, overflow: "hidden" },
                children: title,
              },
            },
          ],
        },
      })),
    ]),
  );
}

function topicTree(item: WeiboTrendingWechatItem, index: number, total: number): SatoriNode {
  const title = compact(item.title);
  const summary = compact(item.summary);
  if (!title) throw new Error(`Weibo trending WeChat card ${index} needs a title`);
  if (!summary) throw new Error(`Weibo trending WeChat card ${index} needs a summary`);
  const titleFontSize = cardFontSize({
    characters: [...title].length,
    width: INNER_WIDTH - 120,
    height: 126,
    lineHeight: 1.2,
    min: 38,
    max: 48,
  });
  const summaryFontSize = cardFontSize({
    characters: [...summary].length,
    width: INNER_WIDTH,
    height: TOPIC_INNER_HEIGHT - 217,
    lineHeight: 1.5,
    min: 29,
    max: 38,
  });

  return platformCard(
    THEME,
    SATORI_FONT_FAMILY,
    innerColumn([
      {
        type: "div",
        props: {
          style: { display: "flex", alignItems: "center", width: "100%", height: "126px", flexShrink: 0 },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", width: "120px", fontSize: 58, lineHeight: 1, fontWeight: 700, color: THEME.accent },
                children: String(item.rank).padStart(2, "0"),
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", flex: 1, fontSize: titleFontSize, lineHeight: 1.2, fontWeight: 700 },
                children: title,
              },
            },
          ],
        },
      },
      { type: "div", props: { style: { display: "flex", flexShrink: 0, width: "100%", height: "2px", margin: "18px 0 24px", background: "#E8E8E8" } } },
      {
        type: "div",
        props: {
          style: { display: "flex", flexGrow: 1, alignItems: "flex-start", width: "100%", fontSize: summaryFontSize, lineHeight: 1.5, color: "#343434" },
          children: summary,
        },
      },
      {
        type: "div",
        props: {
          style: { display: "flex", flexShrink: 0, justifyContent: "flex-end", width: "100%", height: "29px", marginTop: "18px", fontSize: 24, color: "#9A9A9A" },
          children: `${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
        },
      },
    ], true),
  );
}

async function renderCard(tree: SatoriNode, fonts: LoadedFont[]): Promise<Buffer> {
  const svg = await satori(tree, { width: WECHAT_CARD_SIZE, height: WECHAT_CARD_SIZE, fonts });
  return svgToPng(svg);
}

export async function renderWeiboTrendingWechatCards(date: string, items: WeiboTrendingWechatItem[]): Promise<Buffer[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid Weibo trending WeChat card date: ${date || "missing"}`);
  if (!items.length) throw new Error("Weibo trending WeChat cards need at least one item");

  const summaries = items.map(item => compact(item.summary));
  const fonts = await loadSubsetFonts(`${BRAND}${date}${items.map(item => item.title).join("")}${summaries.join("")}0123456789/`);
  const cards: Buffer[] = [await renderCard(coverTree(date, items.map(item => item.title)), fonts)];
  for (const [index, item] of items.entries()) {
    cards.push(await renderCard(topicTree(item, index + 1, items.length), fonts));
  }
  return cards;
}

// 微信「图片消息」的卡片版式：一帖一篇，首张是标题卡，其余每条回答各占一张。
//
// 与封面（wechat_cover_layout.ts）共用 platformCard 的底色卡片骨架和笔圈栏目名，
// 所以两种形态放在同一个公众号里看得出是同一个栏目；差别只有画幅——封面是 2.35:1 的横条，
// 这里是 1:1，微信的图片消息按正方形展示，别的比例会被裁。
//
// 排版只有一件难事：一条回答短的七个字、长的三百多字，同一套字号不可能都好看。
// cardFontSize 按「字数 × 字号² ≈ 可用面积」反解出字号，短的放大、长的缩小，
// 上下界防止两头失控。
import { platformCard, type PlatformTheme, type SatoriNode } from "../src/utils/platformTheme.ts";
import { circledBrand } from "./wechat_cover_layout.ts";

/** 微信图片消息按 1:1 展示。1080 是公众号图片的常用长边，再大只是徒增素材体积。 */
export const WECHAT_CARD_SIZE = 1080;

// platformCard 的卡片占画布 94% × 78%，卡内再留 89% × 80% 作内框，与封面同一组比例。
const CARD_INNER_WIDTH = Math.round(WECHAT_CARD_SIZE * 0.94 * 0.89);
const CARD_INNER_HEIGHT = Math.round(WECHAT_CARD_SIZE * 0.78 * 0.8);
const CARD_INNER_MARGIN = "72px 60px";

const BODY_LINE_HEIGHT = 1.6;
// 28px 是这个画幅下还读得清的下界；56 以上一条短回答会大到像标语。
const BODY_MIN_FONT_SIZE = 28;
const BODY_MAX_FONT_SIZE = 56;

const TITLE_LINE_HEIGHT = 1.35;
const TITLE_MIN_FONT_SIZE = 44;
const TITLE_MAX_FONT_SIZE = 84;

const BRAND_FONT_SIZE = 46;
const BRAND_GAP = 56;

// 页码那一行：小、灰、右对齐，只负责回答「这是第几张、一共几张」。
const INDEX_FONT_SIZE = 26;
const INDEX_LINE_HEIGHT = 1.2;
const INDEX_GAP = 28;
const INDEX_COLOR = "#9AA0A6";

/**
 * 自动字号：让 `characters` 个字排进 `width × height` 的框里。
 *
 * CJK 一字约 1em 宽，于是 n 个字占 n·f 的行长，折成 n·f/width 行，每行 lineHeight·f 高：
 *
 *   n·f/width × lineHeight·f ≤ height  ⇒  f ≤ √(width × height / (lineHeight × n))
 *
 * 拉丁字符比 1em 窄，所以这个估计只会偏保守——宁可字小一号，也不要 satori 把末尾几行
 * 溢出裁掉，那是静默丢内容。
 */
export function cardFontSize({
  characters,
  width,
  height,
  lineHeight,
  min,
  max,
}: {
  characters: number;
  width: number;
  height: number;
  lineHeight: number;
  min: number;
  max: number;
}): number {
  if (!Number.isInteger(characters) || characters < 1) throw new Error(`invalid WeChat card character count: ${characters}`);
  const fitted = Math.floor(Math.sqrt((width * height) / (lineHeight * characters)));
  return Math.max(min, Math.min(max, fitted));
}

const STORY_HEADER_HEIGHT = Math.round(INDEX_FONT_SIZE * INDEX_LINE_HEIGHT) + INDEX_GAP;

/**
 * 一张故事卡最多装得下多少字。
 *
 * 字号压到下界之后就没有余地了，再多的字会被 `overflow: hidden` 裁掉——那是静默丢内容，
 * 读者看到的是一条没有结尾的回答。调用方应当据此把超长回答挑出去，而不是交给版式默默截断。
 */
export const WECHAT_STORY_CARD_MAX_CHARACTERS = Math.floor(
  (CARD_INNER_WIDTH * (CARD_INNER_HEIGHT - STORY_HEADER_HEIGHT)) /
    (BODY_LINE_HEIGHT * BODY_MIN_FONT_SIZE * BODY_MIN_FONT_SIZE),
);

function innerColumn(children: SatoriNode[]): SatoriNode {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        margin: CARD_INNER_MARGIN,
        width: "89%",
        height: "80%",
        overflow: "hidden",
      },
      children,
    },
  };
}

function indexLine(index: number, total: number): SatoriNode {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        justifyContent: "flex-end",
        fontSize: INDEX_FONT_SIZE,
        lineHeight: INDEX_LINE_HEIGHT,
        color: INDEX_COLOR,
        marginBottom: `${INDEX_GAP}px`,
      },
      children: `${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    },
  };
}

/**
 * 首张卡：笔圈栏目名加问题标题。
 *
 * 微信把图片消息的第一张当封面，因此这张卡同时是信息流里的缩略图——它必须能单独说清
 * 这一篇在聊什么，不能只放品牌。
 */
export function wechatTitleCardTree({ title, brand, theme, fontFamily }: { title: string; brand: string; theme: PlatformTheme; fontFamily: string }): SatoriNode {
  const text = title.trim();
  if (!text) throw new Error("WeChat title card needs a title");

  const brandHeight = Math.round(BRAND_FONT_SIZE * 1.1) + BRAND_GAP;
  const fontSize = cardFontSize({
    characters: [...text].length,
    width: CARD_INNER_WIDTH,
    height: CARD_INNER_HEIGHT - brandHeight,
    lineHeight: TITLE_LINE_HEIGHT,
    min: TITLE_MIN_FONT_SIZE,
    max: TITLE_MAX_FONT_SIZE,
  });

  return platformCard(
    theme,
    fontFamily,
    innerColumn([
      circledBrand(brand, theme.accent, BRAND_FONT_SIZE),
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            marginTop: `${BRAND_GAP}px`,
            fontSize,
            fontWeight: 700,
            lineHeight: TITLE_LINE_HEIGHT,
            overflow: "hidden",
          },
          children: text,
        },
      },
    ]),
  );
}

/** 一条回答一张卡。右上角页码，正文占满剩下的框。 */
export function wechatStoryCardTree({ story, index, total, theme, fontFamily }: { story: string; index: number; total: number; theme: PlatformTheme; fontFamily: string }): SatoriNode {
  const text = story.trim();
  if (!text) throw new Error("WeChat story card needs text");
  if (!Number.isInteger(index) || index < 1 || index > total) throw new Error(`invalid WeChat story card index: ${index}/${total}`);

  const fontSize = cardFontSize({
    characters: [...text].length,
    width: CARD_INNER_WIDTH,
    height: CARD_INNER_HEIGHT - STORY_HEADER_HEIGHT,
    lineHeight: BODY_LINE_HEIGHT,
    min: BODY_MIN_FONT_SIZE,
    max: BODY_MAX_FONT_SIZE,
  });

  return platformCard(
    theme,
    fontFamily,
    innerColumn([
      indexLine(index, total),
      // 竖直居中：一条七个字的回答顶在框上、底下空掉三分之二，看起来像排版没写完。
      // 撑满剩余高度再居中，长短两头都稳。
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
            fontSize,
            lineHeight: BODY_LINE_HEIGHT,
            overflow: "hidden",
          },
          children: text,
        },
      },
    ]),
  );
}

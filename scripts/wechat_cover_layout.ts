// 微信首图的共用版式：Reddit 与微博两张封面除了品牌行、主题色和条目内容之外完全同构，
// 因此整棵 satori 树连同条目字号分档都放在这里，两个封面脚本只负责取数据和加载字体。
//
// 底色与卡片色来自 src/utils/platformTheme.ts——那份色板同时供博客文章的 OG 图使用，
// 封面与 OG 必须同色，色板就不能在 scripts 这边再存一份。
import { platformCard, type PlatformTheme, type SatoriNode } from "../src/utils/platformTheme.ts";

// 微信首图按 2.35:1 裁剪，用别的比例会被两侧切掉。
export const WECHAT_COVER_WIDTH = 1175;
export const WECHAT_COVER_HEIGHT = 500;

const BRAND_FONT_SIZE = 38;
const BRAND_LINE_HEIGHT = 1.1;
// 品牌行与条目区之间的呼吸，同时给笔圈下沿留出不压到第一条的余量。
const BRAND_GAP = 26;

const ENTRY_GAP = 10;
const ENTRY_LINE_HEIGHT = 1.14;
// 编号栏宽 1.2em：等宽拉丁一位 0.6em，两位正好占满，栏内不留缝——
// 缝全部交给 ENTRY_NUMBER_GAP，调间距时只有一个地方要动。
const ENTRY_NUMBER_WIDTH_EM = 1.2;
const ENTRY_NUMBER_GAP = 10;

// 长标题允许折成两行，字号不再被最极端的一条压到难以阅读。
const MIN_FONT_SIZE = 26;
const MAX_FONT_SIZE = 30;
const MAX_ENTRY_LINES = 2;

// 内框可用尺寸，由版式百分比推出（画布 1175×500，卡片 94%×78%，内框 89%×84%）：
//   宽 = 1175 × 94% × 89% ≈ 983
//   高 = 500 × 78% × 84% ≈ 328，扣掉品牌行与 BRAND_GAP，条目区剩 260
const INNER_WIDTH = 983;
const LIST_HEIGHT = Math.round(WECHAT_COVER_HEIGHT * 0.78 * 0.84 - BRAND_FONT_SIZE * BRAND_LINE_HEIGHT - BRAND_GAP);

function estimatedTextWidthEm(text: string): number {
  return [...text].reduce((width, char) => {
    if (/\s/.test(char)) return width + 0.35;
    if (/^[A-Za-z0-9]$/.test(char)) return width + 0.6;
    return width + (char.codePointAt(0)! <= 0x7f ? 0.5 : 1);
  }, 0);
}

function entryLineCount(title: string, fontSize: number): number {
  const titleWidth = INNER_WIDTH - fontSize * ENTRY_NUMBER_WIDTH_EM - ENTRY_NUMBER_GAP;
  return Math.ceil((estimatedTextWidthEm(title) * fontSize) / titleWidth);
}

/**
 * 从大到小选择字号。每条最多折两行，再用实际折行总数校验列表高度；
 * CJK 按 1em、ASCII 按近似字宽估算，避免英文括注把整张封面压到最小字号。
 */
export function coverEntryFontSize(titles: string[]): number {
  if (!titles.length) throw new Error("WeChat cover font sizing needs at least one title");
  for (let fontSize = MAX_FONT_SIZE; fontSize >= MIN_FONT_SIZE; fontSize -= 1) {
    const lineCounts = titles.map(title => entryLineCount(title, fontSize));
    if (lineCounts.some(lines => lines > MAX_ENTRY_LINES)) continue;
    const textHeight = lineCounts.reduce((sum, lines) => sum + lines, 0) * fontSize * ENTRY_LINE_HEIGHT;
    if (textHeight + ENTRY_GAP * (titles.length - 1) <= LIST_HEIGHT) return fontSize;
  }
  return MIN_FONT_SIZE;
}

// 笔圈栏目名：两道椭圆描边错开角度，模仿手绘。
//
// 椭圆不写宽高，改用四边负 inset 贴着品牌文字自己撑开。原先是照「Reddit 问答精选」量出来
// 写死 310px，换成四个字的「微博热搜」弧线就切进末字；而按字数估宽（CJK 1em、ASCII 0.6em）
// 只是把写死换成算错——那个模型恰好对 reddit 成立，对短品牌照样偏窄。让椭圆跟着文字盒子走，
// 品牌换成几个字都不会算错。
//
// 代价：参考图里末字微微探出圈外的手绘感没有了，现在圈总是完整套住品牌。
//
// 外层必须 alignSelf: flex-start，否则它在列里被拉伸到满宽，椭圆会跟着横跨整张卡片。
// 全部按字号的比例给，图片消息的卡片用同一个圈但字号大得多；写死的 30/14/12 换到 72px
// 品牌上会细成一根发丝。比例取自原先在 36px 下量定的值，让不同字号保持相同的手绘线条比例。
const BRAND_CIRCLE_INSET_X_EM = 30 / 36;
const BRAND_CIRCLE_INSET_TOP_EM = 14 / 36;
const BRAND_CIRCLE_INSET_BOTTOM_EM = 12 / 36;
const BRAND_CIRCLE_OUTER_BORDER_EM = 4 / 36;
const BRAND_CIRCLE_INNER_BORDER_EM = 3 / 36;

function brandEllipse(accent: string, fontSize: number, border: number, grow: number, rotate: number, opacity: string): SatoriNode {
  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        top: `${-Math.round(fontSize * BRAND_CIRCLE_INSET_TOP_EM) - grow}px`,
        bottom: `${-Math.round(fontSize * BRAND_CIRCLE_INSET_BOTTOM_EM) - grow}px`,
        left: `${-Math.round(fontSize * BRAND_CIRCLE_INSET_X_EM) - grow}px`,
        right: `${-Math.round(fontSize * BRAND_CIRCLE_INSET_X_EM) - grow}px`,
        border: `${border}px solid ${accent}`,
        borderRadius: "50%",
        transform: `rotate(${rotate}deg)`,
        opacity,
      },
    },
  };
}

/** 笔圈栏目名。封面与图片消息卡片共用，字号由调用方给。 */
export function circledBrand(brand: string, accent: string, fontSize: number = BRAND_FONT_SIZE): SatoriNode {
  const outerBorder = Math.round(fontSize * BRAND_CIRCLE_OUTER_BORDER_EM);
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        alignSelf: "flex-start",
        fontSize,
        fontWeight: 700,
        lineHeight: BRAND_LINE_HEIGHT,
      },
      children: [
        brandEllipse(accent, fontSize, outerBorder, outerBorder, -3, "1"),
        brandEllipse(accent, fontSize, Math.round(fontSize * BRAND_CIRCLE_INNER_BORDER_EM), 0, 2, "0.88"),
        { type: "div", props: { style: { display: "flex" }, children: brand } },
      ],
    },
  };
}

function entryLine(title: string, index: number, fontSize: number, accent: string): SatoriNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", alignItems: "flex-start", width: "100%", fontSize, lineHeight: ENTRY_LINE_HEIGHT, overflow: "hidden" },
      children: [
        {
          type: "span",
          props: {
            style: {
              width: `${Math.round(fontSize * ENTRY_NUMBER_WIDTH_EM)}px`,
              marginRight: `${ENTRY_NUMBER_GAP}px`,
              color: accent,
              fontWeight: 700,
            },
            children: String(index + 1).padStart(2, "0"),
          },
        },
        { type: "span", props: { style: { display: "flex", flex: 1, minWidth: 0, fontWeight: 700 }, children: title } },
      ],
    },
  };
}

/**
 * 一张封面的完整 satori 树：平台色铺底，圆角卡片浮在中间，卡内是笔圈栏目名加一列编号条目。
 *
 * 不画日期。封面本身按天推送，日期是冗余信息，挤在笔圈对面还会把顶部的视觉重心拉偏。
 */
export function wechatCoverTree({ titles, brand, theme, fontFamily }: { titles: string[]; brand: string; theme: PlatformTheme; fontFamily: string }): SatoriNode {
  if (!titles.length) throw new Error("WeChat cover needs at least one title");
  const fontSize = coverEntryFontSize(titles);
  return platformCard(theme, fontFamily, {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", margin: "30px 60px", width: "89%", height: "84%" },
      children: [
        circledBrand(brand, theme.accent),
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: `${ENTRY_GAP}px`, marginTop: `${BRAND_GAP}px`, overflow: "hidden" },
            children: titles.map((title, index) => entryLine(title, index, fontSize, theme.accent)),
          },
        },
      ],
    },
  });
}

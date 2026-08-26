// 微信首图的共用版式：Reddit 与微博两张封面除了品牌行、主题色和条目内容之外完全同构，
// 因此整棵 satori 树连同条目字号分档都放在这里，两个封面脚本只负责取数据和加载字体。
//
// 底色与卡片色来自 src/utils/platformTheme.ts——那份色板同时供博客文章的 OG 图使用，
// 封面与 OG 必须同色，色板就不能在 scripts 这边再存一份。
import { platformCard, type PlatformTheme, type SatoriNode } from "../src/utils/platformTheme.ts";

// 微信首图按 2.35:1 裁剪，用别的比例会被两侧切掉。
export const WECHAT_COVER_WIDTH = 1175;
export const WECHAT_COVER_HEIGHT = 500;

const BRAND_FONT_SIZE = 36;
const BRAND_LINE_HEIGHT = 1.1;
// 品牌行与条目区之间的呼吸，同时给笔圈下沿留出不压到第一条的余量。
const BRAND_GAP = 26;

const ENTRY_GAP = 10;
const ENTRY_LINE_HEIGHT = 1.2;
// 编号栏宽 1.2em：等宽拉丁一位 0.6em，两位正好占满，栏内不留缝——
// 缝全部交给 ENTRY_NUMBER_GAP，调间距时只有一个地方要动。
const ENTRY_NUMBER_WIDTH_EM = 1.2;
const ENTRY_NUMBER_GAP = 10;

// 上游译名卡在 40 字，40 × 20px = 800px 仍是单行，所以 20 是「最长标题也不折行」的下界。
// 再往下缩字就小到封面读不清，与其继续缩不如让它折行。
const MIN_FONT_SIZE = 20;
// 两张封面都只收录五条，五条时高度约束算出来 34 左右，这个上界够不着。
// 它只在将来条数变少时生效，免得三四条的封面把字撑到荒唐的大小。
const MAX_FONT_SIZE = 44;

// 内框可用尺寸，由版式百分比推出（画布 1175×500，卡片 94%×78%，内框 89%×80%）：
//   宽 = 1175 × 94% × 89% ≈ 983
//   高 = 500 × 78% × 80% ≈ 312，扣掉品牌行 36 × 1.1 与 BRAND_GAP，条目区剩 246
const INNER_WIDTH = 983;
const LIST_HEIGHT = Math.round(WECHAT_COVER_HEIGHT * 0.78 * 0.8 - BRAND_FONT_SIZE * BRAND_LINE_HEIGHT - BRAND_GAP);

/**
 * 条目字号：取宽度与高度两个约束的较小值。
 * 宽度保证最长的一条不折行，高度保证 n 条不被 overflow 裁掉。
 *
 * 宽度那一侧要连编号栏一起解——栏宽本身按字号走，所以是
 *   longest × f + 1.2f + gap ≤ INNER_WIDTH，即 f ≤ (INNER_WIDTH − gap) / (longest + 1.2)
 *
 * CJK 字形按 1.0em 估宽，标题里的 ASCII 更窄，因此这个估计只会偏保守。
 */
export function coverEntryFontSize(titles: string[]): number {
  if (!titles.length) throw new Error("WeChat cover font sizing needs at least one title");
  const longest = Math.max(...titles.map(title => [...title].length));
  const widthFit = Math.floor((INNER_WIDTH - ENTRY_NUMBER_GAP) / (longest + ENTRY_NUMBER_WIDTH_EM));
  const heightFit = Math.floor((LIST_HEIGHT - ENTRY_GAP * (titles.length - 1)) / (titles.length * ENTRY_LINE_HEIGHT));
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, widthFit, heightFit));
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
// 品牌上会细成一根发丝。比例取自原先在 36px 下量定的值，因此封面那张图一像素不变。
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
      style: { display: "flex", alignItems: "baseline", width: "100%", fontSize, lineHeight: ENTRY_LINE_HEIGHT, overflow: "hidden" },
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
        { type: "span", props: { style: { fontWeight: 700 }, children: title } },
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
      style: { display: "flex", flexDirection: "column", margin: "40px 60px", width: "89%", height: "80%" },
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

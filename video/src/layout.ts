// 竖屏画布与卡片几何。1080×1920 是视频号/抖音的原生比例，
// 版式层级与 scripts/weibo_trending_wechat_cards.ts 的图片消息卡同构：
// 平台色铺满 → 圆角浅色卡浮中间 → 卡内一列内容。
//
// 这里不用 wechat_card_layout.ts 的 cardFontSize()：那条公式是给 satori 的估算，
// 因为 satori 不测量文本、排不下就静默裁掉。Remotion 跑真 Chromium，
// 直接按行数分档更准，也不会为了迁就估算而整体压小一号。

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

/**
 * 橙边宽度 140 不是审美挑的，是从平台安全区倒推的。
 *
 * 实测视频号与 B 站的竖屏播放器都会把画面放大约 5%（左右各裁掉约 54px），
 * 而视频号/抖音右侧还压着一整条「赞/评论/收藏」操作栏，从 x≈875 一直到右边缘。
 * 正文右边界必须退到 875 以内才不被图标盖住——对称版式下即
 * `CARD_X + CARD_PADDING ≥ 210`，取 140 + 70 正好贴齐。
 *
 * 顺带的好处：裁掉 54px 之后仍有 86px 橙边可见，橙色边框感回来了；
 * 此前 70px 的橙边被裁得只剩 16px，卡片看起来像贴着屏幕边缘。
 */
export const CARD_X = 140;
export const CARD_WIDTH = CANVAS_WIDTH - CARD_X * 2;
export const CARD_Y = 250;
// 去掉底部句柄之后腾出来的高度全部给卡片：正文上限从 60 字提到 100 字，
// 十行文字需要这个余量，否则字号会被压到看不清。
export const CARD_HEIGHT = 1560;
export const CARD_RADIUS = 48;
export const CARD_PADDING = 70;

/** 卡内可用宽度，正文和问题的折行都按它算。 */
export const CARD_INNER_WIDTH = CARD_WIDTH - CARD_PADDING * 2;

export const BRAND = "Reddit 问答精选";
export const BRAND_FONT_SIZE = 46;

export const DIVIDER_COLOR = "#E8E8E8";
export const BODY_COLOR = "#343434";
export const TITLE_COLOR = "#191919";
export const MUTED_COLOR = "#9A9A9A";

function charEm(char: string): number {
  if (/\s/.test(char)) return 0.35;
  return char.codePointAt(0)! <= 0x7f ? 0.55 : 1;
}

/**
 * 最长的一个「断不开的片段」有多宽。
 *
 * CJK 每个字都能断行，所以只有连续的非空白 ASCII 才成串——`name+site@gmail.com`
 * 这种邮箱、长网址、代码标识符都属此列。浏览器不会在它中间折行，它比可用宽度长的话，
 * 折行宽度就以它为准，而不是以容器为准。
 */
// 0.55em 是 ASCII 的平均宽度，摊在整段正文上够准，摊在一个十几字符的片段上不够：
// `@` `m` `w` 都明显宽于平均，`name+site@gmail.com` 按 0.55 算是 10.45em，实测约 11em。
// 总宽估偏了只会让字号差一档，片段估偏了会让那个串被 overflowWrap 拦腰断开，
// 所以这一条单独留 8% 余量。
const RUN_SAFETY = 1.08;

function longestRunEm(text: string): number {
  let longest = 0;
  let current = 0;
  for (const char of text) {
    // 非 ASCII 或空白都是断点：前者每字可断，后者本身就是断点。
    if (/\s/.test(char) || char.codePointAt(0)! > 0x7f) {
      current = 0;
      continue;
    }
    current += charEm(char);
    if (current > longest) longest = current;
  }
  return longest;
}

/**
 * 按估算行数选字号，从大到小取第一个排得下的。
 *
 * CJK 一字约 1em，ASCII 约 0.55em；估宽偏保守只会让字小一号，
 * 而估宽偏乐观会让最后一行掉出卡片——后者是静默丢内容，不能接受。
 *
 * 除了总高度，还要求最长的不可断片段能塞进一行。少了这条，含长英文串的卡片会挑一个
 * 「按总字数算排得下」但那个串放不下的字号，于是整块文本按串的宽度折行、右侧被裁掉
 * ——同样是静默丢内容。片段长到连 min 都塞不下时这里让步，交给调用方的
 * `overflowWrap` 去断词。
 */
export function fitFontSize({
  text,
  width,
  height,
  lineHeight,
  min,
  max,
}: {
  text: string;
  width: number;
  height: number;
  lineHeight: number;
  min: number;
  max: number;
}): number {
  const widthEm = [...text].reduce((sum, char) => sum + charEm(char), 0);
  const runEm = longestRunEm(text) * RUN_SAFETY;

  for (let fontSize = max; fontSize > min; fontSize -= 1) {
    const lines = Math.ceil((widthEm * fontSize) / width);
    if (lines * fontSize * lineHeight > height) continue;
    if (runEm * fontSize > width) continue;
    return fontSize;
  }
  return min;
}

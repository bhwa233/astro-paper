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

/**
 * 按估算行数选字号，从大到小取第一个排得下的。
 *
 * CJK 一字约 1em，ASCII 约 0.55em；估宽偏保守只会让字小一号，
 * 而估宽偏乐观会让最后一行掉出卡片——后者是静默丢内容，不能接受。
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
  const widthEm = [...text].reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.35;
    return sum + (char.codePointAt(0)! <= 0x7f ? 0.55 : 1);
  }, 0);

  for (let fontSize = max; fontSize > min; fontSize -= 1) {
    const lines = Math.ceil((widthEm * fontSize) / width);
    if (lines * fontSize * lineHeight <= height) return fontSize;
  }
  return min;
}

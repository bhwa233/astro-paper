// 竖屏画布与卡片几何。1080×1920 是视频号/抖音的原生比例，
// 版式层级与 scripts/weibo_trending_wechat_cards.ts 的图片消息卡同构：
// 平台色铺满 → 圆角浅色卡浮中间 → 卡内一列内容。
//
// 这里不用 wechat_card_layout.ts 的 cardFontSize()：那条公式是给 satori 的估算，
// 因为 satori 不测量文本、排不下就静默裁掉。Remotion 跑真 Chromium，
// 直接按行数分档更准，也不会为了迁就估算而整体压小一号。

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

export const CARD_X = 70;
export const CARD_WIDTH = CANVAS_WIDTH - CARD_X * 2;
export const CARD_Y = 250;
// 去掉底部句柄之后腾出来的高度全部给卡片：正文上限从 60 字提到 100 字，
// 十行文字需要这个余量，否则字号会被压到看不清。
export const CARD_HEIGHT = 1560;
export const CARD_RADIUS = 48;
export const CARD_PADDING = 72;

/** 卡内可用宽度，正文和问题的折行都按它算。 */
export const CARD_INNER_WIDTH = CARD_WIDTH - CARD_PADDING * 2;

export const BRAND = "Reddit 问答精选";
export const BRAND_FONT_SIZE = 46;

export const DIVIDER_COLOR = "#E8E8E8";
export const BODY_COLOR = "#343434";
export const TITLE_COLOR = "#191919";
export const MUTED_COLOR = "#9A9A9A";

/** 卡片淡入 + 上移的时长，两端各一次。 */
export const FADE_FRAMES = 9;

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

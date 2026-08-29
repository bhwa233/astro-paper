// 内容卡：accent 序号 + 倒计时数字 + 进度条同一行 / 分隔线 / 正文。
//
// 没有标题：封面已经把问题抛出来了，卡片只是它的第 N 条回答，再起一个小标题只会
// 抢走正文的高度。序号也只出现一次——早期版本卡内一个大号序号、右下角又来一次
// 「03 / 10」，同一个信息占两个位置。
//
// 倒计时数字原先在卡片右下角（y≈1730），而平台的评论气泡和「内容由 AI 生成」提示
// 从 y≈1570 就开始压，实测那个数字已经和时间码挤在一起。现在它挪到顶部这一行，
// 与进度条同处安全区；卡片下半部分只剩留白，被平台盖住也不丢信息。
// 腾出来的 80px 底部行全部还给正文，字号因此从 68 回到上限 72。
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { PLATFORM_THEMES } from "../../src/utils/platformTheme.ts";
import type { VideoCard } from "./contract.ts";
import { Frame } from "./Frame.tsx";
import { BODY_COLOR, CARD_INNER_WIDTH, DIVIDER_COLOR, fitFontSize, MUTED_COLOR } from "./layout.ts";
import { FPS, TICK_LEAD_SECONDS } from "./timing.ts";

const THEME = PLATFORM_THEMES.reddit;
const BODY_LINE_HEIGHT = 1.6;
const BAR_HEIGHT = 10;

// 正文区的可用高度 = 卡片高度 1560 − 1px 描边 × 2 − 上下 padding 140 − 序号行 96 − 分隔线及其外边距 30。
// 字号往这个高度上顶，而不是留一半空白——竖屏画面里，字小就等于没人看得清。
// 这里曾经写死 1000，比实际可用值少了近 300px，白白把字号压小一档。
const BODY_AREA_HEIGHT = 1292;
const BODY_MIN_FONT_SIZE = 44;
const BODY_MAX_FONT_SIZE = 72;
const COUNTDOWN_WIDTH = 48;

export const TopicCard: React.FC<{ durationInFrames: number; card: VideoCard; total: number }> = ({ durationInFrames, card, total }) => {
  const frame = useCurrentFrame();
  const remaining = (durationInFrames - frame) / FPS;
  const isCountingDown = remaining <= TICK_LEAD_SECONDS;
  // 数字取上整：剩 2.4s 显示 3，剩 1.0s 显示 1，与整秒响的提示音对得上。
  const countdownDigit = Math.max(1, Math.ceil(remaining));

  const progress = interpolate(frame, [0, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const bodyFontSize = fitFontSize({
    text: card.body,
    width: CARD_INNER_WIDTH,
    height: BODY_AREA_HEIGHT,
    lineHeight: BODY_LINE_HEIGHT,
    min: BODY_MIN_FONT_SIZE,
    max: BODY_MAX_FONT_SIZE,
  });

  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, height: 96 }}>
        <div style={{ display: "flex", alignItems: "baseline", flexShrink: 0 }}>
          <div style={{ fontSize: 88, lineHeight: 1, fontWeight: 700, color: THEME.accent }}>{String(card.index).padStart(2, "0")}</div>
          <div style={{ marginLeft: 12, fontSize: 32, color: MUTED_COLOR }}>/ {String(total).padStart(2, "0")}</div>
        </div>
        <div style={{ flexGrow: 1, marginLeft: 40, height: BAR_HEIGHT, borderRadius: BAR_HEIGHT, background: DIVIDER_COLOR, overflow: "hidden" }}>
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              borderRadius: BAR_HEIGHT,
              background: isCountingDown ? THEME.accent : THEME.bg,
            }}
          />
        </div>
        {/* 宽度写死而不是靠内容撑开：数字从 3 变到 1 时进度条不该跟着抖一下。 */}
        <div
          style={{
            width: COUNTDOWN_WIDTH,
            marginLeft: 24,
            flexShrink: 0,
            textAlign: "right",
            fontSize: 72,
            lineHeight: 1,
            fontWeight: 700,
            color: THEME.accent,
            opacity: isCountingDown ? 0.85 : 0,
          }}
        >
          {countdownDigit}
        </div>
      </div>

      <div style={{ width: "100%", height: 2, background: DIVIDER_COLOR, margin: "28px 0 0", flexShrink: 0 }} />

      {/* 正文必须裹一层 div，不能直接当这个横向 flex 的孩子：裸文本会变成匿名 flex item，
          而横向 flex item 的 min-width 默认是 auto，即不会窄于 min-content。正文里只要有一个
          断不开的长英文串（邮箱、网址），min-content 就是那个串的宽度，文本盒会被撑到比卡片还宽，
          每一行都按撑开后的宽度折行，右边多出来的部分被 Frame 的 overflow:hidden 裁掉。
          `minWidth: 0` 是解药本身——只写 width:100% 不管用，那只改首选宽度，min-width 照样兜底到
          min-content。 */}
      <div style={{ flexGrow: 1, display: "flex", alignItems: "center" }}>
        <div style={{ width: "100%", minWidth: 0, fontSize: bodyFontSize, lineHeight: BODY_LINE_HEIGHT, color: BODY_COLOR, overflowWrap: "anywhere" }}>
          {card.body}
        </div>
      </div>
    </Frame>
  );
};

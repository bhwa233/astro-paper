// 内容卡：accent 序号 + 倒计时进度条同一行 / 分隔线 / 正文 / 结尾三秒的大数字。
//
// 没有标题：封面已经把问题抛出来了，卡片只是它的第 N 条回答，再起一个小标题只会
// 抢走正文的高度。序号也只出现一次——早期版本卡内一个大号序号、右下角又来一次
// 「03 / 10」，同一个信息占两个位置。
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

// 正文区的可用高度：卡内高度扣掉序号行、分隔线与底部倒计时行。
// 字号往这个高度上顶，而不是留一半空白——竖屏画面里，字小就等于没人看得清。
const BODY_AREA_HEIGHT = 1000;
const BODY_MIN_FONT_SIZE = 44;
const BODY_MAX_FONT_SIZE = 72;

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
    <Frame durationInFrames={durationInFrames}>
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
      </div>

      <div style={{ width: "100%", height: 2, background: DIVIDER_COLOR, margin: "28px 0 0", flexShrink: 0 }} />

      <div style={{ flexGrow: 1, display: "flex", alignItems: "center", fontSize: bodyFontSize, lineHeight: BODY_LINE_HEIGHT, color: BODY_COLOR }}>
        {card.body}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", flexShrink: 0, height: 80, fontSize: 72, lineHeight: 1, fontWeight: 700, color: THEME.accent, opacity: isCountingDown ? 0.85 : 0 }}>
        {countdownDigit}
      </div>
    </Frame>
  );
};

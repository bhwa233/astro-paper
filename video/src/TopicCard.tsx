// 内容卡：accent 序号 + 短标题 / 分隔线 / 倒计时进度条 / 正文 / 底部计数。
// 与公众号图片消息卡（weibo_trending_wechat_cards.ts 的 topicTree）同构，
// 多出来的只有倒计时——那是视频才有的、告诉观众「还有多久翻页」的东西。
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { PLATFORM_THEMES } from "../../src/utils/platformTheme.ts";
import type { VideoCard } from "./contract.ts";
import { Frame } from "./Frame.tsx";
import { BODY_COLOR, CARD_INNER_WIDTH, DIVIDER_COLOR, fitFontSize, MUTED_COLOR, TITLE_COLOR } from "./layout.ts";
import { FPS, TICK_LEAD_SECONDS } from "./timing.ts";

const THEME = PLATFORM_THEMES.reddit;
const RANK_WIDTH = 150;
const TITLE_LINE_HEIGHT = 1.2;
const BODY_LINE_HEIGHT = 1.6;
const BAR_HEIGHT = 10;

// 正文区的可用高度：卡内高度扣掉标题行、分隔线、进度条与底部计数行。
// 字号往这个高度上顶，而不是留一半空白——竖屏画面里，字小就等于没人看得清。
const BODY_AREA_HEIGHT = 900;
const BODY_MIN_FONT_SIZE = 48;
const BODY_MAX_FONT_SIZE = 76;

export const TopicCard: React.FC<{ date: string; durationInFrames: number; card: VideoCard; total: number }> = ({ date, durationInFrames, card, total }) => {
  const frame = useCurrentFrame();
  const remaining = (durationInFrames - frame) / FPS;
  const isCountingDown = remaining <= TICK_LEAD_SECONDS;
  // 数字取上整：剩 2.4s 显示 3，剩 1.0s 显示 1，与整秒响的提示音对得上。
  const countdownDigit = Math.max(1, Math.ceil(remaining));

  const progress = interpolate(frame, [0, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const titleFontSize = fitFontSize({
    text: card.title,
    width: CARD_INNER_WIDTH - RANK_WIDTH,
    height: 2 * 68 * TITLE_LINE_HEIGHT,
    lineHeight: TITLE_LINE_HEIGHT,
    min: 48,
    max: 68,
  });
  const bodyFontSize = fitFontSize({
    text: card.body,
    width: CARD_INNER_WIDTH,
    height: BODY_AREA_HEIGHT,
    lineHeight: BODY_LINE_HEIGHT,
    min: BODY_MIN_FONT_SIZE,
    max: BODY_MAX_FONT_SIZE,
  });

  return (
    <Frame date={date} durationInFrames={durationInFrames}>
      <div style={{ display: "flex", alignItems: "flex-start", flexShrink: 0 }}>
        <div style={{ width: RANK_WIDTH, flexShrink: 0, fontSize: 96, lineHeight: 1, fontWeight: 700, color: THEME.accent }}>
          {String(card.index).padStart(2, "0")}
        </div>
        <div style={{ flex: 1, fontSize: titleFontSize, lineHeight: TITLE_LINE_HEIGHT, fontWeight: 700, color: TITLE_COLOR }}>{card.title}</div>
      </div>

      <div style={{ width: "100%", height: 2, background: DIVIDER_COLOR, margin: "36px 0 20px", flexShrink: 0 }} />

      <div style={{ width: "100%", height: BAR_HEIGHT, borderRadius: BAR_HEIGHT, background: DIVIDER_COLOR, flexShrink: 0, overflow: "hidden" }}>
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: BAR_HEIGHT,
            background: isCountingDown ? THEME.accent : THEME.bg,
          }}
        />
      </div>

      <div style={{ flexGrow: 1, display: "flex", alignItems: "center", fontSize: bodyFontSize, lineHeight: BODY_LINE_HEIGHT, color: BODY_COLOR }}>
        {card.body}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0, height: 96 }}>
        <div style={{ fontSize: 80, lineHeight: 1, fontWeight: 700, color: THEME.accent, opacity: isCountingDown ? 0.85 : 0 }}>{countdownDigit}</div>
        <div style={{ fontSize: 32, color: MUTED_COLOR }}>
          {String(card.index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </div>
    </Frame>
  );
};

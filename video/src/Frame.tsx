// 每张卡共用的外壳：平台色铺满 → 顶部品牌行 → 圆角浅色卡 → 底部句柄。
// 卡片内容由调用方填。淡入与上移也放在这里，两种卡片的出场因此完全一致。
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { PLATFORM_THEMES } from "../../src/utils/platformTheme.ts";
import { CircledBrand } from "./CircledBrand.tsx";
import { BRAND, BRAND_FONT_SIZE, CARD_HEIGHT, CARD_PADDING, CARD_RADIUS, CARD_WIDTH, CARD_X, CARD_Y, FADE_FRAMES, HANDLE } from "./layout.ts";

const THEME = PLATFORM_THEMES.reddit;

export const Frame: React.FC<{ date: string; durationInFrames: number; children: React.ReactNode }> = ({ date, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  // 两端各淡一次。用 clamp 而不是 extrapolate 默认值，否则中间段会继续外推。
  const opacity = interpolate(frame, [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(frame, [0, FADE_FRAMES], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: THEME.bg, fontFamily: "Noto Sans SC" }}>
      <AbsoluteFill style={{ opacity, transform: `translateY(${lift}px)` }}>
        <div
          style={{
            position: "absolute",
            left: CARD_X,
            top: 96,
            width: CARD_WIDTH,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#FFFFFF",
          }}
        >
          <CircledBrand brand={BRAND} color="#FFFFFF" fontSize={BRAND_FONT_SIZE} />
          <div style={{ fontSize: 34, opacity: 0.82 }}>{date.replaceAll("-", " / ")}</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: CARD_X,
            top: CARD_Y,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            borderRadius: CARD_RADIUS,
            background: THEME.card,
            padding: CARD_PADDING,
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {children}
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            top: CARD_Y + CARD_HEIGHT + 56,
            width: "100%",
            textAlign: "center",
            fontSize: 30,
            color: "#FFFFFF",
            opacity: 0.62,
            letterSpacing: 1,
          }}
        >
          {HANDLE}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

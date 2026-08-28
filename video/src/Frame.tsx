// 每张卡共用的外壳：平台色铺满 → 顶部品牌行 → 圆角浅色卡。
// 卡片内容由调用方填。淡入与上移也放在这里，两种卡片的出场因此完全一致。
//
// 品牌行右侧曾经有日期、卡片下方曾经有站点句柄，都已去掉：Release 已按归档日分组、
// 封面就是单支视频内容，日期是冗余；而底部那行链接在竖屏里离安全区太近，谁都不会去读。
// 省下的高度全部还给卡片。
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { PLATFORM_THEMES } from "../../src/utils/platformTheme.ts";
import { CircledBrand } from "./CircledBrand.tsx";
import { BRAND, BRAND_FONT_SIZE, CARD_HEIGHT, CARD_PADDING, CARD_RADIUS, CARD_WIDTH, CARD_X, CARD_Y, FADE_FRAMES } from "./layout.ts";

const THEME = PLATFORM_THEMES.reddit;

/**
 * `entrance: "cut"` 让第 0 帧就是完整画面。
 *
 * 封面用它：视频的第一帧要么是问题，要么是一片橙底——而观众划到这支视频时看到的
 * 恰恰就是这一帧，拿它做淡入等于把开场让给一张空卡片。后面的回答卡没有这个问题，
 * 照旧淡入淡出。
 */
export const Frame: React.FC<{ durationInFrames: number; entrance?: "fade" | "cut"; children: React.ReactNode }> = ({ durationInFrames, entrance = "fade", children }) => {
  const frame = useCurrentFrame();
  // 两端各淡一次。用 clamp 而不是 extrapolate 默认值，否则中间段会继续外推。
  const opacity =
    entrance === "cut"
      ? interpolate(frame, [durationInFrames - FADE_FRAMES, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : interpolate(frame, [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lift = entrance === "cut" ? 0 : interpolate(frame, [0, FADE_FRAMES], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: THEME.bg, fontFamily: "Noto Sans SC" }}>
      <AbsoluteFill style={{ opacity, transform: `translateY(${lift}px)` }}>
        <div style={{ position: "absolute", left: CARD_X, top: 96, width: CARD_WIDTH, display: "flex", color: "#FFFFFF" }}>
          <CircledBrand brand={BRAND} color="#FFFFFF" fontSize={BRAND_FONT_SIZE} />
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
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

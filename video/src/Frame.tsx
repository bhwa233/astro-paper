// 每张纸共用的外壳。平台底色和品牌在 Video.tsx 固定；这里的新纸只负责覆盖旧纸。
//
// 品牌行右侧曾经有日期、卡片下方曾经有站点句柄，都已去掉：Release 已按归档日分组、
// 封面就是单支视频内容，日期是冗余；而底部那行链接在竖屏里离安全区太近，谁都不会去读。
// 省下的高度全部还给卡片。
import React from "react";
import { PLATFORM_THEMES } from "../../src/utils/platformTheme.ts";
import { CARD_HEIGHT, CARD_PADDING, CARD_RADIUS, CARD_WIDTH, CARD_X, CARD_Y } from "./layout.ts";
import { PaperSheetMotion } from "./PaperSheetMotion.tsx";

const THEME = PLATFORM_THEMES.reddit;

/**
 * `entrance: "cut"` 让第 0 帧就是完整纸张。
 *
 * 封面用它：视频的第一帧要么是问题，要么是一片橙底——而观众划到这支视频时看到的
 * 恰恰就是这一帧，拿它做淡入等于把开场让给一张空卡片。后面的回答卡没有这个问题，
 * 从底部覆盖上来。
 */
export const Frame: React.FC<{
  entrance?: "cover" | "cut";
  children: React.ReactNode;
}> = ({ entrance = "cover", children }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: CARD_X,
        top: CARD_Y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: CARD_RADIUS,
      }}
    >
      <PaperSheetMotion entrance={entrance}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: CARD_RADIUS,
            border: "1px solid rgba(80, 24, 0, 0.06)",
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
      </PaperSheetMotion>
    </div>
  );
};

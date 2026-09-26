import React from "react";
import { paperBoxShadow, SETTLED_PAPER_SHADOW } from "../PaperSheetMotion.tsx";

export type StaticCardFrameProps = {
  background: string;
  surface: string;
  fontFamily: string;
  children: React.ReactNode;
};

/** Shared 1080x1440 shell for static social-image cards. */
export const StaticCardFrame: React.FC<StaticCardFrameProps> = ({ background, surface, fontFamily, children }) => (
  <div
    style={{
      width: 1080,
      height: 1440,
      background,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: `"${fontFamily}"`,
    }}
  >
    <div
      style={{
        width: 972,
        height: 1296,
        background: surface,
        borderRadius: 36,
        // 与视频纸卡落位后同一套暖褐阴影：灰黑阴影压在平台橙底上会发脏。
        boxShadow: paperBoxShadow(SETTLED_PAPER_SHADOW),
        padding: 54,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  </div>
);

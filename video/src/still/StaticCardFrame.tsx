import React from "react";

export type StaticCardFrameProps = {
  background: string;
  surface: string;
  children: React.ReactNode;
};

/** Shared 1080x1440 shell for static social-image cards. */
export const StaticCardFrame: React.FC<StaticCardFrameProps> = ({ background, surface, children }) => (
  <div
    style={{
      width: 1080,
      height: 1440,
      background,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: '"Noto Sans SC"',
    }}
  >
    <div
      style={{
        width: 972,
        height: 1296,
        background: surface,
        borderRadius: 36,
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

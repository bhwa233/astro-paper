import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PAPER_OVERLAY_FRAMES } from "./timing.ts";

type PaperShadow = { contactY: number; contactBlur: number; x: number; y: number; blur: number; alpha: number };

/** 纸卡落位后的阴影。视频翻页时从展开状态收回到这里；静态图片消息卡直接用这一帧。 */
export const SETTLED_PAPER_SHADOW: PaperShadow = { contactY: 4, contactBlur: 12, x: 0, y: 24, blur: 56, alpha: 0.2 };

export function paperBoxShadow({ contactY, contactBlur, x, y, blur, alpha }: PaperShadow): string {
  return `0 ${contactY}px ${contactBlur}px rgba(80, 24, 0, 0.12), ${x}px ${y}px ${blur}px rgba(80, 24, 0, ${alpha})`;
}

type PaperSheetMotionProps = {
  children: React.ReactNode;
  entrance?: "cover" | "cut";
};

/**
 * Remotion's stock slide transition pushes the old scene away, while this format
 * needs the old sheet to stay put and the new printed sheet to cover it. Keep that
 * one project-specific distinction here and reuse Remotion's frame-driven spring.
 */
export const PaperSheetMotion: React.FC<PaperSheetMotionProps> = ({ children, entrance = "cover" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entering =
    entrance === "cut"
      ? 1
      : spring({
          frame,
          fps,
          durationInFrames: PAPER_OVERLAY_FRAMES,
          config: { damping: 24, stiffness: 180, mass: 0.9 },
        });
  const settled = Math.min(1, Math.max(0, entering));
  const translateX = interpolate(entering, [0, 1], [1040, 0]);
  const translateY = interpolate(entering, [0, 1], [30, 0]);
  const rotation = interpolate(entering, [0, 1], [1.5, 0]);
  const scale = interpolate(entering, [0, 1], [0.992, 1]);
  // 窄的贴边阴影给纸卡厚度，宽的暖色阴影表现悬浮距离；翻页时展开，落位后收回。
  const shadow = paperBoxShadow({
    contactY: interpolate(settled, [0, 1], [8, SETTLED_PAPER_SHADOW.contactY]),
    contactBlur: interpolate(settled, [0, 1], [20, SETTLED_PAPER_SHADOW.contactBlur]),
    x: interpolate(settled, [0, 1], [-34, SETTLED_PAPER_SHADOW.x]),
    y: interpolate(settled, [0, 1], [8, SETTLED_PAPER_SHADOW.y]),
    blur: interpolate(settled, [0, 1], [76, SETTLED_PAPER_SHADOW.blur]),
    alpha: interpolate(settled, [0, 1], [0.28, SETTLED_PAPER_SHADOW.alpha]),
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${scale})`,
        transformOrigin: "100% 50%",
        boxShadow: shadow,
      }}
    >
      {children}
    </div>
  );
};

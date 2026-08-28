import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PAPER_OVERLAY_FRAMES } from "./timing.ts";

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
  const shadowX = interpolate(settled, [0, 1], [-34, 0]);
  const shadowY = interpolate(settled, [0, 1], [8, 18]);
  const shadowBlur = interpolate(settled, [0, 1], [68, 46]);
  const shadowAlpha = interpolate(settled, [0, 1], [0.34, 0.18]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${scale})`,
        transformOrigin: "100% 50%",
        boxShadow: `${shadowX}px ${shadowY}px ${shadowBlur}px rgba(80, 24, 0, ${shadowAlpha})`,
      }}
    >
      {children}
    </div>
  );
};

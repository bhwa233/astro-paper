// Composition 注册。总帧数由 video.json 的卡片字数推出，因此必须走 calculateMetadata——
// 写死一个 durationInFrames 会让长卡被截掉，或者片尾留一段黑。
import React from "react";
import { Composition } from "remotion";
import { parseVideoManifest, type VideoManifest } from "./contract.ts";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./layout.ts";
import { FPS, totalFrames } from "./timing.ts";
import { RedditLifeVideo } from "./Video.tsx";

export const COMPOSITION_ID = "RedditLifeVideo";

// Studio 里没有 --props 时用的占位内容，只为让版式可预览。
const PLACEHOLDER: VideoManifest = {
  version: 1,
  archiveDate: "2026-08-27",
  cards: Array.from({ length: 10 }, (_, index) => ({
    index: index + 1,
    title: `占位标题 ${index + 1}`,
    body: "这是一段占位正文，用来预览版式在不同字数下的表现，真实内容由 video.json 提供。",
    sourceIndex: index + 1,
    sourceQuestion: "占位问题",
  })),
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={RedditLifeVideo}
    width={CANVAS_WIDTH}
    height={CANVAS_HEIGHT}
    fps={FPS}
    durationInFrames={1}
    defaultProps={{ manifest: PLACEHOLDER }}
    calculateMetadata={({ props }) => {
      const manifest = parseVideoManifest(props.manifest);
      return { props: { manifest }, durationInFrames: totalFrames(manifest.cards) };
    }}
  />
);

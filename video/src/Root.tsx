// Composition 注册。总帧数由 video.json 的卡片字数推出，因此必须走 calculateMetadata——
// 写死一个 durationInFrames 会让长卡被截掉，或者片尾留一段黑。
import React from "react";
import { Composition } from "remotion";
import { parseVideoManifest, type VideoManifest } from "./contract.ts";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./layout.ts";
import { StaticCardsRoot } from "./still/StaticCardsRoot.tsx";
import { FPS, totalFrames } from "./timing.ts";
import { RedditLifeVideo } from "./Video.tsx";

export const COMPOSITION_ID = "RedditLifeVideo";

// Studio 里没有 --props 时用的占位内容，只为让版式可预览。
// 字数刻意贴近正文上限，好在预览里看到最坏情况的排版。
const PLACEHOLDER: VideoManifest = {
  version: 2,
  archiveDate: "2026-08-27",
  question: "医护人员目睹患者遭遇后，果断放弃了哪些看似「正常」的生活习惯？",
  cards: Array.from({ length: 10 }, (_, index) => ({
    index: index + 1,
    body: `这是第 ${index + 1} 条占位回答，用来预览版式在接近字数上限时的表现，真实内容由 video.json 提供，长短不一才是常态。`,
    sourceIndex: index + 1,
    verbatim: false,
  })),
};

export const RemotionRoot: React.FC = () => (
  <>
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
    <StaticCardsRoot />
  </>
);

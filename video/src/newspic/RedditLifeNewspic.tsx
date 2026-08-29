import React from "react";
import { PLATFORM_THEMES } from "../../../src/utils/platformTheme.ts";
import type { VideoManifest } from "../contract.ts";
import { FONT_FAMILY, useSubsetFont } from "../font.ts";
import { fitFontSize } from "../layout.ts";
import { fitBalancedChineseTitle } from "../still/balancedTitle.ts";
import { StaticCardFrame } from "../still/StaticCardFrame.tsx";

const THEME = PLATFORM_THEMES.reddit;
const INNER_WIDTH = 864;
const CONTENT_TOP_GAP = 72;

export type RedditLifeNewspicProps = { manifest: VideoManifest; cardIndex: number };

const Masthead: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
    <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color: THEME.accent }}>REDDIT</div>
    <div style={{ marginTop: 10, fontSize: 46, lineHeight: 1, fontWeight: 700, color: "#191919" }}>精选问答</div>
    <div style={{ marginTop: 18, width: 64, height: 6, background: THEME.accent }} />
  </div>
);

const Cover: React.FC<{ question: string }> = ({ question }) => {
  const title = fitBalancedChineseTitle({ text: question, width: INNER_WIDTH, height: 620, lineHeight: 1.24, min: 56, max: 92 });
  return (
    <StaticCardFrame background={THEME.bg} surface={THEME.card}>
      <Masthead />
      <div style={{ marginTop: CONTENT_TOP_GAP, width: INNER_WIDTH, display: "flex", flexDirection: "column", fontSize: title.fontSize, lineHeight: 1.24, fontWeight: 700, color: "#191919" }}>
        {title.lines.map((line, index) => <div key={`${index}:${line}`} style={{ display: "flex" }}>{line}</div>)}
      </div>
    </StaticCardFrame>
  );
};

const Answer: React.FC<{ body: string; index: number; total: number }> = ({ body, index, total }) => {
  const fontSize = fitFontSize({ text: body, width: INNER_WIDTH, height: 900, lineHeight: 1.52, min: 38, max: 62 });
  return (
    <StaticCardFrame background={THEME.bg} surface={THEME.card}>
      <Masthead />
      {/* 这里的父级是纵向 flex，宽度由 stretch 给定，撑不宽；但断不开的长英文串仍会溢出这一行
          被裁掉。`fitFontSize` 已经会为这种串压字号，`overflowWrap` 只兜住连最小字号都塞不下的。 */}
      <div style={{ marginTop: CONTENT_TOP_GAP, fontSize, lineHeight: 1.52, color: "#343434", overflowWrap: "anywhere" }}>{body}</div>
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", flexShrink: 0, fontSize: 28, lineHeight: 1, color: "#777777" }}>{String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}</div>
    </StaticCardFrame>
  );
};

export const RedditLifeNewspic: React.FC<RedditLifeNewspicProps> = ({ manifest, cardIndex }) => {
  const { question, cards } = manifest;
  useSubsetFont(`REDDIT精选问答${question}${cards.map(card => card.body).join("")}0123456789/`);
  if (cardIndex === 0) return <Cover question={question} />;
  const card = cards[cardIndex - 1];
  if (!card) throw new Error(`missing Reddit image answer ${cardIndex}`);
  return <Answer body={card.body} index={card.index} total={cards.length} />;
};

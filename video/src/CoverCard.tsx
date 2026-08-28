// 封面卡：accent 短横 + 十条编号标题。信息层级照搬 wechatCoverTree，
// 只是竖屏有更多高度，条目之间可以给足呼吸。
import React from "react";
import { PLATFORM_THEMES } from "../../src/utils/platformTheme.ts";
import type { VideoCard } from "./contract.ts";
import { Frame } from "./Frame.tsx";
import { CARD_INNER_WIDTH, fitFontSize, TITLE_COLOR } from "./layout.ts";

const THEME = PLATFORM_THEMES.reddit;
const ENTRY_LINE_HEIGHT = 1.25;
const ENTRY_GAP = 42;
const NUMBER_WIDTH = 112;
const ENTRY_MIN_FONT_SIZE = 40;
const ENTRY_MAX_FONT_SIZE = 58;

export const CoverCard: React.FC<{ date: string; durationInFrames: number; cards: VideoCard[] }> = ({ date, durationInFrames, cards }) => {
  // 按最长的一条定字号，十条统一——逐条自适应会让列表看起来像没对齐的表格。
  // 高度按「最长的一条允许折两行」给：竖屏的宽度装不下十来个字的长标题，
  // 但只要不是每条都折行，列表整体仍然读得出是一列。
  const longest = cards.reduce((longest, card) => (card.title.length > longest.length ? card.title : longest), "");
  const fontSize = fitFontSize({
    text: longest,
    width: CARD_INNER_WIDTH - NUMBER_WIDTH,
    height: 2 * ENTRY_MAX_FONT_SIZE * ENTRY_LINE_HEIGHT,
    lineHeight: ENTRY_LINE_HEIGHT,
    min: ENTRY_MIN_FONT_SIZE,
    max: ENTRY_MAX_FONT_SIZE,
  });

  return (
    <Frame date={date} durationInFrames={durationInFrames}>
      <div style={{ width: 96, height: 8, background: THEME.accent, marginBottom: 56, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: ENTRY_GAP }}>
        {cards.map(card => (
          <div key={card.index} style={{ display: "flex", alignItems: "flex-start", fontSize, lineHeight: ENTRY_LINE_HEIGHT }}>
            <div style={{ width: NUMBER_WIDTH, flexShrink: 0, color: THEME.accent, fontWeight: 700 }}>{String(card.index).padStart(2, "0")}</div>
            <div style={{ flex: 1, fontWeight: 700, color: TITLE_COLOR }}>{card.title}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
};

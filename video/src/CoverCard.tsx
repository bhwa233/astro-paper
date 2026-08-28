// 封面卡：accent 短横 + 「N 个回答」同一行，其下是问题全文。
//
// 早期版本这里列的是十条卡片的标题，等于把全片剧透一遍，观众看完封面就没有往下划的理由。
// 现在封面只抛出问题，答案留给后面的卡片。
//
// 「N 个回答」原先钉在卡片底部，落在平台评论气泡的覆盖区里（y≈1570 往下）。
// 它和顶部那根短横都是次要信息，合并到同一行既躲开了遮挡，也把整块高度让给问题。
import React from "react";
import { PLATFORM_THEMES } from "../../src/utils/platformTheme.ts";
import { Frame } from "./Frame.tsx";
import { CARD_INNER_WIDTH, fitFontSize, MUTED_COLOR, TITLE_COLOR } from "./layout.ts";

const THEME = PLATFORM_THEMES.reddit;
const QUESTION_LINE_HEIGHT = 1.35;
// 问题实测最长 34 字。上限 84 让短问题占满画面，下限 48 保证最长的那个仍然读得清。
const QUESTION_MIN_FONT_SIZE = 48;
const QUESTION_MAX_FONT_SIZE = 84;
const QUESTION_AREA_HEIGHT = 980;

export const CoverCard: React.FC<{ question: string; answerCount: number }> = ({ question, answerCount }) => {
  const fontSize = fitFontSize({
    text: question,
    width: CARD_INNER_WIDTH,
    height: QUESTION_AREA_HEIGHT,
    lineHeight: QUESTION_LINE_HEIGHT,
    min: QUESTION_MIN_FONT_SIZE,
    max: QUESTION_MAX_FONT_SIZE,
  });

  return (
    <Frame entrance="cut">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ width: 96, height: 8, background: THEME.accent }} />
        <div style={{ fontSize: 34, color: MUTED_COLOR }}>{answerCount} 个回答</div>
      </div>
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          fontSize,
          lineHeight: QUESTION_LINE_HEIGHT,
          fontWeight: 700,
          color: TITLE_COLOR,
        }}
      >
        {question}
      </div>
    </Frame>
  );
};

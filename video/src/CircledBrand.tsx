// 笔圈栏目名的 React 版：两道错开角度的椭圆描边贴着文字盒子撑开。
// 与 scripts/wechat_cover_layout.ts 的 satori 版是同一套几何，比例常量共用
// src/utils/platformTheme.ts 的 BRAND_CIRCLE，两边不会各调各的。
//
// 椭圆用负 inset 贴着文字自己撑开，而不是写死宽度：品牌名换成几个字都不会算错。
// 外层必须 alignSelf: flex-start，否则它在 flex 列里被拉伸到满宽，圈会横跨整行。
import React from "react";
import { BRAND_CIRCLE } from "../../src/utils/platformTheme.ts";

function ellipse(color: string, fontSize: number, border: number, grow: number, rotate: number, opacity: number): React.CSSProperties {
  return {
    position: "absolute",
    top: -Math.round(fontSize * BRAND_CIRCLE.insetTopEm) - grow,
    bottom: -Math.round(fontSize * BRAND_CIRCLE.insetBottomEm) - grow,
    left: -Math.round(fontSize * BRAND_CIRCLE.insetXEm) - grow,
    right: -Math.round(fontSize * BRAND_CIRCLE.insetXEm) - grow,
    border: `${border}px solid ${color}`,
    borderRadius: "50%",
    transform: `rotate(${rotate}deg)`,
    opacity,
  };
}

export const CircledBrand: React.FC<{ brand: string; color: string; fontSize: number }> = ({ brand, color, fontSize }) => {
  const outerBorder = Math.round(fontSize * BRAND_CIRCLE.outerBorderEm);
  return (
    <div style={{ position: "relative", alignSelf: "flex-start", fontSize, fontWeight: 700, lineHeight: 1.1 }}>
      <div style={ellipse(color, fontSize, outerBorder, outerBorder, BRAND_CIRCLE.outerRotateDeg, 1)} />
      <div style={ellipse(color, fontSize, Math.round(fontSize * BRAND_CIRCLE.innerBorderEm), 0, BRAND_CIRCLE.innerRotateDeg, BRAND_CIRCLE.innerOpacity)} />
      <div>{brand}</div>
    </div>
  );
};

// 卡片时长。Root.tsx 用它算 composition 总帧数，Video.tsx 用同一份算每张卡的起点，
// 渲染脚本也要它来预估时长——三处必须同源，否则序列会错位。
import type { VideoCard } from "./contract.ts";

export const FPS = 30;

/** 封面只放一个问题，读完就够，不按字数算。 */
export const COVER_SECONDS = 6;

// 没有旁白，时长只能由「读完这几个字要多久」决定。
// 1.5s 是识别卡片切换、眼睛落到正文上的固定开销，之后按字数线性加。
// 0.15s/字 约合每秒 6.7 字，接近中文默读速度。
const BASE_SECONDS = 1.5;
const SECONDS_PER_CHARACTER = 0.15;
// 下限 6s 不只是为了读得完：倒计时最后 3 秒要响三声提示音，太短会挤到卡片刚出现的瞬间。
const MIN_SECONDS = 6;
// 上限对应 100 字的正文上限（1.5 + 100 × 0.15 = 16.5）。留 17 是给上限本身一点余量，
// 而不是让最长的那张卡正好卡在公式的拐点上。
const MAX_SECONDS = 17;

/** 提示音在卡片结束前几秒开始逐秒响。 */
export const TICK_LEAD_SECONDS = 3;

export function cardSeconds(card: VideoCard): number {
  const raw = BASE_SECONDS + [...card.body].length * SECONDS_PER_CHARACTER;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, raw));
}

export function cardFrames(card: VideoCard): number {
  return Math.round(cardSeconds(card) * FPS);
}

export const COVER_FRAMES = COVER_SECONDS * FPS;

/** 每张卡的起始帧与长度，封面在前。 */
export function timeline(cards: VideoCard[]): { from: number; durationInFrames: number }[] {
  const segments: { from: number; durationInFrames: number }[] = [{ from: 0, durationInFrames: COVER_FRAMES }];
  let cursor = COVER_FRAMES;
  for (const card of cards) {
    const durationInFrames = cardFrames(card);
    segments.push({ from: cursor, durationInFrames });
    cursor += durationInFrames;
  }
  return segments;
}

export function totalFrames(cards: VideoCard[]): number {
  const segments = timeline(cards);
  const last = segments[segments.length - 1]!;
  return last.from + last.durationInFrames;
}

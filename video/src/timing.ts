// 卡片时长。Root.tsx 用它算 composition 总帧数，Video.tsx 用同一份算每张卡的起点，
// 渲染脚本也要它来预估时长——三处必须同源，否则序列会错位。
import type { VideoCard } from "./contract.ts";

export const FPS = 30;

// 整体节奏的唯一旋钮。下面那些秒数描述的是「读完要多久」这套配比，PACE 描述的是
// 成片实际比它快多少。2026-08-29 试看嫌拖，统一提速到八成；配比不动，因为慢的是全片不是某一张。
const PACE = 0.8;

/** 封面只放一个问题，读完就够，不按字数算。 */
export const COVER_SECONDS = 4 * PACE;

// 没有旁白，时长只能由「读完这几个字要多久」决定。
// 0.5s 是硬切之后眼睛落位的最小开销，之后按字数线性加。
// 0.13s/字 约合每秒 7.7 字，落在中文默读速度区间内偏快的一侧——卡片两端的淡入淡出
// 各只有 0.3s，观众真正能读的时间接近整张卡的时长。
const BASE_SECONDS = 0.5;
const SECONDS_PER_CHARACTER = 0.13;
// 下限管的是「短回答别一闪而过」——实测归档里有短到 5 字的回答。
// 写 5 是为了乘完 PACE 之后落在 4s 整：调 PACE 的话这个数要跟着改，才守得住 4s 这条线。
// 原来的 6s 下限还兼着「别让提示音挤到卡片刚出现的瞬间」，降到 4s 之后这条余量归
// TICK_LEAD_SECONDS 管了（见下）。以后再嫌吵动的还是它，不是把下限抬回去。
const MIN_SECONDS = 5;
// 上限对应 100 字的正文上限（0.5 + 100 × 0.13 = 13.5）。留 14 是给上限本身一点余量，
// 而不是让最长的那张卡正好卡在公式的拐点上。
const MAX_SECONDS = 14;

/**
 * 提示音在卡片结束前几秒开始逐秒响。
 *
 * 3 声是配 6s 下限定的：那时最短的卡还有一半时间不响。下限降到 4s 之后，3 声要占掉
 * 整张卡的四分之三，第一声几乎贴着纸张覆盖动画落下；改成 2 声，最短的卡仍有前一半安静。
 * 这个数同时决定倒计时数字从几开始显示——TopicCard 用它判断何时把数字淡入。
 */
export const TICK_LEAD_SECONDS = 2;

// 先夹再乘，不是先乘再夹：这样每张卡都恰好是原时长的 PACE 倍，短卡不会因为压在下限上
// 而独自保持原速。代价是 MIN_SECONDS / MAX_SECONDS 不再是成片里的真实边界，
// 真实区间是它们各自乘过 PACE 之后的值（当前 4s–11.2s）。
export function cardSeconds(card: VideoCard): number {
  const raw = BASE_SECONDS + [...card.body].length * SECONDS_PER_CHARACTER;
  return PACE * Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, raw));
}

export function cardFrames(card: VideoCard): number {
  return Math.round(cardSeconds(card) * FPS);
}

// 取整：PACE 一旦不是能整除 FPS 的数，封面就会摊上小数帧，而 Sequence 的 from 必须是整数。
export const COVER_FRAMES = Math.round(COVER_SECONDS * FPS);

/** 新纸完成覆盖前，旧纸继续挂在它下面；这段时间包含在新卡原有的落位余量里。 */
export const PAPER_OVERLAY_FRAMES = 13;

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

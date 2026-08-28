// 整支视频的编排：封面问题 + 十张回答卡，一条循环 BGM，每张回答卡收尾前三声提示音。
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import type { VideoManifest } from "./contract.ts";
import { CoverCard } from "./CoverCard.tsx";
import { FONT_FAMILY, useSubsetFont } from "./font.ts";
import { BRAND } from "./layout.ts";
import { FPS, TICK_LEAD_SECONDS, timeline, totalFrames } from "./timing.ts";
import { TopicCard } from "./TopicCard.tsx";

// BGM 与提示音都已统一到 -3.5dB 峰值（见 public/CREDITS.md 的处理记录），
// 因此这两个数字是可比的：提示音要盖过垫乐但不能盖过阅读。
// 第一版成片实测整体偏响，两个值同比降到八成。
//
// BGM 比任何一天的成片都长，loop 实际不会触发；留着它是为了将来卡片数或时长上限
// 变大时不至于突然静音。
const BGM_VOLUME = 0.144;
const TICK_VOLUME = 0.28;
const BGM_FADE_OUT_FRAMES = FPS;

export const RedditLifeVideo: React.FC<{ manifest: VideoManifest }> = ({ manifest }) => {
  const { question, cards } = manifest;
  // 字体子集要一次覆盖全片：逐卡加载会让后面的卡片在自己出场那一帧还没拿到字。
  useSubsetFont(`${BRAND}${question}0123456789/个回答 ${cards.map(card => card.body).join("")}`);

  const segments = timeline(cards);
  const total = totalFrames(cards);
  const [cover, ...topics] = segments;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", fontFamily: FONT_FAMILY }}>
      <Audio
        src={staticFile("bgm.mp3")}
        loop
        volume={frame => (frame >= total - BGM_FADE_OUT_FRAMES ? (BGM_VOLUME * (total - frame)) / BGM_FADE_OUT_FRAMES : BGM_VOLUME)}
      />

      <Sequence from={cover!.from} durationInFrames={cover!.durationInFrames}>
        <CoverCard durationInFrames={cover!.durationInFrames} question={question} answerCount={cards.length} />
      </Sequence>

      {cards.map((card, index) => {
        const segment = topics[index]!;
        return (
          <Sequence key={card.index} from={segment.from} durationInFrames={segment.durationInFrames}>
            <TopicCard durationInFrames={segment.durationInFrames} card={card} total={cards.length} />
          </Sequence>
        );
      })}

      {/* 提示音挂在外层而不是卡片内部：Sequence 会把内部时间轴重置到 0，
          而 <Audio> 的裁剪逻辑按外层帧号走，放进去反而更难对齐整秒。 */}
      {topics.flatMap((segment, index) =>
        Array.from({ length: TICK_LEAD_SECONDS }, (_, step) => {
          const from = segment.from + segment.durationInFrames - (TICK_LEAD_SECONDS - step) * FPS;
          return (
            <Sequence key={`tick-${index}-${step}`} from={from} durationInFrames={FPS}>
              <Audio src={staticFile("tick.wav")} volume={TICK_VOLUME} />
            </Sequence>
          );
        }),
      )}
    </AbsoluteFill>
  );
};

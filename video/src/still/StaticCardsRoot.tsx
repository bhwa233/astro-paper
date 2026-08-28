import React from "react";
import { Composition } from "remotion";
import { RedditLifeNewspic, type RedditLifeNewspicProps } from "../newspic/RedditLifeNewspic.tsx";
import { parseVideoManifest } from "../contract.ts";

export const REDDIT_LIFE_NEWSPIC_COMPOSITION_ID = "RedditLifeNewspic";

const PLACEHOLDER: RedditLifeNewspicProps = {
  manifest: {
    version: 3,
    archiveDate: "2026-08-27",
    title: "医护人员戒掉的正常习惯",
    question: "医护人员目睹患者遭遇后，果断放弃了哪些看似正常的生活习惯？",
    cards: [{ index: 1, sourceIndex: 1, verbatim: true, body: "这是用于静态图片排版预览的一条回答。" }],
  },
  cardIndex: 0,
};

function parseProps(props: RedditLifeNewspicProps): RedditLifeNewspicProps {
  const manifest = parseVideoManifest(props.manifest);
  if (!Number.isInteger(props.cardIndex) || props.cardIndex < 0 || props.cardIndex > manifest.cards.length) {
    throw new Error(`invalid Reddit image card index: ${String(props.cardIndex)}`);
  }
  return { manifest, cardIndex: props.cardIndex };
}

export const StaticCardsRoot: React.FC = () => (
  <Composition
    id={REDDIT_LIFE_NEWSPIC_COMPOSITION_ID}
    component={RedditLifeNewspic}
    width={1080}
    height={1440}
    fps={1}
    durationInFrames={1}
    defaultProps={PLACEHOLDER}
    calculateMetadata={({ props }) => ({ props: parseProps(props as RedditLifeNewspicProps) })}
  />
);

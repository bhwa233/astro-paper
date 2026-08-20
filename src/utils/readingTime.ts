import { countProse, toPlainText } from "./postText";

export type PostMetrics = {
  /** Estimated reading time in minutes, never below 1. */
  readingTime: number;
  /** CJK characters plus Latin words. */
  wordCount: number;
};

/**
 * Reading time and word count from raw markdown, in one parse.
 *
 * CJK-aware: counts CJK characters and Latin words separately, since a
 * whitespace split badly undercounts Chinese/Japanese/Korean text. Uses
 * ~400 CJK chars/min and ~200 words/min as blended reading speeds. Both
 * numbers come off the same prose so they can never disagree.
 */
export function getPostMetrics(body: string): PostMetrics {
  const { cjkChars, words } = countProse(toPlainText(body));
  const minutes = cjkChars / 400 + words / 200;
  return {
    readingTime: Math.max(1, Math.round(minutes)),
    wordCount: cjkChars + words,
  };
}

export function getReadingTime(body: string): number {
  return getPostMetrics(body).readingTime;
}

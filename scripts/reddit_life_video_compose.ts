// 竖屏视频的候选层：把当天的微信归档稿拆回「问题 + 单条回答」。
//
// 输入是 reddit-life-wechat 已经提交的成稿，不是上游原始数据。那批译文已经过一次
// AI 选题过滤，直接当语料用；这条管线不再请求 Reddit，也不重跑翻译。
import fs from "node:fs";
import path from "node:path";
import { compact } from "./blog_common.ts";

/** 一支视频固定十张内容卡，与封面上的编号清单一一对应。 */
export const REDDIT_LIFE_VIDEO_CARD_COUNT = 10;
/** 低于这个数就不值得出片：封面清单会稀稀拉拉，观众划两下就走。 */
export const REDDIT_LIFE_VIDEO_MIN_CARDS = 4;

/** 屏上字必须一眼读完——没有旁白，观众只有卡片时长那几秒。 */
export const CARD_TITLE_MAX_CHARS = 14;
export const CARD_BODY_MAX_CHARS = 60;

export type RedditLifeVideoCandidate = {
  /** 全局序号，模型用它指认自己选了哪条。 */
  index: number;
  question: string;
  answer: string;
};

/** 归档稿的正文从 frontmatter 之后开始；开篇的引用块清单不是候选。 */
function articleBody(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? markdown.slice(match[0].length) : markdown;
}

/**
 * 每个 `## ` 二级标题是一个问题，其下的 `N\.` 项是逐条回答。
 *
 * 分隔符用「换行 + 编号」而不是单纯的编号：回答正文里出现「1998\. 」这种年份
 * 或者行内的编号引用时，只匹配编号会把一条回答从中间劈开。
 */
export function parseRedditLifeVideoCandidates(markdowns: string[]): RedditLifeVideoCandidate[] {
  const candidates: RedditLifeVideoCandidate[] = [];
  for (const markdown of markdowns) {
    for (const section of articleBody(markdown).split(/\r?\n## /).slice(1)) {
      const newline = section.indexOf("\n");
      if (newline < 0) continue;
      const question = compact(section.slice(0, newline));
      const body = section.slice(newline + 1);
      if (!question) continue;

      for (const chunk of body.split(/\r?\n(?=\d+\\?\.\s)/)) {
        const answer = compact(chunk.replace(/^\d+\\?\.\s*/, ""));
        if (answer) candidates.push({ index: candidates.length + 1, question, answer });
      }
    }
  }
  return candidates;
}

/** 当天全部微信稿，按文件名排序——文件名前缀就是卷次，顺序即 AI 选题顺序。 */
export function readRedditLifeWechatDrafts(archiveDir: string): { files: string[]; markdowns: string[] } {
  if (!fs.existsSync(archiveDir)) return { files: [], markdowns: [] };
  const files = fs
    .readdirSync(archiveDir)
    .filter(name => /^\d+-.+\.md$/.test(name))
    .sort();
  return { files, markdowns: files.map(name => fs.readFileSync(path.join(archiveDir, name), "utf8")) };
}

/** 喂给模型的证据。回答截断到 400 字：选卡只需要判断题材和结论，不需要读完全文。 */
export function candidateEvidence(candidates: RedditLifeVideoCandidate[]): string {
  return candidates.map(candidate => `${candidate.index}. 【${candidate.question}】${candidate.answer.slice(0, 400)}`).join("\n\n");
}

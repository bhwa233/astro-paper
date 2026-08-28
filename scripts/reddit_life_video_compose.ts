// 竖屏视频的候选层：把当天的微信归档稿拆回「一个问题 + 它的一组回答」。
//
// 输入是 reddit-life-wechat 已经提交的成稿，不是上游原始数据。那批译文已经过一次
// AI 选题过滤，直接当语料用；这条管线不再请求 Reddit，也不重跑翻译。
//
// 一支视频只讲一个问题。早期版本跨问题挑十条金句，成片像十个互不相干的段子拼盘，
// 观众没有「这是在答什么」的锚点；改成一题十答之后，封面就是问题，后面全是它的回答。
import fs from "node:fs";
import path from "node:path";
import { compact } from "./blog_common.ts";

/** 一支视频固定十条回答。 */
export const REDDIT_LIFE_VIDEO_ANSWER_COUNT = 10;

/** 每天一支视频取第一组内容，图片消息使用同一次 AI 选出的两组内容。 */
export const REDDIT_LIFE_DAILY_ISSUE_COUNT = 2;

/**
 * 屏上字必须一眼读完——没有旁白，观众只有卡片时长那几秒。
 *
 * 100 字是按归档实测定的：回答长度中位落在 31 到 156 字之间，多数在 50 到 105。
 * 卡在 100 意味着约六成回答原文直接上屏，只有偏长的那部分需要模型压缩，
 * 改写量远小于早期那版 60 字上限。
 */
export const CARD_BODY_MAX_CHARS = 100;

/** 微信草稿标题上限；标题由同一次选题 AI 根据最终问题和回答生成。 */
export const REDDIT_LIFE_VIDEO_TITLE_MAX_CHARS = 20;

/** 长回答喂给模型时的上界。实测最长 313 字，这个数只防异常输入，正常不会触发。 */
const EVIDENCE_ANSWER_MAX_CHARS = 600;

/**
 * 纯拉丁字符的括注，如「耳塞（earplugs）」「听力受损（noise induced hearing loss）」。
 *
 * 括注里含中文的不匹配（「减掉 40 磅（约 18 公斤）」要留着），只吃全英文的那种。
 */
const LATIN_GLOSS = /\s*[（(]\s*[A-Za-z][A-Za-z0-9\s.,/'’&+-]*\s*[）)]/g;

/**
 * 去掉英文括注。
 *
 * 归档译文给专业名词附了英文原文，那是给读者查证用的，在公众号正文里成立。
 * 但视频一屏只有十行字，一个「（noise induced hearing loss）」就占掉两行，
 * 而视频观众既不会去查也复制不走。
 *
 * 用规则删而不是写进提示词：正文上限内的回答要求模型原样照抄，两条指令会打架，
 * 而模型照抄时保留括注其实是对的——该让它消失的是渲染前的这一步。
 */
export function stripLatinGloss(text: string): string {
  return compact(text.replace(LATIN_GLOSS, ""));
}

export type RedditLifeVideoAnswer = {
  /** 当天全部回答里的全局序号，模型用它指认自己选了哪条。 */
  index: number;
  answer: string;
};

export type RedditLifeVideoQuestion = {
  index: number;
  question: string;
  answers: RedditLifeVideoAnswer[];
};

export function validateRedditLifeVideoTitle(value: unknown, question: string): string {
  const title = compact(String(value || ""));
  if (!title || !/[一-鿿]/.test(title)) throw new Error("Reddit life video title must be Chinese");
  if ([...title].length > REDDIT_LIFE_VIDEO_TITLE_MAX_CHARS) {
    throw new Error(`Reddit life video title is ${[...title].length} characters, at most ${REDDIT_LIFE_VIDEO_TITLE_MAX_CHARS} are allowed: ${title}`);
  }
  if (/^(?:Reddit\s*)?(?:精选|高赞)?问答$/i.test(title)) throw new Error(`Reddit life video title must describe this issue instead of using the column name: ${title}`);
  if (title === compact(question)) throw new Error("Reddit life video title must condense the question instead of copying it verbatim");
  return title;
}

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
 *
 * 回答序号在全天范围内连续，不按问题重新计数：模型只需要给一个数字就能被唯一定位，
 * 不必写成「第 3 题的第 5 条」这种要两个字段才能校验的引用。
 */
export function parseRedditLifeVideoQuestions(markdowns: string[]): RedditLifeVideoQuestion[] {
  const questions: RedditLifeVideoQuestion[] = [];
  let answerIndex = 0;

  for (const markdown of markdowns) {
    for (const section of articleBody(markdown).split(/\r?\n## /).slice(1)) {
      const newline = section.indexOf("\n");
      if (newline < 0) continue;
      const question = stripLatinGloss(section.slice(0, newline));
      if (!question) continue;

      const answers: RedditLifeVideoAnswer[] = [];
      for (const chunk of section.slice(newline + 1).split(/\r?\n(?=\d+\\?\.\s)/)) {
        const answer = stripLatinGloss(chunk.replace(/^\d+\\?\.\s*/, ""));
        if (!answer) continue;
        answerIndex += 1;
        answers.push({ index: answerIndex, answer });
      }
      if (answers.length) questions.push({ index: questions.length + 1, question, answers });
    }
  }
  return questions;
}

/** 回答不够十条的问题排不满一支视频，也就没必要送进选题。 */
export function eligibleRedditLifeVideoQuestions(questions: RedditLifeVideoQuestion[]): RedditLifeVideoQuestion[] {
  return questions.filter(question => question.answers.length >= REDDIT_LIFE_VIDEO_ANSWER_COUNT);
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

/**
 * 喂给模型的证据：全部合格问题连同各自的全部回答。
 *
 * 不抽样也不截到几十字：短回答要原样上屏，模型得看到完整文本才能照抄；
 * 长回答要压缩，截断过的输入只会让它压出没头没尾的半句话。
 * 实测一天全量约两万字，一次调用装得下。
 */
export function questionEvidence(questions: RedditLifeVideoQuestion[]): string {
  return questions
    .map(question => {
      const answers = question.answers.map(entry => `${entry.index}. ${entry.answer.slice(0, EVIDENCE_ANSWER_MAX_CHARS)}`).join("\n");
      return [`## 问题 ${question.index}（共 ${question.answers.length} 条回答）`, question.question, "", answers].join("\n");
    })
    .join("\n\n");
}

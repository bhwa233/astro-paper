// Reddit 人生的微信「图片消息」稿：一篇只讲一个问题，首张是标题卡，其余每条回答各一张卡。
//
// 为什么是单帖而不是沿用图文那边的五帖一卷：图片消息的 content 是纯文本、没有任何排版能力，
// 五个问题混在二十张卡里，读者滑到第十一张时无从知道正在读哪一问的答案。单帖时标题、
// 首图、每张卡说的是同一件事，形态自洽。代价是一天只覆盖一个问题——两卷图文仍覆盖十个。
//
// 与图文稿并存而不是替换它：这是形态实验，先加发一篇看分发，不该先砍掉现有覆盖面。
import satori from "satori";
import { PLATFORM_THEMES } from "../src/utils/platformTheme.ts";
import { compact, frontmatter, writeStderr } from "./blog_common.ts";
import { svgToPng } from "./image_raster.ts";
import {
  redditLifeStoryTexts,
  redditLifeWechatNewspicSyncId,
  redditLifeWechatTitle,
  REDDIT_LIFE_WECHAT_SHOW_SOURCE_URL,
  REDDIT_LIFE_WECHAT_TAG,
  REDDIT_LIFE_WECHAT_TITLE_BRAND,
  type RedditLifeCandidate,
} from "./reddit_life_wechat_compose.ts";
import { loadSubsetFonts, SATORI_FONT_FAMILY, type LoadedFont } from "./satori_font.ts";
import {
  WECHAT_CARD_SIZE,
  WECHAT_STORY_CARD_MAX_CHARACTERS,
  wechatStoryCardTree,
  wechatTitleCardTree,
} from "./wechat_card_layout.ts";

/** 微信一条图片消息最多 20 张图，首张即封面。这里就是那 20 张的分配：1 张标题 + 19 条回答。 */
export const REDDIT_LIFE_WECHAT_NEWSPIC_IMAGE_LIMIT = 20;
export const REDDIT_LIFE_WECHAT_NEWSPIC_STORY_LIMIT = REDDIT_LIFE_WECHAT_NEWSPIC_IMAGE_LIMIT - 1;

const LOG_LABEL = "reddit-life-wechat-newspic";

/**
 * 卡片文件名。
 *
 * 序号从 00 起，`card-00.png` 就是标题卡，也就是微信取用的封面。用两位数字而不是
 * `title.png` + `story-01.png`：稿子里图片的先后顺序就是 image_list 的顺序，
 * 文件名按序号排一遍，肉眼扫一眼目录就能核对顺序对不对。
 */
export function redditLifeWechatNewspicCardFile(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= REDDIT_LIFE_WECHAT_NEWSPIC_IMAGE_LIMIT) {
    throw new Error(`invalid Reddit life WeChat newspic card index: ${index}`);
  }
  return `card-${String(index).padStart(2, "0")}.png`;
}

/**
 * 挑出能上卡的回答。
 *
 * 超过版式容量的会被 satori 静默裁掉，因此宁可整条不收：一条读到一半就没有下文的回答，
 * 比少一条更糟。实测里这类超长回答是少数，扔掉之后通常仍能凑满十九条。
 */
export function redditLifeWechatNewspicStories(body: string): string[] {
  const all = redditLifeStoryTexts(body);
  const fitting = all.filter(story => [...story].length <= WECHAT_STORY_CARD_MAX_CHARACTERS);
  const dropped = all.length - fitting.length;
  if (dropped > 0) {
    writeStderr(`WARN: [${LOG_LABEL}] skipped ${dropped} story(ies) longer than ${WECHAT_STORY_CARD_MAX_CHARACTERS} characters`);
  }
  return fitting.slice(0, REDDIT_LIFE_WECHAT_NEWSPIC_STORY_LIMIT);
}

async function renderCard(tree: ReturnType<typeof wechatTitleCardTree>, fonts: LoadedFont[]): Promise<Buffer> {
  const svg = await satori(tree, { width: WECHAT_CARD_SIZE, height: WECHAT_CARD_SIZE, fonts });
  return svgToPng(svg);
}

/**
 * 渲染整篇的卡片，顺序即 image_list 顺序。
 *
 * 失败返回 null，由编排层跳过这一篇——这里与封面的处理刻意不同：封面渲不出来还能回落到
 * defaultCover，稿子照常发；图片消息没有图就没有稿，硬发出去只会在微信侧报错。
 */
export async function renderRedditLifeWechatNewspicCards(
  candidate: RedditLifeCandidate,
  stories: string[],
  brand: string = REDDIT_LIFE_WECHAT_TITLE_BRAND,
): Promise<Buffer[] | null> {
  const title = compact(candidate.title);
  if (!title) throw new Error("Reddit life WeChat newspic needs a post title");
  if (!stories.length) throw new Error("Reddit life WeChat newspic needs at least one story");
  if (stories.length > REDDIT_LIFE_WECHAT_NEWSPIC_STORY_LIMIT) {
    throw new Error(`Reddit life WeChat newspic has ${stories.length} stories, over the ${REDDIT_LIFE_WECHAT_NEWSPIC_STORY_LIMIT} limit`);
  }

  const theme = PLATFORM_THEMES.reddit;
  const fontFamily = SATORI_FONT_FAMILY;

  try {
    // 整篇一次裁子集：卡与卡之间用字大量重叠，而 satori 不会为了某个码点在同名字体之间回退，
    // 所以字集必须一次给全（详见 satori_font.ts）。页码那行的数字和斜杠也要带上，否则卡角是豆腐块。
    const fonts = await loadSubsetFonts(`${title}${brand}${stories.join("")}0123456789/`);

    const cards: Buffer[] = [];
    cards.push(await renderCard(wechatTitleCardTree({ title, brand, theme, fontFamily }), fonts));

    for (const [index, story] of stories.entries()) {
      const tree = wechatStoryCardTree({ story, index: index + 1, total: stories.length, theme, fontFamily });
      cards.push(await renderCard(tree, fonts));
    }

    return cards;
  } catch (error) {
    writeStderr(`WARN: [${LOG_LABEL}] card rendering failed, skipping the image draft: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * 图片消息稿的正文。
 *
 * 微信这里只吃纯文本，所以「正文」只有两部分：图片列表，以及图下方那段说明文字。
 * 说明文字刻意短——它在信息流里是折叠的，长了也没人展开，真正承载内容的是卡片。
 */
export function renderRedditLifeWechatNewspicMarkdown({
  candidate,
  storyCount,
  cardCount,
  archiveDate,
  articleUrl,
  showSourceUrl = REDDIT_LIFE_WECHAT_SHOW_SOURCE_URL,
}: {
  candidate: RedditLifeCandidate;
  storyCount: number;
  cardCount: number;
  archiveDate: string;
  articleUrl: string;
  showSourceUrl?: boolean;
}): string {
  const title = compact(candidate.title);
  if (!title) throw new Error("Reddit life WeChat newspic needs a post title");
  if (!articleUrl) throw new Error("Reddit life WeChat newspic needs the upstream article URL");
  if (cardCount !== storyCount + 1) throw new Error(`Reddit life WeChat newspic card count ${cardCount} does not match ${storyCount} stories`);

  const wechatFields = [`  syncId: "${redditLifeWechatNewspicSyncId(archiveDate)}"`, '  articleType: "newspic"'];
  if (showSourceUrl) wechatFields.push(`  sourceURL: "${articleUrl}"`);

  const metadata = frontmatter({
    title: redditLifeWechatTitle(title),
    date: archiveDate,
    description: title,
    tags: [REDDIT_LIFE_WECHAT_TAG],
    // 首张卡同时是封面。ogImage 仍要写：astro-wechat 的稿件校验要求有封面，
    // 而指向同一张图既满足校验，也不会多出一张与卡片不一致的图。
    ogImage: redditLifeWechatNewspicCardFile(0),
    wechatEnabled: true,
  })
    .replace("wechat:\n  enabled: true", ["wechat:", "  enabled: true", ...wechatFields].join("\n"))
    .replace("---\n\n", [`redditPostId: "${candidate.postId}"`, `subreddit: "${candidate.subreddit}"`, "---", ""].join("\n"));

  const caption = `${title}\n\n来自 Reddit r/${candidate.subreddit}，本篇收录 ${storyCount} 条回答。`;
  const images = Array.from({ length: cardCount }, (_, index) => `![](${redditLifeWechatNewspicCardFile(index)})`);

  return `${metadata}${caption}\n\n${images.join("\n\n")}\n`;
}

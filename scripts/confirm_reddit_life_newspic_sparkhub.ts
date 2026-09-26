// 图文草稿建好之后回报 SparkHub：把这一题在素材池里记为已用，公众号（wechat_mp）状态记为 draft
// 并附上草稿 media_id，再把卡片在 Release 里的地址存进 assets，供各平台的发布 agent 取用。
//
// 只在草稿真的建成时确认：media_id 取自同步台账 .astro-wechat/ledger.json，台账里没有这篇就跳过。
// 没确认的领取会在 24 小时后自动退回素材池。同一 syncId 重复确认是安全的，所以普通重跑可以放心再调。
//
// 题目与草稿的对应：video run.json 的 selectedQuestionIndexes 按位次对应图文第 1、2… 篇，
// 数值是 source.json 里 posts 的 1 基下标（喂给模型的问题顺序就是 posts 顺序）。
import fs from "node:fs";
import path from "node:path";
import { parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { redditLifeNewspicSyncId } from "./reddit_life_newspic_compose.ts";
import type { RedditLifeNewspicRunManifest } from "./generate_reddit_life_newspic.ts";
import type { RedditLifeVideoSource } from "./reddit_life_video_source.ts";
import { confirmRedditLifePosts, sparkhubEndpoint } from "./sparkhub_client.ts";

const LABEL = "[reddit-life-newspic-sparkhub]";
const LEDGER_REL = ".astro-wechat/ledger.json";

function readJson<T>(file: string): T | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const repo = path.resolve(stringArg(args, "repo", repoRoot()));
  const date = stringArg(args, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date YYYY-MM-DD is required");
  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");
  const githubRepo = process.env.GITHUB_REPOSITORY || "bhwa233/astro-paper";

  const newspic = readJson<RedditLifeNewspicRunManifest>(path.join(repo, "data/reddit-life-newspic", date, "run.json"));
  const source = readJson<RedditLifeVideoSource>(path.join(repo, "data/reddit-life-video", date, "source.json"));
  const video = readJson<{ selectedQuestionIndexes?: number[] }>(path.join(repo, "data/reddit-life-video", date, "run.json"));
  const ledger = readJson<{ entries?: Record<string, { mediaId?: string; writeState?: string }> }>(path.join(repo, LEDGER_REL));
  if (newspic?.status !== "processed" || !newspic.drafts?.length) {
    writeStderr(`${LABEL} ${date}: no processed image-message archive; nothing to confirm`);
    return;
  }
  // 2026-09-26 之前的选卡读的是文章草稿，没有 source.json，也就没有素材池里的对应条目。
  if (!source) {
    writeStderr(`${LABEL} ${date}: no SparkHub source for this date's selection; nothing to confirm`);
    return;
  }

  const confirmed: string[] = [];
  for (const draft of newspic.drafts) {
    const syncId = redditLifeNewspicSyncId(date, draft.issueNumber);
    const entry = ledger?.entries?.[syncId];
    if (!entry?.mediaId || entry.writeState !== "committed") {
      writeStderr(`WARN: ${LABEL} ${syncId}: no created draft in the sync ledger; left for the pool to reclaim`);
      continue;
    }
    const questionIndex = video?.selectedQuestionIndexes?.[draft.issueNumber - 1];
    const post = questionIndex ? source.posts[questionIndex - 1] : undefined;
    if (!post) throw new Error(`${LABEL} ${syncId}: cannot map issue ${draft.issueNumber} to a source question`);

    // Release 资产按「两位篇号-卡片名」命名，前缀对上这一篇的就是它的卡片。
    const prefix = `${String(draft.issueNumber).padStart(2, "0")}-`;
    const tag = newspic.release?.tag;
    const cards = tag
      ? newspic
          .release!.assets.filter(asset => asset.asset.startsWith(prefix))
          .map(asset => `https://github.com/${githubRepo}/releases/download/${tag}/${asset.asset}`)
      : [];

    const result = await confirmRedditLifePosts({
      ...(post.poolId !== null ? { ids: [post.poolId] } : { post_ids: [post.postId] }),
      sync_id: syncId,
      media_id: entry.mediaId,
      platform: "wechat_mp",
      assets: tag ? { newspic_cards: cards, newspic_release: `https://github.com/${githubRepo}/releases/tag/${tag}` } : undefined,
    });
    if (!result.ids.length) {
      writeStderr(`WARN: ${LABEL} ${syncId}: SparkHub confirmed nothing for ${post.postId}; it may be skipped or used by another draft`);
      continue;
    }
    confirmed.push(post.postId);
    writeStderr(`${LABEL} ${syncId}: confirmed ${post.postId} (pool ${result.ids.join(",")}) with ${cards.length} card(s)`);
  }
  writeStdout(`${JSON.stringify({ date, confirmed })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

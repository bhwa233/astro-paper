// 卡片上了 Release、run.json 提交之后回报 SparkHub：记下每题的卡片地址，抖音、B 站、视频号设为 ready。
// 帖子留在 pending，不影响公众号草稿链路领题。
//
// 两种用法：
// - `--date D`：回报这一天的批量。当天没有 run.json（缺口为 0，没生成）就什么都不做。
// - `--date D --since-days N`：补回报 D 之前 N 天（不含 D）。批量生成之前跑：前几天回报失败的题
//   在 SparkHub 看来仍然没有卡片，不补的话今天会被当成候选再生成一遍。
//
// 同一 Release 重复回报是安全的；SparkHub 会跳过已经从公众号链路拿到卡片的题。
import fs from "node:fs";
import path from "node:path";
import { parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import type { RedditLifeCardsRunManifest } from "./generate_reddit_life_cards.ts";
import { attachRedditLifeCards, sparkhubEndpoint } from "./sparkhub_client.ts";

const LABEL = "[reddit-life-cards-sparkhub]";
// SparkHub 单次最多收 100 题。
const CHUNK = 100;

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function attachDay(repo: string, date: string): Promise<number[]> {
  const file = path.join(repo, "data/reddit-life-cards", date, "run.json");
  if (!fs.existsSync(file)) {
    writeStderr(`${LABEL} ${date}: no card batch; nothing to attach`);
    return [];
  }
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as RedditLifeCardsRunManifest;
  const release = manifest.release;
  if (!release || !manifest.items.length) return [];

  const githubRepo = process.env.GITHUB_REPOSITORY || "bhwa233/astro-paper";
  const assetByPath = new Map(release.assets.map(asset => [asset.path, asset.asset]));
  const items = manifest.items.map(item => ({
    id: item.id,
    assets: {
      newspic_cards: item.images.map(image => {
        const asset = assetByPath.get(image.path);
        if (!asset) throw new Error(`${LABEL} ${date}: #${item.id} image ${image.path} is not in the release manifest`);
        return `https://github.com/${githubRepo}/releases/download/${release.tag}/${asset}`;
      }),
      newspic_release: `https://github.com/${githubRepo}/releases/tag/${release.tag}`,
    },
  }));

  const attached: number[] = [];
  for (let start = 0; start < items.length; start += CHUNK) {
    const result = await attachRedditLifeCards(items.slice(start, start + CHUNK));
    attached.push(...result.ids);
    for (const entry of result.skipped) writeStderr(`${LABEL} ${date}: #${entry.id} skipped: ${entry.reason}`);
  }
  writeStderr(`${LABEL} ${date}: attached ${attached.length} of ${items.length}`);
  return attached;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const repo = path.resolve(stringArg(args, "repo", repoRoot()));
  const date = stringArg(args, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date YYYY-MM-DD is required");
  if (!sparkhubEndpoint()) throw new Error("SPARKHUB_API_URL and SPARKHUB_DASHBOARD_TOKEN are required");
  const sinceDays = Number(stringArg(args, "since-days", "0"));
  if (!Number.isInteger(sinceDays) || sinceDays < 0) throw new Error("--since-days must be a non-negative integer");

  if (!sinceDays) {
    writeStdout(`${JSON.stringify({ date, attached: await attachDay(repo, date) })}\n`);
    return;
  }
  const results: Record<string, number[]> = {};
  for (let offset = sinceDays; offset >= 1; offset -= 1) {
    const day = shiftDate(date, -offset);
    const attached = await attachDay(repo, day);
    if (attached.length) results[day] = attached;
  }
  writeStdout(`${JSON.stringify({ date, sinceDays, attached: results })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

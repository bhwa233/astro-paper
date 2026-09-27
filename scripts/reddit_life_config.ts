// Reddit 问答链路的运行配置：每天几篇图文、几支视频、发哪些平台、抓哪些版块和抓多深、评论刷新怎么刷、
// 用哪个模型。唯一来源是 SparkHub（后台「配置」标签页 / MCP reddit_life_get_config），
// 每个脚本运行开头读一次；读不到（没配 secret、请求失败）就按下面的默认值跑并告警，保证不断更。
// 默认值就是配置化之前的行为。
//
// SparkHub 已经按字段范围校验过；这里只按类型取值，类型不对的字段退回默认值，一个坏字段不会带坏整份配置。
//
// 也可以作为命令行跑：`node --import tsx scripts/reddit_life_config.ts --github-output`
// 打印生效的配置，并把 workflow 条件要用的几项写进 $GITHUB_OUTPUT。
import fs from "node:fs";
import { booleanArg, parseArgs, writeStderr, writeStdout } from "./blog_common.ts";
import { getRedditLifeConfigValues, sparkhubEndpoint } from "./sparkhub_client.ts";
import { REDDIT_CATEGORIES } from "./reddit_top20_compose.ts";
import {
  REDDIT_LIFE_DAILY_NEWSPIC_COUNT,
  REDDIT_LIFE_DAILY_VIDEO_COUNT,
  REDDIT_LIFE_WECHAT_ARTICLE_ENABLED,
} from "../src/utils/redditLifePublishing.ts";

const LABEL = "[reddit-life-config]";

export type RedditLifeConfig = {
  newspic_per_day: number;
  video_per_day: number;
  render_video: boolean;
  wechat_article_enabled: boolean;
  platforms: string[];
  subreddits: string[];
  crawl_max_posts: number;
  crawl_top_level_comment_limit: number;
  crawl_direct_reply_limit: number;
  crawl_detail_comment_limit: number;
  refresh_top_k: number;
  refresh_stale_days: number;
  refresh_top_level_comment_limit: number;
  refresh_direct_reply_limit: number;
  refresh_max_comment_chars: number;
  ai_model: string;
};

export type LoadedRedditLifeConfig = {
  config: RedditLifeConfig;
  /** sparkhub：读到了；default：没读到，全部是默认值。 */
  source: "sparkhub" | "default";
};

export const REDDIT_LIFE_DEFAULT_CONFIG: RedditLifeConfig = {
  newspic_per_day: REDDIT_LIFE_DAILY_NEWSPIC_COUNT,
  video_per_day: REDDIT_LIFE_DAILY_VIDEO_COUNT,
  render_video: false,
  wechat_article_enabled: REDDIT_LIFE_WECHAT_ARTICLE_ENABLED,
  platforms: ["douyin", "bilibili", "wechat_mp", "wechat_channels"],
  subreddits: [...REDDIT_CATEGORIES.find(category => category.key === "life")!.subreddits],
  crawl_max_posts: 30,
  crawl_top_level_comment_limit: 50,
  crawl_direct_reply_limit: 10,
  crawl_detail_comment_limit: 100,
  refresh_top_k: 5,
  refresh_stale_days: 3,
  refresh_top_level_comment_limit: 40,
  refresh_direct_reply_limit: 10,
  refresh_max_comment_chars: 40_000,
  ai_model: "gemini-3.8-flash",
};

/** 按默认值的类型逐项取值；类型不符的字段保留默认值。 */
export function mergeRedditLifeConfig(values: Record<string, unknown>): RedditLifeConfig {
  const merged = { ...REDDIT_LIFE_DEFAULT_CONFIG } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(REDDIT_LIFE_DEFAULT_CONFIG)) {
    const value = values[key];
    const ok = Array.isArray(fallback)
      ? Array.isArray(value) && value.every(item => typeof item === "string")
      : typeof fallback === "number"
        ? Number.isInteger(value) && (value as number) >= 0
        : typeof value === typeof fallback;
    if (ok) merged[key] = value;
    else if (value !== undefined) writeStderr(`WARN: ${LABEL} ${key} has an unexpected value ${JSON.stringify(value)}; using the default\n`);
  }
  return merged as RedditLifeConfig;
}

let cached: Promise<LoadedRedditLifeConfig> | null = null;

/** 一个进程只读一次。 */
export function loadRedditLifeConfig(): Promise<LoadedRedditLifeConfig> {
  cached ??= (async (): Promise<LoadedRedditLifeConfig> => {
    if (!sparkhubEndpoint()) {
      writeStderr(`WARN: ${LABEL} SparkHub is not configured; running on the default config\n`);
      return { config: { ...REDDIT_LIFE_DEFAULT_CONFIG }, source: "default" };
    }
    try {
      const { values } = await getRedditLifeConfigValues();
      return { config: mergeRedditLifeConfig(values), source: "sparkhub" };
    } catch (error) {
      writeStderr(`WARN: ${LABEL} reading the SparkHub config failed; running on the default config: ${error instanceof Error ? error.message : String(error)}\n`);
      return { config: { ...REDDIT_LIFE_DEFAULT_CONFIG }, source: "default" };
    }
  })();
  return cached;
}

/** 视频与图文共用一次选题：选题组数取两者较大者。 */
export function redditLifeSelectionCount(config: RedditLifeConfig): number {
  return Math.max(config.newspic_per_day, config.video_per_day);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const { config, source } = await loadRedditLifeConfig();
  writeStderr(`${LABEL} source=${source} ${JSON.stringify(config)}\n`);
  writeStdout(`${JSON.stringify({ source, config })}\n`);
  if (booleanArg(args, "github-output")) {
    const output = process.env.GITHUB_OUTPUT;
    if (!output) throw new Error("--github-output needs GITHUB_OUTPUT");
    fs.appendFileSync(
      output,
      [
        `source=${source}`,
        `render_video=${config.render_video}`,
        `video_per_day=${config.video_per_day}`,
        `newspic_per_day=${config.newspic_per_day}`,
        `ai_model=${config.ai_model}`,
        "",
      ].join("\n")
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

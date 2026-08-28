// 账本层：跨运行的幂等性——重跑同一篇不重复入账、带追踪参数的同一集仍认得出、
// 从归档正文能反解出写进账本的身份。这些是读单个函数看不出来的不变量。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { normalizePodcastUrl } from "../scripts/foreign_tech_podcast_dedupe.ts";
import { appendMdblistRecommendations, loadMdblistRecommendationKeys } from "../scripts/mdblist_weekly_ledger.ts";
import { appendSummarizedEpisode, isEpisodeSummarized, loadSummarizedFingerprints } from "../scripts/podcast_ledger.ts";
import { tempDir, tempFile } from "./helpers/mocks.ts";
import { generateRedditLifeWechat, loadRedditLifeRunManifest } from "../scripts/generate_reddit_life_wechat.ts";
import { shouldRebuildRedditLifeNewspicManifest } from "../scripts/generate_reddit_life_newspic.ts";
import { loadWeiboTrendingWechatRunManifest, shouldRebuildWeiboTrendingWechatManifest } from "../scripts/generate_weibo_trending_wechat.ts";

function commitFixtureRepo(repo: string): string {
  execFileSync("git", ["-C", repo, "init", "--quiet"]);
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "--allow-empty", "-m", "fixture"]);
  return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

test("podcast fingerprints ignore tracking parameters and upsert by episode identity", () => {
  assert.equal(normalizePodcastUrl("https://example.com/podcast/dev-platforms?utm_medium=social&uo=4&b=2&a=1#section"), "https://example.com/podcast/dev-platforms?a=1&b=2");

  const ledgerFile = tempFile("podcast-ledger-unit", "summarized.json");
  const episode = { title: "Building Reliable AI Developer Platforms", show: "Latent Space", link: "https://example.com/podcast/dev-platforms?utm_medium=social", date: "2099-01-02" };
  appendSummarizedEpisode(episode, { archivedAt: "2099-01-02", postPath: "src/content/posts/zh-cn/每日播客-2099-01-02-01-latent-space.md" }, ledgerFile);
  // Re-running the same episode (force regeneration) upserts instead of appending a second row.
  appendSummarizedEpisode(episode, { archivedAt: "2099-01-03", postPath: "src/content/posts/zh-cn/每日播客-2099-01-03-01-latent-space.md" }, ledgerFile);

  const parsed = JSON.parse(fs.readFileSync(ledgerFile, "utf8")) as { episodes: { postPath?: string; archivedAt?: string }[] };
  assert.equal(parsed.episodes.length, 1);
  assert.equal(parsed.episodes[0].archivedAt, "2099-01-03");
  assert.match(parsed.episodes[0].postPath || "", /2099-01-03-01-latent-space/);
  // A tracking-param variant of the same link still resolves to the stored fingerprint.
  const variant = { title: "Building Reliable AI Developer Platforms", show: "Latent Space", link: "https://example.com/podcast/dev-platforms?uo=4" };
  assert.equal(isEpisodeSummarized(loadSummarizedFingerprints(ledgerFile), variant), true);
});

// 账本损坏时必须炸，不能静默当成空账本——那样去重集合会清空，当天整批重复发布。
test("a corrupt podcast ledger fails loudly instead of resetting deduplication", () => {
  const ledgerFile = tempFile("podcast-ledger-corrupt", "summarized.json");
  fs.writeFileSync(ledgerFile, '{"version": 1, "episodes": [');
  assert.throws(() => loadSummarizedFingerprints(ledgerFile), /invalid podcast summarized ledger/);
});

test("mdblist ledger persists successful selections and replaces same-post reruns", () => {
  const file = tempFile("mdblist-ledger", "recommended.json");
  const post = { archivedAt: "2099-01-09", postPath: "src/content/posts/zh-cn/每周影视推荐-2099-01-09.md" };
  appendMdblistRecommendations(
    [
      { key: "movie:10", mediaType: "movie", tmdbId: 10, title: "Movie A" },
      { key: "show:20:season:2", mediaType: "show", tmdbId: 20, seasonNumber: 2, title: "Show A" },
    ],
    post,
    file,
  );
  assert.deepEqual(loadMdblistRecommendationKeys(file), new Set(["movie:10", "show:20:season:2"]));

  // Re-running the same post replaces its rows rather than accumulating duplicates.
  appendMdblistRecommendations([{ key: "show:21:season:1", mediaType: "show", tmdbId: 21, seasonNumber: 1, title: "Show B" }], post, file);
  assert.deepEqual(loadMdblistRecommendationKeys(file), new Set(["show:21:season:1"]));
});

test("Reddit life generator reuses a normal rerun but force rebuilds a backfill", async () => {
  const repo = tempDir("reddit-life-upstream-empty");
  const upstreamSha = commitFixtureRepo(repo);
  const result = await generateRedditLifeWechat({ repo, date: "2099-01-02", upstreamSha, workflowRun: "123456789" });
  assert.equal(result.status, "upstream-empty");
  assert.deepEqual(result.generatedPaths, []);
  const manifest = loadRedditLifeRunManifest(`${repo}/${result.manifestPath}`);
  assert.deepEqual(manifest?.posts, []);
  assert.equal(manifest?.upstream.generatedSha, upstreamSha);
  assert.equal(manifest?.upstream.workflowRun, "123456789");
  assert.equal(fs.existsSync(path.join(repo, "data/reddit-life-wechat/2099-01-02/qr.png")), false);

  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "archive"]);
  const archiveSha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  await assert.rejects(
    generateRedditLifeWechat({ repo, date: "2099-01-02", upstreamSha, workflowRun: "234567890" }),
    /does not match --upstream-sha/,
  );

  await generateRedditLifeWechat({ repo, date: "2099-01-02", upstreamSha: archiveSha, workflowRun: "234567890" });
  assert.equal(loadRedditLifeRunManifest(`${repo}/${result.manifestPath}`)?.upstream.workflowRun, "123456789");

  await generateRedditLifeWechat({ repo, date: "2099-01-02", upstreamSha: archiveSha, workflowRun: "234567890", force: true });
  const rebuilt = loadRedditLifeRunManifest(`${repo}/${result.manifestPath}`);
  assert.equal(rebuilt?.upstream.generatedSha, archiveSha);
  assert.equal(rebuilt?.upstream.workflowRun, "234567890");
});

test("Weibo WeChat generator rebuilds for a new handoff or an explicit force", () => {
  const existing = {
    status: "processed" as const,
    upstream: { generatedSha: "aaaaaaaa", workflowRun: "123456789", articlePath: "src/content/posts/01.md" },
  };

  assert.equal(shouldRebuildWeiboTrendingWechatManifest(existing, "aaaaaaaa", true), false);
  assert.equal(shouldRebuildWeiboTrendingWechatManifest(existing, "bbbbbbbb", true), true);
  assert.equal(shouldRebuildWeiboTrendingWechatManifest(existing, "aaaaaaaa", true, true), true);
});

test("Reddit image-message generator retries only when its video selection content changes", () => {
  const existing = {
    status: "processed" as const,
    upstream: { generatedSha: "aaaaaaaa", selection: { path: "data/reddit-life-video/2099-01-02/video.json", sha256: "b".repeat(64) } },
  };

  assert.equal(shouldRebuildRedditLifeNewspicManifest(existing, "aaaaaaaa", true), false);
  assert.equal(shouldRebuildRedditLifeNewspicManifest(existing, "bbbbbbbb", true), true);
  assert.equal(shouldRebuildRedditLifeNewspicManifest(existing, "bbbbbbbb", true, false, "b".repeat(64)), false);
  assert.equal(shouldRebuildRedditLifeNewspicManifest(existing, "aaaaaaaa", true, false, "c".repeat(64)), true);
  assert.equal(shouldRebuildRedditLifeNewspicManifest(existing, "aaaaaaaa", false, false, ""), true);
  assert.equal(shouldRebuildRedditLifeNewspicManifest(existing, "aaaaaaaa", true, true), true);
});

// 2026-08-27: a force rebuild could not load a v2 manifest when the source article
// contained more than 30 topics, even though the image draft correctly selected 10.
test("Weibo image manifest accepts truncated source topics beyond the legacy article limit", () => {
  const manifestFile = tempFile("weibo-image-manifest", "run.json");
  const archivedFile = (filePath: string) => ({ path: filePath, sha256: "a".repeat(64) });
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      version: 2,
      archiveDate: "2026-08-26",
      timeZone: "Asia/Shanghai",
      status: "processed",
      upstream: {
        generatedSha: "a".repeat(40),
        workflowRun: "33036171884",
        articlePath: "src/content/posts/zh-cn/wb-20260826.md",
      },
      rawSources: { upstreamMarkdown: archivedFile("data/weibo-trending-wechat/2026-08-26/upstream.md") },
      draft: {
        ...archivedFile("data/weibo-trending-wechat/2026-08-26/01.md"),
        itemCount: 10,
        truncatedItemCount: 32,
        cards: Array.from({ length: 11 }, (_, index) => archivedFile(`data/weibo-trending-wechat/2026-08-26/card-${String(index).padStart(2, "0")}.png`)),
      },
    }),
  );

  const manifest = loadWeiboTrendingWechatRunManifest(manifestFile);
  assert.equal(manifest?.draft?.itemCount, 10);
  assert.equal(manifest?.draft?.truncatedItemCount, 32);
});

// 2026-08-18: qr.png is intentionally gitignored, so reusing a committed manifest used to
// return before restoring it. The following sync job then failed while downloading a QR artifact
// that the rerun had never uploaded.

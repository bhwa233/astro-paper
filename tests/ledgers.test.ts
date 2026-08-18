// 账本层：跨运行的幂等性——重跑同一篇不重复入账、带追踪参数的同一集仍认得出、
// 从归档正文能反解出写进账本的身份。这些是读单个函数看不出来的不变量。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { normalizePodcastUrl } from "../scripts/foreign_tech_podcast_dedupe.ts";
import { appendMdblistRecommendations, loadMdblistRecommendationKeys, parseMdblistRecommendationsFromSource } from "../scripts/mdblist_weekly_ledger.ts";
import { appendSummarizedEpisode, isEpisodeSummarized, loadSummarizedFingerprints } from "../scripts/podcast_ledger.ts";
import { fixture, tempDir, tempFile } from "./helpers/mocks.ts";
import { appendRedditLifeRecommendations, loadRedditLifeRecommendationKeys, redditPostRecommendationKey } from "../scripts/reddit_life_wechat_ledger.ts";
import { generateRedditLifeWechat, loadRedditLifeRunManifest } from "../scripts/generate_reddit_life_wechat.ts";

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

test("mdblist source evidence exposes the TMDB identities selected for the ledger", () => {
  const selections = parseMdblistRecommendationsFromSource(fixture("blog-sources/mdblist-weekly.md"));
  assert.ok(selections.length >= 4, "selections: " + selections.length);
  assert.equal(selections[0].mediaType, "movie");
  assert.match(selections[0].key, /^movie:\d+$/);
  assert.equal(selections[3].mediaType, "show");
  assert.match(selections[3].key, /^show:\d+:season:\d+$/);
});

test("Reddit life ledger rewrites the full same-day generated set without losing the first post", () => {
  const file = tempFile("reddit-life-ledger", "recommended.json");
  const meta = { archivedAt: "2099-01-02", postPath: "data/reddit-life-wechat/2099-01-02/run.json" };
  const first = { key: redditPostRecommendationKey("abcde"), postId: "abcde", title: "第一个讨论" };
  const second = { key: redditPostRecommendationKey("fghij"), postId: "fghij", title: "第二个讨论" };
  appendRedditLifeRecommendations([first, second], meta, file);
  appendRedditLifeRecommendations([first, second], meta, file);
  assert.deepEqual(loadRedditLifeRecommendationKeys(file), new Set([first.key, second.key]));
  fs.writeFileSync(file, "{");
  assert.throws(() => loadRedditLifeRecommendationKeys(file), /invalid Reddit life WeChat recommendation ledger/);
});

test("Reddit life generator records an absent upstream article as a stable no-op manifest", async () => {
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
  await assert.rejects(
    generateRedditLifeWechat({ repo, date: "2099-01-02", upstreamSha, workflowRun: "123456789" }),
    /does not match --upstream-sha/,
  );
});

// 2026-08-18: qr.png is intentionally gitignored, so reusing a committed manifest used to
// return before restoring it. The following sync job then failed while downloading a QR artifact
// that the rerun had never uploaded.
test("Reddit life generator restores QR resources when reusing a generated manifest", async () => {
  const repo = tempDir("reddit-life-manifest-reuse");
  const date = "2099-01-02";
  const dayDir = path.join(repo, "data/reddit-life-wechat", date);
  const draftPath = `data/reddit-life-wechat/${date}/01-abcde.md`;
  fs.mkdirSync(dayDir, { recursive: true });
  fs.writeFileSync(path.join(repo, draftPath), "---\ntitle: fixture\n---\n");
  fs.writeFileSync(
    path.join(dayDir, "run.json"),
    `${JSON.stringify(
      {
        version: 1,
        archiveDate: date,
        timeZone: "America/Los_Angeles",
        status: "processed",
        upstream: {
          generatedSha: "0000000000000000000000000000000000000000",
          workflowRun: "123456788",
          lifeArticlePath: `src/content/posts/zh-cn/reddit-${date}-life.md`,
        },
        posts: [
          {
            rank: 1,
            postId: "abcde",
            title: "测试问题",
            subreddit: "AskReddit",
            points: "100 points · 10 评论",
            numComments: 10,
            permalink: "https://www.reddit.com/r/AskReddit/comments/abcde/test/",
            status: "generated",
            path: draftPath,
            contentSha256: "1".repeat(64),
            issue: 1,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const upstreamSha = commitFixtureRepo(repo);

  const result = await generateRedditLifeWechat({ repo, date, upstreamSha, workflowRun: "123456789" });

  assert.deepEqual(result.generatedPaths, [draftPath]);
  const qr = fs.readFileSync(path.join(dayDir, "qr.png"));
  assert.deepEqual([...qr.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

// Release 资产层：卡片不进仓库之后，「manifest 记录的哈希」是同步 job 拿到正确图片的唯一凭据。
// 这里证明恢复逻辑只信哈希：本地已有且一致的不下载，缺的下载后核对，对不上宁可失败。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { sha256 } from "../scripts/committed_handoff.ts";
import { buildReleaseManifest, findRunManifest, releaseAssetName, restoreReleaseAssets } from "../scripts/release_assets.ts";
import { tempDir } from "./helpers/mocks.ts";

test("release asset names flatten the day directory and stay ASCII", () => {
  assert.equal(releaseAssetName("data/reddit-life-newspic/2099-01-02/01/card-00.png", "data/reddit-life-newspic/2099-01-02"), "01-card-00.png");
  assert.equal(releaseAssetName("data/weibo-trending-wechat/2099-01-02/card-03.png", "data/weibo-trending-wechat/2099-01-02"), "card-03.png");
  assert.throws(() => releaseAssetName("data/other/2099-01-02/card-00.png", "data/weibo-trending-wechat/2099-01-02"), /must live under/);
  assert.throws(() => buildReleaseManifest("bad tag", "d", []), /invalid release tag/);
});

test("restore downloads only assets whose local copy is missing or stale, and verifies every hash", () => {
  const repo = tempDir("release-assets-restore");
  const dayDir = "data/weibo-trending-wechat/2099-01-02";
  fs.mkdirSync(path.join(repo, dayDir), { recursive: true });
  const kept = Buffer.from("kept card");
  const fresh = Buffer.from("fresh card");
  fs.writeFileSync(path.join(repo, dayDir, "card-00.png"), kept);
  // card-01 exists locally but with the wrong content: it must be replaced, not trusted.
  fs.writeFileSync(path.join(repo, dayDir, "card-01.png"), Buffer.from("stale"));
  const release = buildReleaseManifest("weibo-trending-wechat-2099-01-02", dayDir, [
    { path: `${dayDir}/card-00.png`, sha256: sha256(kept) },
    { path: `${dayDir}/card-01.png`, sha256: sha256(fresh) },
    { path: `${dayDir}/card-02.png`, sha256: sha256(fresh) },
  ]);

  const requested: string[][] = [];
  const result = restoreReleaseAssets(repo, release, (_tag, names, dir) => {
    requested.push(names);
    for (const name of names) fs.writeFileSync(path.join(dir, name), fresh);
  });
  assert.deepEqual(result, { restored: 2, reused: 1 });
  assert.deepEqual(requested, [["card-01.png", "card-02.png"]]);
  assert.equal(fs.readFileSync(path.join(repo, dayDir, "card-01.png"), "utf8"), "fresh card");
  assert.equal(fs.readFileSync(path.join(repo, dayDir, "card-02.png"), "utf8"), "fresh card");

  // A second restore is a no-op once everything matches.
  assert.deepEqual(restoreReleaseAssets(repo, release, () => assert.fail("must not download")), { restored: 0, reused: 3 });

  // A download whose bytes do not match the manifest must fail instead of landing next to the draft.
  fs.rmSync(path.join(repo, dayDir, "card-02.png"));
  assert.throws(
    () => restoreReleaseAssets(repo, release, (_tag, names, dir) => fs.writeFileSync(path.join(dir, names[0]), Buffer.from("tampered"))),
    /hash does not match/,
  );
  assert.equal(fs.existsSync(path.join(repo, dayDir, "card-02.png")), false);
});

test("the manual sync entry finds the day manifest above a draft", () => {
  const repo = tempDir("release-assets-find");
  fs.mkdirSync(path.join(repo, "data/reddit-life-newspic/2099-01-02/01"), { recursive: true });
  fs.writeFileSync(path.join(repo, "data/reddit-life-newspic/2099-01-02/run.json"), "{}");
  assert.equal(findRunManifest(repo, "data/reddit-life-newspic/2099-01-02/01/01.md"), path.join(repo, "data/reddit-life-newspic/2099-01-02/run.json"));
  assert.equal(findRunManifest(repo, "src/content/posts/zh-cn/x.md"), null);
});

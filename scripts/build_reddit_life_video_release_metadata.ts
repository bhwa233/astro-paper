#!/usr/bin/env tsx
// Release 资产的组装：把渲染结果、发布元数据和固定栏目名合成 metadata.json，并按序号铺平 mp4。
//
// 原本是 publish-reddit-life-video.yml 里的一段内联 heredoc。搬出来是因为它现在要 join
// 第二份文件，而内联脚本既没法单测，改错了也只有等定时任务跑到那一步才会发现。
//
// 成片按选题顺序写成 1.mp4 / 2.mp4 ...，下载端靠 metadata.json 通过稳定 ASCII 文件名
// 恢复内容语义。
import fs from "node:fs";
import path from "node:path";
import { parseArgs, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import { REDDIT_LIFE_VIDEO_SERIES } from "./reddit_life_video_taxonomy.ts";

const METADATA_VERSION = 2;

type RenderedVideo = { index: number; title: string; question: string; outputLocation: string };

type PublishIssue = { position: number; questionIndex: number; status: string; tags: string[]; summary: string };

function readPublishIssues(file: string): Map<number, PublishIssue> {
  const issues = new Map<number, PublishIssue>();
  // 缺席是允许的：这份契约之前生成的归档没有 publish.json，补跑老日期时也不会有。
  // 少标签总好过让整条发布链因为一个描述字段失败。
  if (!file || !fs.existsSync(file)) {
    writeStderr(`[reddit-life-video-release] no publish metadata at ${file || "<unset>"}; releasing with series only\n`);
    return issues;
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { issues?: PublishIssue[] };
  for (const issue of parsed.issues || []) {
    if (issue.status === "processed") issues.set(issue.position, issue);
  }
  return issues;
}

function main(): void {
  const args = parseArgs();
  const renderFile = stringArg(args, "render-json");
  if (!renderFile) throw new Error("--render-json is required");
  const outFile = stringArg(args, "out") || "metadata.json";
  const assetsFile = stringArg(args, "assets-out") || "release-assets.txt";
  const assetDir = stringArg(args, "asset-dir") || process.cwd();

  const result = JSON.parse(fs.readFileSync(renderFile, "utf8")) as { date: string; videos: RenderedVideo[] };
  if (!Array.isArray(result.videos) || !result.videos.length) throw new Error("render result contains no videos");
  const publishIssues = readPublishIssues(stringArg(args, "publish-json"));

  const videos = result.videos.map((video, position) => {
    const index = position + 1;
    // 渲染结果的顺序就是选题顺序，也是 publish.json 的 position。错位了宁可失败，
    // 也不要把甲视频的结论配到乙视频上。
    if (video.index !== index) throw new Error(`Unexpected video index ${video.index} at position ${position}`);
    fs.copyFileSync(video.outputLocation, path.join(assetDir, `${index}.mp4`));

    const publish = publishIssues.get(index);
    return {
      index,
      videoAsset: `${index}.mp4`,
      title: video.title,
      question: video.question,
      series: REDDIT_LIFE_VIDEO_SERIES,
      // 降级时整个字段省略，而不是塞一个空数组或标题的复述进去：
      // 下游看到缺字段知道要人工补，看到空值只会当成「本来就没有」。
      ...(publish ? { tags: publish.tags, summary: publish.summary } : {}),
    };
  });

  fs.writeFileSync(path.join(assetDir, outFile), `${JSON.stringify({ version: METADATA_VERSION, archiveDate: result.date, series: REDDIT_LIFE_VIDEO_SERIES, videos }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(assetDir, assetsFile), `${videos.map(video => video.videoAsset).join("\n")}\n`, "utf8");

  const withMetadata = videos.filter(video => "tags" in video).length;
  writeStdout(`${JSON.stringify({ date: result.date, videoCount: videos.length, withPublishMetadata: withMetadata })}\n`);
}

main();

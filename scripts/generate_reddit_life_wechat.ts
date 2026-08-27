#!/usr/bin/env tsx
// 独立的 Reddit 人生微信归档编排：不进入 Astro 内容集合，也不重新抓取 Reddit 榜单。
// AI 对上游文章的全部帖子做过滤与排序；开篇问题清单与故事正文均按规则转换，不由模型改写。
// 每篇取五帖、每帖最多前 30 条回答，标题直接取选后第一帖，避免模型把多帖串成一个标题。
// 第一帖标题由上游做技术长度兜底，这里仍按微信平台限制防御性收口。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { booleanArg, dateStringInTimeZone, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import {
  countDroppableStories,
  dropTrailingStories,
  markdownSha256,
  parseRedditLifeCandidates,
  redditLifeArticleUrl,
  redditLifeWechatFooter,
  renderRedditLifeWechatMarkdown,
  REDDIT_LIFE_WECHAT_POST_LIMIT,
  REDDIT_LIFE_WECHAT_QR_FILE,
  REDDIT_LIFE_WECHAT_REPLY_LIMIT,
  REDDIT_LIFE_WECHAT_SHOW_QR,
  REDDIT_LIFE_WECHAT_TOTAL_POSTS,
  REDDIT_LIFE_WECHAT_TITLE_BRAND,
  REDDIT_LIFE_WECHAT_VOLUMES,
  type RedditLifeCandidate,
  type RedditLifeVolume,
} from "./reddit_life_wechat_compose.ts";
import { redditLifeWechatCoverFile, renderRedditLifeWechatCover } from "./reddit_life_wechat_cover.ts";
import {
  rankedRedditLifeCandidates,
  selectRedditLifeWechatCandidates,
  splitRedditLifeWechatCandidates,
  validateRedditLifeWechatSelection,
  type RedditLifeWechatSelection,
} from "./reddit_life_wechat_selection.ts";
import { renderQrPng } from "./qr_code.ts";
import { taskPostRelPath } from "./blog_tasks.ts";

const ROOT_REL = "data/reddit-life-wechat";
const MANIFEST_VERSION = 4;

type Entry = Omit<RedditLifeCandidate, "body" | "rank"> & {
  // v1 manifest 使用 rank；v2 拆开来源排名和选后排名；v3 增加每卷导语；v4 撤掉 AI 导语。
  rank?: number;
  sourceRank?: number;
  selectionRank?: number;
  status: "generated" | "content-skipped";
  path?: string;
  contentSha256?: string;
  reason?: string;
  // 这一帖被分到哪一卷。两卷各一篇稿子，卷次同样要能被重跑复用。
  // 分卷之前的归档没有这个字段，因此保持可选以兼容历史 manifest。
  volume?: RedditLifeVolume;
};

export type RedditLifeRunManifest = {
  version: 1 | 2 | 3 | 4;
  archiveDate: string;
  timeZone: "America/Los_Angeles";
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; workflowRun: string; lifeArticlePath: string };
  rawSources?: { upstreamLifeMarkdown: string };
  selection?: RedditLifeWechatSelection & {
    // 仅 v3 历史 manifest 存在；v4 开篇由代码根据入选标题生成。
    leads?: string[];
    model: string;
    candidateCount: number;
  };
  posts: Entry[];
};

function gitOutput(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to verify the Reddit life committed handoff: ${detail}`);
  }
}

function assertCommittedHandoff(repo: string, upstreamSha: string): string {
  if (!/^[0-9a-f]{7,64}$/i.test(upstreamSha)) throw new Error(`invalid --upstream-sha: ${upstreamSha || "missing"}`);
  const expected = gitOutput(repo, ["rev-parse", "--verify", `${upstreamSha}^{commit}`]).toLowerCase();
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).toLowerCase();
  if (head !== expected) throw new Error(`Reddit life WeChat HEAD ${head} does not match --upstream-sha ${expected}`);
  return expected;
}

function assertCommittedPath(repo: string, relPath: string): void {
  const status = gitOutput(repo, ["status", "--porcelain", "--untracked-files=all", "--", relPath]);
  if (status) throw new Error(`Reddit life WeChat handoff path must match HEAD: ${relPath}`);
}

function archiveDate(input: string): string {
  if (input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error(`invalid archive date: ${input}`);
    return input;
  }
  // The only automatic caller is reddit-top20's daily cron. Preserve that task's Los Angeles business date.
  return dateStringInTimeZone(new Date(), "America/Los_Angeles");
}

function runRelPath(date: string): string {
  return path.join(ROOT_REL, date, "run.json");
}

function parseManifest(raw: unknown, file: string): RedditLifeRunManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid Reddit life WeChat run manifest: ${file}`);
  const value = raw as Partial<RedditLifeRunManifest>;
  if (
    (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== MANIFEST_VERSION) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.archiveDate || "") ||
    value.timeZone !== "America/Los_Angeles" ||
    (value.status !== "processed" && value.status !== "upstream-empty") ||
    !value.upstream ||
    !/^[0-9a-f]{7,64}$/i.test(value.upstream.generatedSha || "") ||
    !/^\d+$/.test(value.upstream.workflowRun || "") ||
    !value.upstream.lifeArticlePath ||
    !Array.isArray(value.posts)
  ) {
    throw new Error(`invalid Reddit life WeChat run manifest structure: ${file}`);
  }
  let selection: RedditLifeWechatSelection | undefined;
  if (value.version !== 1 && value.status === "processed") {
    const audit = value.selection;
    if (!audit || !audit.model || !Number.isInteger(audit.candidateCount) || (audit.candidateCount || 0) < 1) {
      throw new Error(`invalid Reddit life WeChat selection audit: ${file}`);
    }
    try {
      selection = validateRedditLifeWechatSelection(audit, audit.candidateCount);
      if (value.version === 3) {
        const expectedLeadCount = selection.selected.length === REDDIT_LIFE_WECHAT_TOTAL_POSTS ? 2 : selection.selected.length ? 1 : 0;
        if (!Array.isArray(audit.leads) || audit.leads.length !== expectedLeadCount || audit.leads.some(item => !String(item || "").trim() || !/[一-鿿]/.test(String(item)))) {
          throw new Error(`Reddit life WeChat v3 selection needs ${expectedLeadCount} valid lead(s)`);
        }
      }
    } catch (error) {
      throw new Error(`invalid Reddit life WeChat selection audit: ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (value.posts.length !== selection.selected.length) throw new Error(`invalid Reddit life WeChat selected post count: ${file}`);
  }
  for (const [index, post] of value.posts.entries()) {
    const validRank = value.version === 1 ? post?.rank === index + 1 : post?.sourceRank === selection?.selected[index]?.rank && post?.selectionRank === index + 1;
    if (
      !post ||
      !validRank ||
      !post.postId ||
      !post.title ||
      !post.subreddit ||
      !post.permalink ||
      !["generated", "content-skipped"].includes(post.status) ||
      (post.status === "generated" && (!post.path || !post.contentSha256))
    ) {
      throw new Error(`invalid Reddit life WeChat run manifest post ${index + 1}: ${file}`);
    }
  }
  if (value.status === "upstream-empty" && value.posts.length) throw new Error(`invalid Reddit life WeChat upstream-empty manifest: ${file}`);
  return value as RedditLifeRunManifest;
}

export function loadRedditLifeRunManifest(file: string): RedditLifeRunManifest | null {
  if (!fs.existsSync(file)) return null;
  try {
    return parseManifest(JSON.parse(fs.readFileSync(file, "utf8")), file);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid Reddit life WeChat")) throw error;
    throw new Error(`invalid Reddit life WeChat run manifest: ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeArtifact(dir: string, name: string, content: string): void {
  if (!dir) return;
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, name), `${content.trim()}\n`, "utf8");
}

// 一帖的故事条数不可控，渲染出的 HTML 随时可能撞上微信 20000 字符上限，而上游无法预知渲染后的长度。
// 这里用渲染器本身做判定，收口分两级：
//   1. 先二分「每帖统一保留几条」，取能渲染通过的最大值。删减均摊到五帖，五帖各让出几条；
//   2. 每帖只剩一条仍超限，才退到从正文末尾删故事——这一级会把最后一帖整个啃掉，只当兜底。
// 顺序不能反：尾删对第五帖最不公平，加到五帖之后再优先用它，等于白收录后两帖。
// probeDir 必须是真稿最终落地的目录：astro-wechat 按 Markdown 所在目录解析相对资源路径，
// 探针放别处的话，稿子里那句 `ogImage: cover.png` 会在探针旁边找图，找不到就整个跑挂。
export async function fitWechatContentLimit(render: (replyLimit: number) => string, repo: string, label: string, probeDir: string): Promise<string> {
  const { openProject, prepareArticle } = await import("./wechat/src/index.ts");
  const project = await openProject(repo, { root: repo });
  const probeFile = path.join(probeDir, `.content-limit-probe-${process.pid}.md`);
  ensureDir(path.dirname(probeFile));
  const fits = async (candidate: string): Promise<boolean> => {
    fs.writeFileSync(probeFile, candidate, "utf8");
    try {
      await prepareArticle(probeFile, project);
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "content-too-long" || code === "content-too-large") return false;
      throw error;
    }
  };
  try {
    const full = render(REDDIT_LIFE_WECHAT_REPLY_LIMIT);
    if (await fits(full)) return full;
    // fits() 对每帖条数单调：条数越少越可能通过，因此可以二分最大可行的统一上限。
    let low = 1;
    let high = REDDIT_LIFE_WECHAT_REPLY_LIMIT - 1;
    let fittedLimit = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (await fits(render(middle))) {
        fittedLimit = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (fittedLimit) {
      // 静默截断会让归档看起来是完整讨论，因此把收敛到的条数写进日志。
      writeStderr(`WARN: [reddit-life-wechat] ${label}: capped each post at ${fittedLimit} story(ies) (from ${REDDIT_LIFE_WECHAT_REPLY_LIMIT}) to fit the WeChat content limit`);
      return render(fittedLimit);
    }
    // 每帖一条都放不下，说明单条故事本身极长。此时只剩尾删可用。
    const minimal = render(1);
    low = 1;
    high = countDroppableStories(minimal) - 1;
    let fittedDrop = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (await fits(dropTrailingStories(minimal, middle))) {
        fittedDrop = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    if (!fittedDrop) throw new Error(`${label}: article still exceeds the WeChat content limit even with a single story`);
    writeStderr(`WARN: [reddit-life-wechat] ${label}: capped each post at 1 story and dropped ${fittedDrop} trailing story(ies) to fit the WeChat content limit`);
    return dropTrailingStories(minimal, fittedDrop);
  } finally {
    fs.rmSync(probeFile, { force: true });
  }
}

// 封面不该有能力弄挂一次归档：渲染器已经在失败时回落成"没有封面"，这里补上最后一段——
// 图渲出来了但 astro-wechat 仍然消化不了，就撤掉 ogImage 重来一次，稿子照常归档。
async function fitWithOptionalCover({
  candidates,
  digest,
  date,
  volume,
  articleUrl,
  footer,
  coverFile,
  repo,
  label,
  probeDir,
}: {
  candidates: RedditLifeCandidate[];
  digest: { headline: string; description: string };
  date: string;
  volume: RedditLifeVolume;
  articleUrl: string;
  footer: string;
  coverFile: string;
  repo: string;
  label: string;
  probeDir: string;
}): Promise<string> {
  const render = (cover: string) => (replyLimit: number) =>
    renderRedditLifeWechatMarkdown({ candidates, headline: digest.headline, description: digest.description, archiveDate: date, volume, articleUrl, footer, coverFile: cover, replyLimit });
  try {
    return await fitWechatContentLimit(render(coverFile), repo, label, probeDir);
  } catch (error) {
    if (!coverFile) throw error;
    writeStderr(`WARN: [reddit-life-wechat] ${label}: dropping the cover after ${error instanceof Error ? error.message : String(error)}`);
    return fitWechatContentLimit(render(""), repo, label, probeDir);
  }
}

export async function generateRedditLifeWechat({
  repo = repoRoot(),
  date,
  upstreamSha,
  workflowRun = "",
  artifactsDir = "",
  model = process.env.AI_MODEL || "gemini-3.7-flash",
  promptDir = "",
  force = false,
}: {
  repo?: string;
  date: string;
  upstreamSha: string;
  workflowRun?: string;
  artifactsDir?: string;
  model?: string;
  promptDir?: string;
  /** Explicit backfill only: rebuild an existing archive instead of returning its cached manifest. */
  force?: boolean;
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: RedditLifeRunManifest["status"] }> {
  if (!upstreamSha) throw new Error("--upstream-sha is required; Reddit life WeChat must read the committed parent handoff");
  if (!/^\d+$/.test(workflowRun)) throw new Error("--upstream-workflow-run is required and must be a GitHub Actions run ID");
  upstreamSha = assertCommittedHandoff(repo, upstreamSha);
  const manifestRel = runRelPath(date);
  const manifestFile = path.join(repo, manifestRel);
  assertCommittedPath(repo, manifestRel);
  const existing = loadRedditLifeRunManifest(manifestFile);
  if (existing && !force) {
    const generated = existing.posts.filter(post => post.status === "generated");
    writeStderr(`[reddit-life-wechat] archive=${date}: reused manifest (${existing.status}), posts=${generated.length}`);
    // 收录的每一帖共享同一个 path，去重后才是「要发布几篇稿子」。
    return { manifestPath: manifestRel, generatedPaths: [...new Set(generated.map(post => post.path!).filter(Boolean))], status: existing.status };
  }
  if (existing) writeStderr(`[reddit-life-wechat] archive=${date}: force rebuilding existing manifest (${existing.status})`);
  const lifeArticlePath = taskPostRelPath("reddit-top20", date.replace(/$/, "-life"));
  assertCommittedPath(repo, lifeArticlePath);
  const upstreamFile = path.join(repo, lifeArticlePath);
  if (!fs.existsSync(upstreamFile)) {
    const manifest: RedditLifeRunManifest = { version: MANIFEST_VERSION, archiveDate: date, timeZone: "America/Los_Angeles", status: "upstream-empty", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, posts: [] };
    writeJson(manifestFile, manifest);
    writeStderr(`[reddit-life-wechat] archive=${date}: upstream life article missing at ${lifeArticlePath}; wrote upstream-empty manifest`);
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status };
  }
  const upstreamMarkdown = fs.readFileSync(upstreamFile, "utf8");
  writeArtifact(artifactsDir, "upstream-life.md", upstreamMarkdown);
  const sourceCandidates = parseRedditLifeCandidates(upstreamMarkdown);
  const selection = await selectRedditLifeWechatCandidates({
    candidates: sourceCandidates,
    date,
    model,
    promptDir: promptDir || path.join(repo, "prompts/blog"),
    artifactsDir,
  });
  const candidates = rankedRedditLifeCandidates(sourceCandidates, selection);
  const candidateVolumes = splitRedditLifeWechatCandidates(candidates);
  const selectionRankBySourceRank = new Map(candidates.map((candidate, index) => [candidate.rank, index + 1]));
  // 凑满十帖时两篇交错分配，避免第二篇只有低优先级题目；不足十帖就保留为一篇。
  // 每帖保留几条仍由 fitWechatContentLimit 按渲染长度决定，每篇各自二分。
  // 两卷共用这一个地址：它是「阅读原文」的落点，不是身份。身份走 syncId。
  const articleUrl = redditLifeArticleUrl(lifeArticlePath);
  const footer = redditLifeWechatFooter(articleUrl);
  writeStderr(
    `[reddit-life-wechat] archive=${date}: upstream=${lifeArticlePath}, candidates=${sourceCandidates.length}, selected=${candidates.length}, source_ranks=${candidates.map(item => item.rank).join(",")}`,
  );
  const dayDir = path.join(ROOT_REL, date);
  const rawSources = { upstreamLifeMarkdown: path.join(dayDir, "upstream-life.md") };
  ensureDir(path.join(repo, dayDir));

  const postsBySourceRank = new Map<number, Entry>();
  const generatedPaths: string[] = [];
  for (const [index, slice] of candidateVolumes.entries()) {
    const volume = REDDIT_LIFE_WECHAT_VOLUMES[index];
    if (!volume) throw new Error(`Reddit life WeChat has no volume for split ${index + 1}`);
    const label = `${volume} posts=${slice.length}`;
    // 文件名按本卷首题的 AI 排名编号；postId 保证即使首帖变化也能直接追溯来源。
    const firstSelectionRank = selectionRankBySourceRank.get(slice[0].rank);
    if (!firstSelectionRank) throw new Error(`Reddit life WeChat split lost selection rank for source rank ${slice[0].rank}`);
    const relPath = path.join(dayDir, `${String(firstSelectionRank).padStart(2, "0")}-${slice[0].postId}.md`);
    const target = path.join(repo, relPath);
    ensureDir(path.dirname(target));
    // 标题主打本卷选后第一帖；原文章摘要只描述原榜第一帖，重排后不能再复用。
    const description = slice.map(item => item.title).join("；");
    const digest = { headline: slice[0].title, description };
    writeStderr(`[reddit-life-wechat] ${label}: headline=${digest.headline}`);
    // 封面先落盘再写稿：ogImage 只有在图确实存在时才敢写，否则 astro-wechat 解析不到文件会直接报错，
    // 那比回落到 defaultCover 糟得多。渲染失败返回 null，稿子照常出，只是没有专属封面。
    const coverFile = redditLifeWechatCoverFile(index + 1);
    const cover = await renderRedditLifeWechatCover(slice.map(item => item.title), REDDIT_LIFE_WECHAT_TITLE_BRAND);
    if (cover) {
      fs.writeFileSync(path.join(path.dirname(target), coverFile), cover);
      writeStderr(`[reddit-life-wechat] ${label}: rendered ${coverFile} (${cover.length} bytes)`);
    }
    // 页脚卡片无条件引用 qr.png，所以开着二维码时这张图必须存在，失败就得让整次归档失败——
    // 写出一篇引用了不存在资源的稿子，只会把问题推到发布那一步才炸。两卷共用同一张。
    if (REDDIT_LIFE_WECHAT_SHOW_QR && !fs.existsSync(path.join(path.dirname(target), REDDIT_LIFE_WECHAT_QR_FILE))) {
      const qr = await renderQrPng(articleUrl);
      fs.writeFileSync(path.join(path.dirname(target), REDDIT_LIFE_WECHAT_QR_FILE), qr);
      writeStderr(`[reddit-life-wechat] ${label}: rendered ${REDDIT_LIFE_WECHAT_QR_FILE} (${qr.length} bytes)`);
    }
    const markdown = await fitWithOptionalCover({ candidates: slice, digest, date, volume, articleUrl, footer, coverFile: cover ? coverFile : "", repo, label, probeDir: path.dirname(target) });
    fs.writeFileSync(target, markdown, "utf8");
    writeStderr(`[reddit-life-wechat] ${label}: generated ${relPath} (${markdown.length} chars)`);
    const contentSha256 = markdownSha256(markdown);
    generatedPaths.push(relPath);
    // 同一卷的五帖各留一条 Entry 但共享同一个 path：manifest 要记清楚每篇稿子收录了哪几帖，
    // 而稿子一卷只有一份。发布前按 path 去重。
    for (const { body: _body, rank: sourceRank, ...facts } of slice) {
      const selectionRank = selectionRankBySourceRank.get(sourceRank);
      if (!selectionRank) throw new Error(`Reddit life WeChat split lost selection rank for source rank ${sourceRank}`);
      postsBySourceRank.set(sourceRank, {
        ...facts,
        sourceRank,
        selectionRank,
        status: "generated" as const,
        path: relPath,
        contentSha256,
        volume,
      });
    }
  }
  // 审计记录仍按 AI 的总排序写入，卷次只描述最终发布去向，不能反过来篡改选择结果的顺序。
  const posts = candidates.map(candidate => {
    const post = postsBySourceRank.get(candidate.rank);
    if (!post) throw new Error(`Reddit life WeChat split did not generate source rank ${candidate.rank}`);
    return post;
  });
  const manifest: RedditLifeRunManifest = {
    version: MANIFEST_VERSION,
    archiveDate: date,
    timeZone: "America/Los_Angeles",
    status: "processed",
    upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath },
    rawSources,
    selection: { model, candidateCount: sourceCandidates.length, ...selection },
    posts,
  };
  fs.writeFileSync(path.join(repo, rawSources.upstreamLifeMarkdown), upstreamMarkdown, "utf8");
  writeJson(manifestFile, manifest);
  writeStderr(`[reddit-life-wechat] archive=${date}: complete status=${manifest.status} volumes=${generatedPaths.length} posts=${posts.length}`);
  return { manifestPath: manifestRel, generatedPaths, status: manifest.status };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const date = archiveDate(stringArg(args, "date"));
  const result = await generateRedditLifeWechat({
    repo: path.resolve(stringArg(args, "repo", repoRoot())),
    date,
    upstreamSha: stringArg(args, "upstream-sha", process.env.UPSTREAM_GENERATED_SHA || ""),
    workflowRun: stringArg(args, "upstream-workflow-run", process.env.UPSTREAM_WORKFLOW_RUN || ""),
    artifactsDir: path.resolve(stringArg(args, "artifacts-dir", "reddit-life-wechat-artifacts")),
    model: stringArg(args, "model", process.env.AI_MODEL || "gemini-3.7-flash"),
    promptDir: stringArg(args, "prompt-dir"),
    force: booleanArg(args, "force"),
  });
  writeStdout(`${JSON.stringify({ date, ...result })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

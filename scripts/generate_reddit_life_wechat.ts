#!/usr/bin/env tsx
// 独立的 Reddit 人生微信归档编排：不进入 Astro 内容集合，也不重新选择 Reddit 榜单。
// 上游 life 文章的每帖正文已经是逐条故事的有序列表，这里取前五帖、每帖最多前 30 条回答，拼成一篇稿子。
// 整条管线不调模型：标题直接取第一帖，摘要直接取上游 frontmatter 的 description。
// 曾经有一次模型调用把多帖话题串成一个标题，读者一眼看不出在讲什么，因此改回主打第一帖。
// 第一帖标题的长度由上游 parseRedditItemSummary 的 TITLE_MAX_CHARS 守住，这里不必再压。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { dateStringInTimeZone, ensureDir, parseArgs, repoRoot, stringArg, writeStderr, writeStdout } from "./blog_common.ts";
import {
  countDroppableStories,
  dropTrailingStories,
  markdownSha256,
  parseRedditLifeCandidates,
  parseRedditLifeDescription,
  renderRedditLifeWechatMarkdown,
  REDDIT_LIFE_WECHAT_POST_LIMIT,
  REDDIT_LIFE_WECHAT_REPLY_LIMIT,
  REDDIT_LIFE_WECHAT_TITLE_BRAND,
  REDDIT_LIFE_WECHAT_VOLUMES,
  type RedditLifeCandidate,
  type RedditLifeVolume,
} from "./reddit_life_wechat_compose.ts";
import { redditLifeWechatCoverFile, renderRedditLifeWechatCover } from "./reddit_life_wechat_cover.ts";
import { taskPostRelPath } from "./blog_tasks.ts";

const ROOT_REL = "data/reddit-life-wechat";
const MANIFEST_VERSION = 1;

type Entry = Omit<RedditLifeCandidate, "body"> & {
  status: "generated" | "content-skipped";
  path?: string;
  contentSha256?: string;
  reason?: string;
  // 标题里的期号。写进 manifest 才能让重跑复用同一个号，而不是重新分配一个。
  // 引入期号之前归档的 manifest 没有这个字段，因此保持可选。
  issue?: number;
  // 这一帖被分到哪一卷。同期号下三卷各一篇稿子，卷次同样要能被重跑复用。
  // 分卷之前的归档没有这个字段，理由同 issue。
  volume?: RedditLifeVolume;
};

export type RedditLifeRunManifest = {
  version: 1;
  archiveDate: string;
  timeZone: "America/Los_Angeles";
  status: "processed" | "upstream-empty";
  upstream: { generatedSha: string; workflowRun: string; lifeArticlePath: string };
  rawSources?: { upstreamLifeMarkdown: string };
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
    value.version !== MANIFEST_VERSION ||
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
  for (const [index, post] of value.posts.entries()) {
    if (
      !post ||
      post.rank !== index + 1 ||
      !post.postId ||
      !post.title ||
      !post.subreddit ||
      !post.permalink ||
      !["generated", "content-skipped"].includes(post.status) ||
      (post.status === "generated" && (!post.path || !post.contentSha256 || !post.issue))
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
  issue,
  volume,
  coverFile,
  repo,
  label,
  probeDir,
}: {
  candidates: RedditLifeCandidate[];
  digest: { headline: string; description: string };
  date: string;
  issue: number;
  volume: RedditLifeVolume;
  coverFile: string;
  repo: string;
  label: string;
  probeDir: string;
}): Promise<string> {
  const render = (cover: string) => (replyLimit: number) =>
    renderRedditLifeWechatMarkdown({ candidates, headline: digest.headline, description: digest.description, archiveDate: date, issue, volume, coverFile: cover, replyLimit });
  try {
    return await fitWechatContentLimit(render(coverFile), repo, label, probeDir);
  } catch (error) {
    if (!coverFile) throw error;
    writeStderr(`WARN: [reddit-life-wechat] ${label}: dropping the cover after ${error instanceof Error ? error.message : String(error)}`);
    return fitWechatContentLimit(render(""), repo, label, probeDir);
  }
}

// 期号一次分配、写进 manifest，之后永不重算。跨天的下一个号从已归档 manifest 里的最大值往后接：
// 归档本来就提交在仓库里，不必再为一个计数器单开一份账本。
// 这里刻意不走 loadRedditLifeRunManifest 的严格校验：期号早于当前 manifest 契约，引入它之前的归档
// 缺 issue、缺 contentSha256，按今天的 schema 全是非法的。拿当前契约去审判历史归档，会让一次取号
// 被一份三天前的文件挡下来。读不动的目录跳过即可，它顶多让号少涨一次。
function nextRedditLifeIssue(repo: string): number {
  const root = path.join(repo, ROOT_REL);
  if (!fs.existsSync(root)) return 1;
  let max = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "run.json");
    if (!fs.existsSync(file)) continue;
    try {
      const posts = (JSON.parse(fs.readFileSync(file, "utf8")) as { posts?: { issue?: unknown }[] }).posts || [];
      for (const post of posts) {
        if (typeof post?.issue === "number" && Number.isInteger(post.issue)) max = Math.max(max, post.issue);
      }
    } catch {
      writeStderr(`WARN: [reddit-life-wechat] ignoring unreadable manifest while numbering issues: ${file}`);
    }
  }
  return max + 1;
}

export async function generateRedditLifeWechat({
  repo = repoRoot(),
  date,
  upstreamSha,
  workflowRun = "",
  artifactsDir = "",
}: {
  repo?: string;
  date: string;
  upstreamSha: string;
  workflowRun?: string;
  artifactsDir?: string;
}): Promise<{ manifestPath: string; generatedPaths: string[]; status: RedditLifeRunManifest["status"] }> {
  if (!upstreamSha) throw new Error("--upstream-sha is required; Reddit life WeChat must read the committed parent handoff");
  if (!/^\d+$/.test(workflowRun)) throw new Error("--upstream-workflow-run is required and must be a GitHub Actions run ID");
  upstreamSha = assertCommittedHandoff(repo, upstreamSha);
  const manifestRel = runRelPath(date);
  const manifestFile = path.join(repo, manifestRel);
  assertCommittedPath(repo, manifestRel);
  const existing = loadRedditLifeRunManifest(manifestFile);
  if (existing) {
    const generated = existing.posts.filter(post => post.status === "generated");
    writeStderr(`[reddit-life-wechat] archive=${date}: reused manifest (${existing.status}), posts=${generated.length}`);
    // 收录的每一帖共享同一个 path，去重后才是「要发布几篇稿子」。
    return { manifestPath: manifestRel, generatedPaths: [...new Set(generated.map(post => post.path!).filter(Boolean))], status: existing.status };
  }
  const lifeArticlePath = taskPostRelPath("reddit-top20", date.replace(/$/, "-life"));
  assertCommittedPath(repo, lifeArticlePath);
  const upstreamFile = path.join(repo, lifeArticlePath);
  if (!fs.existsSync(upstreamFile)) {
    const manifest: RedditLifeRunManifest = { version: 1, archiveDate: date, timeZone: "America/Los_Angeles", status: "upstream-empty", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, posts: [] };
    writeJson(manifestFile, manifest);
    writeStderr(`[reddit-life-wechat] archive=${date}: upstream life article missing at ${lifeArticlePath}; wrote upstream-empty manifest`);
    return { manifestPath: manifestRel, generatedPaths: [], status: manifest.status };
  }
  const upstreamMarkdown = fs.readFileSync(upstreamFile, "utf8");
  writeArtifact(artifactsDir, "upstream-life.md", upstreamMarkdown);
  // 上游有 30 帖，这里取前 15 帖，分成上中下三卷各五帖；每帖保留几条由 fitWechatContentLimit
  // 按渲染长度定，上界 REPLY_LIMIT，每卷各自二分。
  const candidates = parseRedditLifeCandidates(upstreamMarkdown);
  const upstreamDescription = parseRedditLifeDescription(upstreamMarkdown);
  const issue = nextRedditLifeIssue(repo);
  writeStderr(`[reddit-life-wechat] archive=${date}: upstream=${lifeArticlePath}, posts=${candidates.length} issue=${issue}, ranks=${candidates.map(item => item.postId).join(",")}`);
  const dayDir = path.join(ROOT_REL, date);
  const rawSources = { upstreamLifeMarkdown: path.join(dayDir, "upstream-life.md") };
  ensureDir(path.join(repo, dayDir));

  const posts: Entry[] = [];
  const generatedPaths: string[] = [];
  for (const [index, volume] of REDDIT_LIFE_WECHAT_VOLUMES.entries()) {
    const slice = candidates.slice(index * REDDIT_LIFE_WECHAT_POST_LIMIT, (index + 1) * REDDIT_LIFE_WECHAT_POST_LIMIT);
    // 上游不足 15 帖时后面的卷就是空的。少推一卷，而不是硬凑或整次失败。
    if (!slice.length) break;
    const label = `issue=${issue} ${volume} posts=${slice.length}`;
    // 文件名带本卷首帖的全局排名，三卷因此天然不同名，也一眼看得出收录的是第几帖起。
    const relPath = path.join(dayDir, `${String(slice[0].rank).padStart(2, "0")}-${slice[0].postId}.md`);
    const target = path.join(repo, relPath);
    ensureDir(path.dirname(target));
    // 标题主打本卷第一帖。摘要只有第一卷能拿到上游那句现成的（它本来就是第 1 帖的一句话描述），
    // 后两卷上游没有对应的句子，退而列出本卷收录的标题——比套用一句描述别帖的话诚实。
    const description = index === 0 ? upstreamDescription : slice.map(item => item.title).join("；");
    const digest = { headline: slice[0].title, description };
    writeStderr(`[reddit-life-wechat] ${label}: headline=${digest.headline}`);
    // 封面先落盘再写稿：ogImage 只有在图确实存在时才敢写，否则 astro-wechat 解析不到文件会直接报错，
    // 那比回落到 defaultCover 糟得多。渲染失败返回 null，稿子照常出，只是没有专属封面。
    const coverFile = redditLifeWechatCoverFile(index + 1);
    const cover = await renderRedditLifeWechatCover(slice.map(item => item.title), REDDIT_LIFE_WECHAT_TITLE_BRAND, issue, volume);
    if (cover) {
      fs.writeFileSync(path.join(path.dirname(target), coverFile), cover);
      writeStderr(`[reddit-life-wechat] ${label}: rendered ${coverFile} (${cover.length} bytes)`);
    }
    const markdown = await fitWithOptionalCover({ candidates: slice, digest, date, issue, volume, coverFile: cover ? coverFile : "", repo, label, probeDir: path.dirname(target) });
    fs.writeFileSync(target, markdown, "utf8");
    writeStderr(`[reddit-life-wechat] ${label}: generated ${relPath} (${markdown.length} chars)`);
    const contentSha256 = markdownSha256(markdown);
    generatedPaths.push(relPath);
    // 同一卷的五帖各留一条 Entry 但共享同一个 path：manifest 要记清楚每篇稿子收录了哪几帖，
    // 而稿子一卷只有一份。发布前按 path 去重。
    posts.push(...slice.map(({ body: _body, ...facts }) => ({ ...facts, status: "generated" as const, path: relPath, contentSha256, issue, volume })));
  }
  const manifest: RedditLifeRunManifest = { version: 1, archiveDate: date, timeZone: "America/Los_Angeles", status: "processed", upstream: { generatedSha: upstreamSha, workflowRun, lifeArticlePath }, rawSources, posts };
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
  });
  writeStdout(`${JSON.stringify({ date, ...result })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    writeStderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

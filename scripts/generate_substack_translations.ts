#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  booleanArg,
  ensureDir,
  parseArgs,
  repoRoot,
  stringArg,
  writeStdout,
} from "./blog_common.ts";
import {
  callBlogAiWithFailover,
  envAiConfig,
  envFallbackAiConfig,
} from "./blog_ai_client.ts";
import { archiveSubstackTranslation } from "./substack_archive.ts";
import {
  buildTranslationPrompt,
  estimateTranslationTokens,
  parseAiJson,
  prepareArticle,
  SUBSTACK_PROMPT_VERSION,
  validateAndRestoreTranslation,
} from "./substack_content.ts";
import {
  fetchNewsletterFeed,
  type SubstackFeedItem,
} from "./substack_feed.ts";
import { processArticleImages } from "./substack_image.ts";
import {
  findSubstackIssue,
  readSubstackLedger,
  substackLedgerRelPath,
  upsertSubstackIssue,
} from "./substack_ledger.ts";
import {
  compilePatterns,
  publicationsForInput,
} from "./substack_publications.ts";
import {
  SUBSTACK_LIMITS,
  type NewsletterPublication,
  type TokenUsage,
  type TranslationResponse,
} from "./substack_contracts.ts";

type ItemResult = {
  publication: string;
  canonicalUrl: string;
  wechat: { enabled: boolean };
  status: "published" | "dry-run" | "skipped" | "failed";
  reason?: string;
  postPath?: string;
  sourceSha256?: string;
  cache?: "hit" | "miss" | "disabled";
  model?: string;
  finishReason?: string;
  estimatedTokens?: number;
  usage?: TokenUsage;
  warning?: string;
};

type CachedTranslation = {
  version: 1;
  response: TranslationResponse;
  model: string;
  finishReason: string;
  usage?: TokenUsage;
};

function positiveInt(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer`);
  return value;
}

function validateTrustedUrl(raw: string, hosts: readonly string[]): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(`untrusted article URL: ${raw}`);
  if (
    !hosts.map(host => host.toLowerCase()).includes(url.hostname.toLowerCase())
  )
    throw new Error(`article host is not allowed: ${url.hostname}`);
  return url;
}

// 去重主键靠这一步归一。Substack 的 <link> 常带 ?r=<推荐码>、?showWelcome，feedburner 侧几乎必带
// utm_*；同一篇文章两次抓到的参数不同，按原样比对就会漏判成新文章，重新翻译并再发一篇。
const TRACKING_PARAMS =
  /^(?:utm_.+|r|ref|referrer|share|si|fbclid|gclid|mc_cid|mc_eid|triedRedirect|showWelcome|isFreemail|post_id|publication_id|_bhlid)$/i;

export function normalizeCanonicalUrl(
  raw: string,
  hosts: readonly string[]
): string {
  const url = validateTrustedUrl(raw, hosts);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

function selectItems(
  items: readonly SubstackFeedItem[],
  publication: NewsletterPublication,
  ledgerFile: string,
  options: { force: boolean; backfill?: number; maxPosts?: number }
): SubstackFeedItem[] {
  const ledger = readSubstackLedger(ledgerFile);
  const excludes = compilePatterns(publication.excludeTitlePatterns);
  const normalized = items
    .map(item => ({
      ...item,
      canonicalUrl: normalizeCanonicalUrl(
        item.canonicalUrl,
        publication.articleHosts
      ),
    }))
    .filter(item => !excludes.some(pattern => pattern.test(item.title)))
    .filter(
      item =>
        options.backfill !== undefined ||
        item.publishedAt.slice(0, 10) >= publication.startAt
    )
    .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt));
  const windowed =
    options.backfill === undefined
      ? normalized
      : normalized.slice(-options.backfill);
  const unpublished = windowed.filter(
    item => options.force || !findSubstackIssue(ledger, item.canonicalUrl)
  );
  // 定时任务按常量走一篇；手动运行可以用 --max-posts 放大，但不越过硬顶。
  return unpublished.slice(
    0,
    options.maxPosts ?? SUBSTACK_LIMITS.maxPostsPerRun
  );
}

function cachePath(repo: string, publication: string, key: string): string {
  return path.join(
    repo,
    ".cache",
    "substack-translations",
    publication,
    `${key}.json`
  );
}

function readCache(file: string): CachedTranslation | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(file, "utf8")
    ) as CachedTranslation;
    if (
      parsed.version !== 1 ||
      !parsed.response ||
      !parsed.model ||
      !parsed.finishReason
    )
      return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function artifactDir(
  repo: string,
  root: string,
  publication: string,
  sourceSha256: string
): string {
  const base = path.isAbsolute(root) ? root : path.join(repo, root);
  return path.join(base, "substack", publication, sourceSha256.slice(0, 16));
}

function usedTokens(usage: TokenUsage | undefined, estimate: number): number {
  return (
    usage?.totalTokens ??
    ((usage?.inputTokens || 0) + (usage?.outputTokens || 0) || estimate)
  );
}

async function processItem(params: {
  repo: string;
  publication: NewsletterPublication;
  item: SubstackFeedItem;
  promptInstructions: string;
  artifactsRoot: string;
  dryRun: boolean;
  force: boolean;
  remainingBudget: number;
}): Promise<{ result: ItemResult; chargedTokens: number }> {
  const { repo, publication, item } = params;
  const baseResult = {
    publication: publication.key,
    canonicalUrl: item.canonicalUrl,
    wechat: { enabled: publication.wechat.enabled },
  };
  const prepared = prepareArticle(
    item.contentHtml,
    item.canonicalUrl,
    publication
  );
  const estimatedTokens = estimateTranslationTokens(prepared.blocks);
  const dir = artifactDir(
    repo,
    params.artifactsRoot,
    publication.key,
    prepared.sourceSha256
  );
  writeJson(path.join(dir, "feed-item.json"), {
    ...item,
    contentHtml: undefined,
  });
  fs.writeFileSync(path.join(dir, "source.html"), item.contentHtml, "utf8");
  fs.writeFileSync(
    path.join(dir, "cleaned.html"),
    prepared.cleanedHtml,
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "extracted.md"), prepared.markdown, "utf8");
  writeJson(path.join(dir, "extraction-audit.json"), prepared.audit);
  writeJson(path.join(dir, "cleaned-blocks.json"), prepared.blocks);
  // 阈值已经不在栏目配置里，单独快照一份，否则事后排查看不到本次实际生效的上限。
  writeJson(path.join(dir, "effective-config.json"), {
    publication,
    limits: SUBSTACK_LIMITS,
  });

  if (estimatedTokens > SUBSTACK_LIMITS.maxEstimatedTokensPerArticle) {
    throw new Error(
      `article-token-limit: estimated ${estimatedTokens}, limit ${SUBSTACK_LIMITS.maxEstimatedTokensPerArticle}`
    );
  }
  if (params.dryRun) {
    if (estimatedTokens > params.remainingBudget) {
      throw new Error(
        `publication-token-budget-exhausted: needs ${estimatedTokens}, remaining ${params.remainingBudget}`
      );
    }
    return {
      result: {
        ...baseResult,
        status: "dry-run",
        sourceSha256: prepared.sourceSha256,
        estimatedTokens,
        cache: "disabled",
      },
      chargedTokens: 0,
    };
  }

  const primary = envAiConfig();
  const fallback = envFallbackAiConfig();
  const prompt = buildTranslationPrompt({
    publication,
    sourceTitle: item.title,
    sourceAuthor: item.author,
    canonicalUrl: item.canonicalUrl,
    blocks: prepared.blocks,
    instructions: params.promptInstructions,
  });
  fs.writeFileSync(path.join(dir, "prompt.md"), prompt, "utf8");
  const inputSha = createHash("sha256").update(prompt).digest("hex");
  const key = createHash("sha256")
    .update(
      [
        prepared.sourceSha256,
        SUBSTACK_PROMPT_VERSION,
        primary.model,
        fallback.model,
        inputSha,
      ].join("\0")
    )
    .digest("hex");
  const articleCachePath = cachePath(repo, publication.key, key);
  let cached = params.force ? undefined : readCache(articleCachePath);
  let translated: ReturnType<typeof validateAndRestoreTranslation> | undefined;
  if (cached) {
    try {
      if (cached.finishReason !== "stop")
        throw new Error(
          `cached AI finishReason was ${cached.finishReason}, expected stop`
        );
      translated = validateAndRestoreTranslation(
        cached.response,
        prepared.blocks,
        publication
      );
    } catch {
      fs.unlinkSync(articleCachePath);
      cached = undefined;
    }
  }
  const fallbackRequested = process.env.AI_FALLBACK_ENABLED === "true";
  const fallbackEnabled =
    fallbackRequested && estimatedTokens * 2 <= params.remainingBudget;
  const reservedTokens = estimatedTokens * (fallbackEnabled ? 2 : 1);
  if (!cached && reservedTokens > params.remainingBudget) {
    throw new Error(
      `publication-token-budget-exhausted: needs ${reservedTokens}, remaining ${params.remainingBudget}`
    );
  }
  let cache: ItemResult["cache"] = cached ? "hit" : "miss";
  let model: string;
  let finishReason: string;
  let usage: TokenUsage | undefined;
  let rawResponse: TranslationResponse;

  if (cached) {
    ({ model, finishReason, usage, response: rawResponse } = cached);
  } else {
    const ai = await callBlogAiWithFailover({
      prompt,
      primaryConfig: primary,
      fallbackConfig: fallback,
      jsonMode: true,
      fallbackEnabled,
    });
    model = ai.config.model;
    finishReason = ai.finishReason || "unknown";
    usage = ai.usage;
    if (finishReason !== "stop")
      throw new Error(`AI finishReason was ${finishReason}, expected stop`);
    rawResponse = parseAiJson(ai.content) as TranslationResponse;
  }
  if (finishReason !== "stop")
    throw new Error(
      `cached AI finishReason was ${finishReason}, expected stop`
    );
  translated ||= validateAndRestoreTranslation(
    rawResponse,
    prepared.blocks,
    publication
  );
  if (!cached)
    writeJson(articleCachePath, {
      version: 1,
      response: rawResponse,
      model,
      finishReason,
      usage,
    } satisfies CachedTranslation);
  writeJson(path.join(dir, "response.json"), rawResponse);
  writeJson(path.join(dir, "usage.json"), {
    model,
    finishReason,
    estimatedTokens,
    usage,
  });
  const images = await processArticleImages(
    translated.markdown,
    publication,
    repo
  );
  const archived = archiveSubstackTranslation({
    repo,
    publication,
    sourceTitle: item.title,
    sourceAuthor: item.author,
    canonicalUrl: item.canonicalUrl,
    sourcePublishedAt: item.publishedAt,
    translatedTitle: translated.title,
    description: translated.description,
    markdown: images.markdown,
    firstImage: images.firstImage,
    model,
  });
  fs.copyFileSync(
    path.join(repo, archived.postPath),
    path.join(dir, "composed.md")
  );
  upsertSubstackIssue(path.join(repo, substackLedgerRelPath(publication.key)), {
    guid: item.guid,
    canonicalUrl: item.canonicalUrl,
    sourcePublishedAt: item.publishedAt,
    sourceSha256: prepared.sourceSha256,
    status: "published",
    postPath: archived.postPath,
    translatedAt: new Date().toISOString(),
    model,
    usage,
  });
  return {
    result: {
      ...baseResult,
      status: "published",
      postPath: archived.postPath,
      sourceSha256: prepared.sourceSha256,
      cache,
      model,
      finishReason,
      estimatedTokens,
      usage,
      warning: translated.warning,
    },
    chargedTokens: cached ? 0 : usedTokens(usage, estimatedTokens),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const repo = repoRoot();
  const publicationInput = stringArg(args, "publication", "all");
  const dryRun = booleanArg(args, "dry-run");
  const force = booleanArg(args, "force");
  const backfillRaw = stringArg(args, "backfill");
  const maxPostsRaw = stringArg(args, "max-posts");
  const budgetRaw = stringArg(args, "token-budget");
  const publicationTokenBudget = budgetRaw
    ? Math.min(
        positiveInt(budgetRaw, "--token-budget"),
        SUBSTACK_LIMITS.publicationTokenBudget
      )
    : SUBSTACK_LIMITS.publicationTokenBudget;
  const backfill = backfillRaw
    ? positiveInt(backfillRaw, "--backfill")
    : undefined;
  const maxPosts = maxPostsRaw
    ? Math.min(
        positiveInt(maxPostsRaw, "--max-posts"),
        SUBSTACK_LIMITS.maxPostsPerRunCeiling
      )
    : undefined;
  const artifactsRoot = stringArg(args, "artifacts-dir", "artifacts");
  const resultJson = stringArg(args, "result-json");
  const promptInstructions = fs.readFileSync(
    path.join(repo, "prompts", "blog", "substack-translation.md"),
    "utf8"
  );
  const results: ItemResult[] = [];
  let chargedTokens = 0;

  for (const publication of publicationsForInput(publicationInput)) {
    let publicationChargedTokens = 0;
    try {
      const parsed = await fetchNewsletterFeed(publication);
      process.stderr.write(
        `[substack] ${publication.key} feed transport=${parsed.transport}\n`
      );
      const items = selectItems(
        parsed.items,
        publication,
        path.join(repo, substackLedgerRelPath(publication.key)),
        { force, backfill, maxPosts }
      );
      for (const item of items) {
        try {
          const processed = await processItem({
            repo,
            publication,
            item,
            promptInstructions,
            artifactsRoot,
            dryRun,
            force,
            remainingBudget: publicationTokenBudget - publicationChargedTokens,
          });
          results.push(processed.result);
          publicationChargedTokens += processed.chargedTokens;
          chargedTokens += processed.chargedTokens;
          process.stderr.write(
            `[substack] ${publication.key} ${processed.result.status} estimated=${processed.result.estimatedTokens} actual=${processed.chargedTokens} publicationCharged=${publicationChargedTokens}/${publicationTokenBudget}\n`
          );
        } catch (error) {
          results.push({
            publication: publication.key,
            canonicalUrl: item.canonicalUrl,
            wechat: { enabled: publication.wechat.enabled },
            status: "failed",
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (!items.length)
        results.push({
          publication: publication.key,
          canonicalUrl: publication.siteUrl,
          wechat: { enabled: publication.wechat.enabled },
          status: "skipped",
          reason: "no eligible unpublished items",
        });
    } catch (error) {
      results.push({
        publication: publication.key,
        canonicalUrl: publication.siteUrl,
        wechat: { enabled: publication.wechat.enabled },
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const payload = {
    task: "substack-translation",
    status: results.some(result => result.status === "failed")
      ? "partial-failure"
      : "ok",
    dryRun,
    publicationTokenBudget,
    chargedTokens,
    results,
  };
  if (resultJson)
    writeJson(
      path.isAbsolute(resultJson) ? resultJson : path.join(repo, resultJson),
      payload
    );
  writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
  if (payload.status !== "ok") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

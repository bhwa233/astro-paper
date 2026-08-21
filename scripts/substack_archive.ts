import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import slugify from "slugify";
import { AUTHOR, ensureDir } from "./blog_common.ts";
import { SUBSTACK_PROMPT_VERSION } from "./substack_content.ts";
import type { NewsletterPublication } from "./substack_contracts.ts";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function sourceSlug(canonicalUrl: string, sourceTitle: string): string {
  const pathname = new URL(canonicalUrl).pathname.replace(/\/$/, "");
  const last = decodeURIComponent(
    pathname.split("/").filter(Boolean).at(-1) || ""
  );
  const slug = slugify(last || sourceTitle, {
    lower: true,
    strict: true,
    trim: true,
  });
  return (
    slug || createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 12)
  );
}

export function archiveSubstackTranslation(params: {
  repo: string;
  publication: NewsletterPublication;
  sourceTitle: string;
  sourceAuthor: string;
  canonicalUrl: string;
  sourcePublishedAt: string;
  translatedTitle: string;
  description: string;
  markdown: string;
  model: string;
  translatedAt?: string;
}): { postPath: string; title: string } {
  const translatedAt = params.translatedAt || new Date().toISOString();
  const date = params.sourcePublishedAt.slice(0, 10);
  const prefix = `${params.publication.key}-${date.replaceAll("-", "")}-${sourceSlug(params.canonicalUrl, params.sourceTitle)}`;
  let filename = `${prefix}.md`;
  let relative = path.join("src", "content", "posts", "zh-cn", filename);
  let absolute = path.join(params.repo, relative);
  if (
    fs.existsSync(absolute) &&
    !fs
      .readFileSync(absolute, "utf8")
      .includes(`  url: ${yamlString(params.canonicalUrl)}`)
  ) {
    const identity = createHash("sha256")
      .update(params.canonicalUrl)
      .digest("hex")
      .slice(0, 8);
    filename = `${prefix}-${identity}.md`;
    relative = path.join("src", "content", "posts", "zh-cn", filename);
    absolute = path.join(params.repo, relative);
  }
  const title = `${params.translatedTitle}｜${params.publication.displayName}`;
  const authorization = params.publication.authorizedTranslation
    ? "经授权翻译"
    : "中文翻译";
  const lines = [
    "---",
    `author: ${AUTHOR}`,
    `pubDatetime: ${params.sourcePublishedAt}`,
    `modDatetime: ${translatedAt}`,
    `title: ${yamlString(title)}`,
    "featured: false",
    "draft: false",
    "tags:",
    "  - 海外长文",
    `  - ${yamlString(params.publication.tag)}`,
    `description: ${yamlString(params.description)}`,
    "timezone: Asia/Shanghai",
    "source:",
    `  title: ${yamlString(params.sourceTitle)}`,
    `  author: ${yamlString(params.sourceAuthor)}`,
    `  publication: ${yamlString(params.publication.displayName)}`,
    `  url: ${yamlString(params.canonicalUrl)}`,
    `  publishedAt: ${params.sourcePublishedAt}`,
    "translation:",
    "  language: zh-CN",
    `  model: ${yamlString(params.model)}`,
    `  promptVersion: ${SUBSTACK_PROMPT_VERSION}`,
    `  translatedAt: ${translatedAt}`,
    `  authorized: ${params.publication.authorizedTranslation}`,
    "---",
    "",
    `> 原文：[${params.sourceTitle}](${params.canonicalUrl})`,
    `> 原作者：${params.sourceAuthor} · ${params.publication.displayName} · ${date}`,
    `> ${authorization}；版权归原作者所有。`,
    "",
    params.markdown.trim(),
    "",
  ];
  ensureDir(path.dirname(absolute));
  fs.writeFileSync(absolute, lines.join("\n"), "utf8");
  return { postPath: relative.split(path.sep).join("/"), title };
}

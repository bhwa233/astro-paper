import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import slugify from "slugify";
import { AUTHOR, ensureDir } from "./blog_common.ts";
import { SUBSTACK_PROMPT_VERSION } from "./substack_content.ts";
import type { NewsletterPublication } from "./substack_contracts.ts";
import type { TagCategory } from "../src/utils/tagCategories.ts";

/** 标注成 TagCategory 而不是 string：分类集合改了这里会编译失败，而不是安静写出一个孤儿标签。 */
const READING_CATEGORY: TagCategory = "阅读";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function sourceSlug(canonicalUrl: string, sourceTitle: string): string {
  const pathname = new URL(canonicalUrl).pathname.replace(/\/$/, "");
  const last = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
  const slug = slugify(last || sourceTitle, {
    lower: true,
    strict: true,
    trim: true,
  });
  return slug || createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 12);
}

function sourceDate(canonicalUrl: string, publishedAt: string): string {
  const pathDate = new URL(canonicalUrl).pathname.match(/\/(20\d{2})\/(0[1-9]|1[0-2])\/([0-2]\d|3[01])(?:\/|$)/);
  return pathDate ? `${pathDate[1]}-${pathDate[2]}-${pathDate[3]}` : publishedAt.slice(0, 10);
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
  firstImage?: string;
  model: string;
  translatedAt?: string;
}): { postPath: string; title: string } {
  const translatedAt = params.translatedAt || new Date().toISOString();
  const date = sourceDate(params.canonicalUrl, params.sourcePublishedAt);
  const prefix = `${params.publication.key}-${date.replaceAll("-", "")}-${sourceSlug(params.canonicalUrl, params.sourceTitle)}`;
  let filename = `${prefix}.md`;
  let relative = path.join("src", "content", "posts", "zh-cn", filename);
  let absolute = path.join(params.repo, relative);
  if (fs.existsSync(absolute) && !fs.readFileSync(absolute, "utf8").includes(`  url: ${yamlString(params.canonicalUrl)}`)) {
    const identity = createHash("sha256").update(params.canonicalUrl).digest("hex").slice(0, 8);
    filename = `${prefix}-${identity}.md`;
    relative = path.join("src", "content", "posts", "zh-cn", filename);
    absolute = path.join(params.repo, relative);
  }
  const title = params.translatedTitle;
  const authorization = params.publication.authorizedTranslation ? "经授权翻译" : "中文翻译";
  const wechat = params.publication.wechat;
  if (wechat.enabled && wechat.cover === "first-image" && !params.firstImage) {
    throw new Error(`${params.publication.key} requires a first article image for its WeChat cover`);
  }
  const wechatLines = wechat.enabled
    ? ["wechat:", "  enabled: true", ...(wechat.cover === "first-image" ? [`  cover: ${yamlString(params.firstImage!)}`] : [])]
    : [];
  const lines = [
    "---",
    `author: ${AUTHOR}`,
    `pubDatetime: ${params.sourcePublishedAt}`,
    `modDatetime: ${translatedAt}`,
    `title: ${yamlString(title)}`,
    "featured: false",
    "draft: false",
    "tags:",
    // 两层标签：分类在前、栏目在后，和 blog_tasks.ts 的 taskTags() 同一形状。
    // 这里的栏目位是刊名，所以译文天然按刊物可筛，不需要再挂一个 `海外长文` 之类的中间层。
    `  - ${READING_CATEGORY}`,
    `  - ${yamlString(params.publication.tag)}`,
    ...wechatLines,
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
  const article = lines.join("\n");
  ensureDir(path.dirname(absolute));
  fs.writeFileSync(absolute, article, "utf8");
  return { postPath: relative.split(path.sep).join("/"), title };
}

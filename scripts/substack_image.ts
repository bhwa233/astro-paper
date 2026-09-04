// file-type 的唯一入口。这里只拿它给镜像下来的图片定扩展名，不再判定图片能不能用：
// 主机白名单、体积与像素上限、MIME 核对都已去掉。抓不到的图直接从正文里删掉，不牵连整篇译文。
import { fileTypeFromBuffer } from "file-type";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureDir } from "./blog_common.ts";
import type { NewsletterPublication } from "./substack_contracts.ts";

const IMAGE_MARKDOWN = /!\[[^\]]*\]\((https:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;

function imageMarkdownFor(url: string): RegExp {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`!\[[^\]]*\]\(${escaped}(?:\s+"[^"]*")?\)`, "g");
}

async function downloadImage(url: string): Promise<{ bytes: Buffer; extension: string }> {
  const response = await fetch(url, {
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  const extension = detected?.ext || path.extname(new URL(url).pathname).replace(/^\./, "").toLowerCase() || "jpg";
  return { bytes, extension };
}

export async function processArticleImages(
  markdown: string,
  publication: NewsletterPublication,
  repo: string
): Promise<{
  markdown: string;
  createdFiles: string[];
  firstImage?: string;
  warnings: string[];
}> {
  if (publication.imagePolicy === "none")
    return {
      markdown: markdown.replace(IMAGE_MARKDOWN, ""),
      createdFiles: [],
      warnings: [],
    };
  const urls = [...markdown.matchAll(IMAGE_MARKDOWN)].map(match => match[1]);
  // 直链栏目什么都不下载，也就没有可失败的一步：地址原样留在正文里。
  if (publication.imagePolicy === "remote")
    return {
      markdown,
      createdFiles: [],
      firstImage: urls[0],
      warnings: [],
    };
  const replacements = new Map<string, string>();
  const createdFiles: string[] = [];
  const warnings: string[] = [];
  let output = markdown;
  for (const url of new Set(urls)) {
    try {
      const image = await downloadImage(url);
      const hash = createHash("sha256").update(image.bytes).digest("hex").slice(0, 20);
      const relative = path.join("public", "images", "substack", publication.key, `${hash}.${image.extension}`);
      const absolute = path.join(repo, relative);
      ensureDir(path.dirname(absolute));
      if (!fs.existsSync(absolute)) {
        fs.writeFileSync(absolute, image.bytes);
        createdFiles.push(relative.split(path.sep).join("/"));
      }
      replacements.set(url, `/${path.relative(path.join(repo, "public"), absolute).split(path.sep).join("/")}`);
    } catch (error) {
      // 一张图抓不到就把它从正文里删掉：译文照发，缺图在运行结果里留一条 warning。
      warnings.push(`dropped image ${url}: ${error instanceof Error ? error.message : String(error)}`);
      output = output.replace(imageMarkdownFor(url), "");
    }
  }
  for (const [source, replacement] of replacements) output = output.replaceAll(source, replacement);
  return {
    markdown: output,
    createdFiles,
    firstImage: urls.map(url => replacements.get(url)).find(Boolean),
    warnings,
  };
}

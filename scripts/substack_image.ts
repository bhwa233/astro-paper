// file-type 的唯一入口。HTTP Content-Type 只能作为声明，最终格式以 magic bytes 和 sharp 解码为准。
import { fileTypeFromBuffer } from "file-type";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureDir } from "./blog_common.ts";
import { inspectRaster } from "./image_raster.ts";
import { restrictedFetch } from "./restricted_fetch.ts";
import {
  SUBSTACK_LIMITS,
  type NewsletterPublication,
} from "./substack_contracts.ts";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export async function validateRemoteImage(
  url: string,
  publication: NewsletterPublication
): Promise<{
  bytes: Buffer;
  mime: string;
  extension: string;
  finalUrl: string;
}> {
  const response = await restrictedFetch(url, {
    allowedHosts: publication.imageHosts,
    maxBytes: SUBSTACK_LIMITS.maxImageBytes,
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
  });
  const detected = await fileTypeFromBuffer(response.bytes);
  if (!detected || !ALLOWED_MIME.has(detected.mime))
    throw new Error(`unsupported image bytes from ${url}`);
  if (response.contentType && response.contentType !== detected.mime) {
    throw new Error(
      `image MIME mismatch for ${url}: declared ${response.contentType}, detected ${detected.mime}`
    );
  }
  const metadata = await inspectRaster(response.bytes);
  if (metadata.width * metadata.height > SUBSTACK_LIMITS.maxImagePixels) {
    throw new Error(
      `image exceeds ${SUBSTACK_LIMITS.maxImagePixels} pixels: ${url}`
    );
  }
  return {
    bytes: response.bytes,
    mime: detected.mime,
    extension: detected.ext,
    finalUrl: response.finalUrl,
  };
}

export async function processArticleImages(
  markdown: string,
  publication: NewsletterPublication,
  repo: string
): Promise<{
  markdown: string;
  files: string[];
  createdFiles: string[];
  firstImage?: string;
}> {
  if (publication.imagePolicy === "none")
    return {
      markdown: markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, ""),
      files: [],
      createdFiles: [],
      firstImage: undefined,
    };
  const urls = [
    ...markdown.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g),
  ].map(match => match[1]);
  const replacements = new Map<string, string>();
  const files: string[] = [];
  const createdFiles: string[] = [];
  for (const url of new Set(urls)) {
    const image = await validateRemoteImage(url, publication);
    if (publication.imagePolicy === "remote") {
      replacements.set(url, image.finalUrl);
      continue;
    }
    const hash = createHash("sha256")
      .update(image.bytes)
      .digest("hex")
      .slice(0, 20);
    const relative = path.join(
      "public",
      "images",
      "substack",
      publication.key,
      `${hash}.${image.extension}`
    );
    const absolute = path.join(repo, relative);
    ensureDir(path.dirname(absolute));
    if (!fs.existsSync(absolute)) {
      fs.writeFileSync(absolute, image.bytes);
      createdFiles.push(relative.split(path.sep).join("/"));
    }
    replacements.set(
      url,
      `/${path.relative(path.join(repo, "public"), absolute).split(path.sep).join("/")}`
    );
    files.push(relative.split(path.sep).join("/"));
  }
  let output = markdown;
  for (const [source, replacement] of replacements)
    output = output.replaceAll(source, replacement);
  return {
    markdown: output,
    files,
    createdFiles,
    firstImage: urls[0] ? replacements.get(urls[0]) : undefined,
  };
}

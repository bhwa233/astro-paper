import { createHash } from "node:crypto";

type DigestableEntry = {
  id: string;
  filePath?: string;
  digest?: string | number;
  data?: unknown;
  body?: string;
};

/**
 * Astro requires a scalar cacheKey, while the existing cache helper only
 * stores rendered OG files. No dependency is warranted for this build-time
 * fingerprint; this module is limited to deterministic path cache keys.
 */
export function getStaticPathCacheKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function getContentEntryCacheKey(
  entry: DigestableEntry | undefined
): string {
  if (!entry) return "";

  if (entry.digest !== undefined) {
    return `${entry.id}:${entry.filePath ?? ""}:${entry.digest}`;
  }

  return getStaticPathCacheKey({
    id: entry.id,
    filePath: entry.filePath,
    data: entry.data,
    body: entry.body,
  });
}

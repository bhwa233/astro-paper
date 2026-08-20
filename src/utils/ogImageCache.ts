import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Bump whenever the OG image template markup or the fonts change, so that
 * previously cached PNGs are invalidated and re-rendered on the next build.
 */
export const OG_CACHE_VERSION = 1;

/**
 * Lives inside Astro's default `cacheDir` on purpose. That is the one directory
 * incremental builds ask CI to restore, and Cloudflare Pages' build cache
 * detects it for Astro projects, so the rendered PNGs ride along with both
 * instead of needing a cache entry of their own.
 */
const CACHE_DIR = join(process.cwd(), "node_modules", ".astro", "og");

function keyToPath(keyParts: Record<string, unknown>): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ v: OG_CACHE_VERSION, ...keyParts }))
    .digest("hex")
    .slice(0, 16);
  return join(CACHE_DIR, `${hash}.png`);
}

/**
 * Return a cached OG PNG for the given key parts, or render + persist one.
 *
 * The cache lives on disk under Astro's cache directory and survives across
 * builds, so unchanged posts skip the expensive satori + sharp render. Any
 * filesystem error falls back to a fresh render — the cache never breaks a
 * build.
 */
export async function withOgCache(
  keyParts: Record<string, unknown>,
  render: () => Promise<Buffer>
): Promise<Buffer> {
  let cachePath: string | undefined;

  try {
    cachePath = keyToPath(keyParts);
    if (existsSync(cachePath)) {
      return readFileSync(cachePath);
    }
  } catch {
    // Ignore cache-read failures and render fresh below.
  }

  const buffer = await render();

  try {
    if (cachePath) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(cachePath, buffer);
    }
  } catch {
    // Ignore cache-write failures; the rendered buffer is still returned.
  }

  return buffer;
}

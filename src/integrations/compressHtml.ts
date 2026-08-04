import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { minify } from "html-minifier-terser";
import type { AstroIntegration } from "astro";

/**
 * Minifies built HTML in place after the build.
 *
 * Replaces @playform/compress, which is unmaintained and declares `astro`, `sharp`
 * and `svgo` as regular dependencies rather than peers — pulling a second copy of
 * each into the tree and forcing version overrides on every Astro upgrade.
 *
 * Only HTML is handled here. Measured against the @playform/compress output, its
 * separate CSS and JS passes saved 5.5 KB and 189 bytes respectively across the
 * whole site, because Vite already minifies both; HTML was the entire benefit
 * (~10% brotli).
 *
 * Options match the ones @playform/compress passed to the same underlying
 * html-minifier-terser, so output stays byte-identical to what it produced.
 */
const MINIFY_OPTIONS = {
  caseSensitive: true,
  collapseWhitespace: true,
  continueOnParseError: true,
  // minifyCSS and minifyJS carry this integration: measured over 462 pages of raw
  // Astro output they account for 669 KB of the 811 KB brotli saving — 82% of the
  // total. They cost roughly 24s of the build because html-minifier-terser runs
  // them synchronously, which is also why raising the concurrency below does not
  // help. The build time is worth the bytes; the CI job timeout was raised instead.
  minifyCSS: true,
  minifyJS: true,
  removeAttributeQuotes: true,
  removeComments: true,
  // Sorting attributes and class names is safe for rendering and improves
  // compression ratios by making repeated markup more similar across pages.
  sortAttributes: true,
  sortClassName: true,
  useShortDoctype: false,
} as const;

async function htmlFilesIn(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFilesIn(full)));
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

/** Runs `worker` over `items` with a bounded number of concurrent tasks. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    }
  );
  await Promise.all(runners);
}

export default function compressHtml(): AstroIntegration {
  return {
    name: "compress-html",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = typeof dir === "string" ? dir : dir.pathname;
        const files = await htmlFilesIn(outDir);
        let before = 0;
        let after = 0;
        let failed = 0;

        await mapWithConcurrency(
          files,
          Math.max(2, os.cpus().length - 1),
          async file => {
            const source = await fs.readFile(file, "utf8");
            try {
              const minified = await minify(source, MINIFY_OPTIONS);
              // Never let the minifier make a page larger.
              if (minified.length < source.length) {
                await fs.writeFile(file, minified);
                before += source.length;
                after += minified.length;
                return;
              }
              before += source.length;
              after += source.length;
            } catch (error) {
              // A single unparseable page must not fail the whole build; it just stays unminified.
              failed += 1;
              logger.warn(
                `could not minify ${path.relative(outDir, file)}: ${(error as Error).message}`
              );
            }
          }
        );

        const savedKb = Math.round((before - after) / 1024);
        const percent = before ? ((1 - after / before) * 100).toFixed(1) : "0";
        logger.info(
          `minified ${files.length - failed}/${files.length} HTML files, saved ${savedKb} KB (${percent}%)`
        );
      },
    },
  };
}

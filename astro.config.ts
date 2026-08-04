import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import compressHtml from "./src/integrations/compressHtml";
import externalLinks from "./src/plugins/externalLinks";
import { DEFAULT_LOCALE, LOCALES } from "./src/i18n/locales";
import { getSitemapLastmodForUrl } from "./src/utils/sitemapLastmod";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";

const NON_INDEXABLE_PATHNAMES = new Set([
  "/404/",
  "/404.html",
  "/search/",
  "/en/404/",
  "/en/search/",
]);

export default defineConfig({
  site: config.site.url,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    mdx(),
    sitemap({
      filter: page => {
        const pathname = new URL(page).pathname;

        if (NON_INDEXABLE_PATHNAMES.has(pathname)) {
          return false;
        }

        if (
          config.features?.showArchives === false &&
          pathname.endsWith("/archives/")
        ) {
          return false;
        }

        return true;
      },
      serialize: item => ({
        ...item,
        lastmod: getSitemapLastmodForUrl(item.url),
      }),
    }),
    // Runs last: minifies built HTML in dist. CSS and JS are already minified by
    // Vite, and images are left to astro:assets + sharp.
    compressHtml(),
  ],
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    processor: satteri({
      hastPlugins: [externalLinks()],
      features: {
        // Astro has already extracted frontmatter before Markdown rendering.
        frontmatter: false,
        // Preserve CLI flags and URLs containing consecutive hyphens.
        smartPunctuation: { dashes: false },
      },
    }),
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
    {
      name: "Noto Sans SC",
      cssVariable: "--font-noto-sans-sc",
      provider: fontProviders.google(),
      fallbacks: ["sans-serif"],
      weights: [400, 700],
      styles: ["normal"],
      formats: ["woff", "ttf"],
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});

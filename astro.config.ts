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
import astroWechat from "./scripts/wechat/src/integration";
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
    astroWechat({
      contentDir: "src/content/posts",
      siteUrl: config.site.url,
      permalinkPattern: "/posts/:slug/",
      defaultAuthor: config.site.author,
      defaultCover: "/default-og.jpg",
      theme: "doocs-default",
      // 标签改成两层后 `海外长文` 不再存在，Substack 译文的分类位是 `阅读`。
      // 换成分类位不会把杂志导读一起放进来：真正决定能否同步的是文章自己的
      // `wechat.enabled`（见 eligibility.ts，配置只能排除、不能选入），而杂志任务没开那个开关。
      eligibleTags: ["技术日报", "每周图书推荐", "随笔", "阅读"],
      remoteImageHosts: ["static01.nyt.com"],
      failOnInvalid: true,
    }),
  ],
  // 两个消失的标签留下的旧地址。`杂志` 拆成了三本刊，`海外长文` 被分类位 `阅读` 顶替，
  // 两者都被搜索引擎收录过，直接 404 会把已有入口丢掉，所以指到接手它们的分类页。
  // 只有 `海外长文` 有第二页（12 篇 / 每页 10 篇）；`杂志` 当时 10 篇，正好一页。
  // 其余标签一律没改名，不需要在这里登记。
  // 目标带尾斜杠，和 sitemap 里登记的规范地址一致，省掉托管层的一跳 301。
  redirects: {
    "/tags/杂志": "/tags/阅读/",
    "/tags/海外长文": "/tags/阅读/",
    "/tags/海外长文/2": "/tags/阅读/",
  },
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
  // 只配浏览器真正会加载的字体。Noto Sans SC 只有构建期画 OG 图用到，它走
  // src/utils/satoriFont.ts 按文字裁子集；配在这里会让 34MB 的 CJK 字体文件跟着进 dist。
  // 字重只列样式里用到的（400/500/600/700），全站没有 300，也没有需要真斜体的地方。
  // formats 默认只有 woff2；多下一份 woff 给 satori 画 OG 图用（它不认 woff2），浏览器仍优先 woff2。
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [400, 500, 600, 700],
      styles: ["normal"],
      formats: ["woff2", "woff"],
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
    incrementalBuild: true,
    svgOptimizer: svgoOptimizer(),
  },
});

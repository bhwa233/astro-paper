import type { APIRoute } from "astro";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/locales";

// /pagefind/ 是搜索索引分片（上百 MB 的二进制），/search/ 页本身带 noindex；两者都不该被爬。
const getRobotsTxt = (sitemapURL: URL) => {
  const searchPaths = LOCALES.map(locale =>
    locale === DEFAULT_LOCALE ? "/search/" : `/${locale}/search/`
  );

  return `
User-agent: *
Allow: /
Disallow: /pagefind/
${searchPaths.map(path => `Disallow: ${path}`).join("\n")}

Sitemap: ${sitemapURL.href}
`;
};

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL("sitemap-index.xml", site);
  return new Response(getRobotsTxt(sitemapURL));
};

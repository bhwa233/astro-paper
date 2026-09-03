import type { APIRoute } from "astro";

// /pagefind/ 是搜索索引分片（上百 MB 的二进制），/search/ 页本身带 noindex；两者都不该被爬。
const getRobotsTxt = (sitemapURL: URL) => `
User-agent: *
Allow: /
Disallow: /pagefind/
Disallow: /search/
Disallow: /en/search/

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL("sitemap-index.xml", site);
  return new Response(getRobotsTxt(sitemapURL));
};

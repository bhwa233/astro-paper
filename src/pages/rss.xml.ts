import rss from "@astrojs/rss";
import { getRelativeLocaleUrl } from "astro:i18n";
import { DEFAULT_LOCALE, type SiteLocale } from "@/i18n/locales";
import { getSortedPostsForLocale } from "@/utils/localeStaticPaths";
import { getPostUrl } from "@/utils/getPostPaths";
import config from "@/config";
import {
  getLocalizedSiteDescription,
  getLocalizedSiteTitle,
} from "@/utils/siteMeta";

const RSS_ITEM_LIMIT = 50;

export async function buildLocalizedRss(locale: SiteLocale = DEFAULT_LOCALE) {
  const sortedPosts = await getSortedPostsForLocale(locale);
  const siteUrl = new URL(getRelativeLocaleUrl(locale, ""), config.site.url)
    .href;

  return rss({
    title: getLocalizedSiteTitle(locale),
    description: getLocalizedSiteDescription(locale),
    site: siteUrl,
    // 订阅器只看最新一段；全量 560 篇让 rss.xml 涨到 232KB，每次抓取都是白搬。
    items: sortedPosts
      .slice(0, RSS_ITEM_LIMIT)
      .map(({ data, id, filePath }) => ({
        link: getPostUrl(id, filePath, locale),
        title: data.title,
        description: data.description,
        pubDate: new Date(data.modDatetime ?? data.pubDatetime),
      })),
  });
}

export async function GET() {
  return buildLocalizedRss(DEFAULT_LOCALE);
}

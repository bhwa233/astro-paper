import rss from "@astrojs/rss";
import type { CollectionEntry } from "astro:content";
import { getRelativeLocaleUrl } from "astro:i18n";
import { DEFAULT_LOCALE, type SiteLocale } from "@/i18n/locales";
import { getSortedPostsForLocale } from "@/utils/localeStaticPaths";
import { getPostUrl } from "@/utils/getPostPaths";
import {
  getLocalizedSiteDescription,
  getLocalizedSiteTitle,
} from "@/utils/siteMeta";
import { tplStr, useTranslations } from "@/i18n";
import config from "@/config";

// 订阅器只看最新一段；全量 560 篇让 rss.xml 涨到 232KB，每次抓取都是白搬。
const RSS_ITEM_LIMIT = 50;

function localeSiteUrl(locale: SiteLocale): string {
  return new URL(getRelativeLocaleUrl(locale, ""), config.site.url).href;
}

function toRssItems(posts: CollectionEntry<"posts">[], locale: SiteLocale) {
  return posts.slice(0, RSS_ITEM_LIMIT).map(({ data, id, filePath }) => ({
    link: getPostUrl(id, filePath, locale),
    title: data.title,
    description: data.description,
    pubDate: new Date(data.modDatetime ?? data.pubDatetime),
  }));
}

export async function buildLocalizedRss(locale: SiteLocale = DEFAULT_LOCALE) {
  return rss({
    title: getLocalizedSiteTitle(locale),
    description: getLocalizedSiteDescription(locale),
    site: localeSiteUrl(locale),
    items: toRssItems(await getSortedPostsForLocale(locale), locale),
  });
}

/**
 * 单个标签的订阅源。全站源一天要塞六到八篇异质日报，只想看某一个栏目的读者
 * 没法只订那一份；每个标签各出一份，订阅粒度才和站点的栏目结构对得上。
 */
export function buildTagRss(
  locale: SiteLocale,
  tagName: string,
  posts: CollectionEntry<"posts">[]
) {
  const t = useTranslations(locale);

  return rss({
    title: `${tagName} | ${getLocalizedSiteTitle(locale)}`,
    description: tplStr(t.pages.tagDescWithName, { tagName }),
    site: localeSiteUrl(locale),
    items: toRssItems(posts, locale),
  });
}

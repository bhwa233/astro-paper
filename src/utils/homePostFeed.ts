import type { SiteLocale } from "@/i18n/locales";
import { getPostUrl } from "@/utils/getPostPaths";
import { getSortedPostsForLocale } from "@/utils/localeStaticPaths";
import { getPostMetrics } from "@/utils/readingTime";
import { getStaticPathCacheKey } from "@/utils/staticPathCache";

export const HOME_POSTS_PER_LOAD = 20;

export type HomePost = {
  title: string;
  description: string;
  url: string;
  pubDatetime: string;
  modDatetime: string | null;
  timezone: string | undefined;
  readingTime: number;
  wordCount: number;
};

export type HomePostFeed = {
  posts: HomePost[];
  hasMore: boolean;
};

export function getHomePosts(locale: SiteLocale) {
  return getSortedPostsForLocale(locale);
}

export function toHomePostFeed(
  posts: Awaited<ReturnType<typeof getHomePosts>>,
  locale: SiteLocale,
  page: number
): HomePostFeed {
  const start = (page - 1) * HOME_POSTS_PER_LOAD;
  const pagePosts = posts.slice(start, start + HOME_POSTS_PER_LOAD);

  return {
    posts: pagePosts.map(({ id, filePath, data, body }) => ({
      title: data.title,
      description: data.description,
      url: getPostUrl(id, filePath, locale),
      pubDatetime: data.pubDatetime.toISOString(),
      modDatetime: data.modDatetime?.toISOString() ?? null,
      timezone: data.timezone,
      ...getPostMetrics(body ?? ""),
    })),
    hasMore: start + HOME_POSTS_PER_LOAD < posts.length,
  };
}

export async function getHomePostFeedPaths(locale: SiteLocale) {
  const posts = await getHomePosts(locale);
  const pageCount = Math.ceil(posts.length / HOME_POSTS_PER_LOAD);

  return Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => {
    const page = index + 2;
    const feed = toHomePostFeed(posts, locale, page);
    return {
      params: { page: String(page) },
      props: { feed },
      cacheKey: getStaticPathCacheKey(feed),
    };
  });
}

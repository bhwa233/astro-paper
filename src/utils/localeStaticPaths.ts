import { getCollection, type CollectionEntry } from "astro:content";
import type { GetStaticPathsOptions } from "astro";
import config from "@/config";
import { type SiteLocale } from "@/i18n/locales";
import { filterCollectionByLocale } from "@/utils/contentLocale";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getUniqueTags } from "@/utils/getUniqueTags";
import { slugifyAll } from "@/utils/slugify";
import { getPostSlug } from "@/utils/getPostPaths";
import {
  getContentEntryCacheKey,
  getStaticPathCacheKey,
} from "@/utils/staticPathCache";

export async function getPostsForLocale(
  locale: SiteLocale,
  options?: { includeDrafts?: boolean }
) {
  const { includeDrafts = true } = options ?? {};
  const posts = await getCollection("posts", ({ data }) =>
    includeDrafts ? true : !data.draft
  );

  return filterCollectionByLocale(posts, locale);
}

export async function getPaginatedPostPaths(
  locale: SiteLocale,
  { paginate }: GetStaticPathsOptions
) {
  const posts = await getPostsForLocale(locale, { includeDrafts: false });
  return paginate(getSortedPosts(posts), {
    pageSize: config.posts.perPage,
  }).map(path => ({
    ...path,
    cacheKey: getPaginatedPathCacheKey(path.props),
  }));
}

export async function getTagPaginatedPaths(
  locale: SiteLocale,
  { paginate }: GetStaticPathsOptions
) {
  const posts = await getPostsForLocale(locale, { includeDrafts: false });
  const tags = getUniqueTags(posts);

  return tags.flatMap(({ tag, tagName }) => {
    const tagPosts = getSortedPosts(
      posts.filter(({ data }) => slugifyAll(data.tags).includes(tag))
    );

    return paginate(tagPosts, {
      params: { tag },
      props: { tagName },
      pageSize: config.posts.perPage,
    }).map(path => ({
      ...path,
      cacheKey: getPaginatedPathCacheKey(path.props),
    }));
  });
}

type AdjacentPost = {
  id: string;
  title: string;
  filePath: string | undefined;
} | null;

export async function getPostDetailPaths(locale: SiteLocale) {
  const posts = await getPostsForLocale(locale);
  const sortedPosts = getSortedPosts(posts);

  return sortedPosts.map((post, index) => ({
    params: { slug: getPostSlug(post.id, post.filePath) },
    props: {
      post,
      prevPost: toAdjacentPost(sortedPosts[index - 1]),
      nextPost: toAdjacentPost(sortedPosts[index + 1]),
    },
    cacheKey: getStaticPathCacheKey({
      post: getContentEntryCacheKey(post),
      previous: getContentEntryCacheKey(sortedPosts[index - 1]),
      next: getContentEntryCacheKey(sortedPosts[index + 1]),
      translations: post.data.translationKey
        ? posts
            .filter(
              candidate =>
                candidate.data.translationKey === post.data.translationKey
            )
            .map(getContentEntryCacheKey)
        : [],
    }),
  }));
}

function getPaginatedPathCacheKey(props: {
  page: {
    currentPage: number;
    data: CollectionEntry<"posts">[];
    lastPage: number;
    size: number;
    total: number;
  };
  tagName?: string;
}) {
  const { page, tagName } = props;

  return getStaticPathCacheKey({
    tagName,
    page: {
      currentPage: page.currentPage,
      data: page.data.map(getContentEntryCacheKey),
      lastPage: page.lastPage,
      size: page.size,
      total: page.total,
    },
  });
}

export async function getPostOgPaths(locale: SiteLocale) {
  if (!config.features.dynamicOgImage) {
    return [];
  }

  const posts = (await getPostsForLocale(locale)).filter(
    ({ data }) => !data.draft && !data.ogImage
  );

  return posts.map(post => ({
    params: { slug: getPostSlug(post.id, post.filePath) },
    props: post,
    // tags 必须进键：OG 图的底色由 tag 解析出的平台主题决定（resolvePlatformKey），
    // 只按标题作者取键，改了 tag 的文章在增量构建里会命中旧路径、渲不出新配色。
    cacheKey: getStaticPathCacheKey({
      title: post.data.title,
      author: post.data.author,
      tags: post.data.tags,
    }),
  }));
}

function toAdjacentPost(
  post: CollectionEntry<"posts"> | undefined
): AdjacentPost {
  if (!post) return null;

  return {
    id: post.id,
    title: post.data.title,
    filePath: post.filePath,
  };
}

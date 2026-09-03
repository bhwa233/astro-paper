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

// 构建期同一个 locale 的文章集合会被十来个路由模块各取一遍（分页、标签、详情、OG、RSS、首页…），
// 每次都是全量 getCollection + 按路径分 locale + 排序。构建是一个进程，缓存一次就够；
// dev 下不缓存，否则新建的文章要重启才看得到。
let allPosts: Promise<CollectionEntry<"posts">[]> | undefined;
const postsByLocale = new Map<string, Promise<CollectionEntry<"posts">[]>>();
const sortedByLocale = new Map<string, Promise<CollectionEntry<"posts">[]>>();

/** 两个 locale 的全部文章（含草稿）。语言切换器每页都要它做互译查找，逐页 getCollection 太浪费。 */
export function getAllPosts(): Promise<CollectionEntry<"posts">[]> {
  if (allPosts && import.meta.env.PROD) return allPosts;
  allPosts = getCollection("posts");
  return allPosts;
}

export function getPostsForLocale(
  locale: string,
  options?: { includeDrafts?: boolean }
): Promise<CollectionEntry<"posts">[]> {
  const { includeDrafts = true } = options ?? {};
  const key = `${locale}:${includeDrafts}`;
  const cached = postsByLocale.get(key);
  if (cached && import.meta.env.PROD) return cached;
  const pending = getAllPosts().then(posts =>
    filterCollectionByLocale(
      includeDrafts ? posts : posts.filter(({ data }) => !data.draft),
      locale
    )
  );
  postsByLocale.set(key, pending);
  return pending;
}

/** 按更新时间倒序、去掉草稿与未到时间的文章；结果按 locale 缓存，和 getPostsForLocale 同一规则。 */
export function getSortedPostsForLocale(
  locale: string
): Promise<CollectionEntry<"posts">[]> {
  const cached = sortedByLocale.get(locale);
  if (cached && import.meta.env.PROD) return cached;
  const pending = getPostsForLocale(locale).then(getSortedPosts);
  sortedByLocale.set(locale, pending);
  return pending;
}

export async function getPaginatedPostPaths(
  locale: SiteLocale,
  { paginate }: GetStaticPathsOptions
) {
  return paginate(await getSortedPostsForLocale(locale), {
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
  const posts = await getSortedPostsForLocale(locale);
  const tags = getUniqueTags(posts);
  // 每篇的标签 slug 只算一次；原来每个标签都对全部文章重新 slugify，39 个标签 × 560 篇约两万次。
  const tagSlugs = new Map(
    posts.map(post => [post, slugifyAll(post.data.tags)])
  );

  return tags.flatMap(({ tag, tagName }) => {
    const tagPosts = posts.filter(post => tagSlugs.get(post)!.includes(tag));

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
  const sortedPosts = await getSortedPostsForLocale(locale);

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

import type { CollectionEntry } from "astro:content";
import { postFilter } from "./postFilter";

/**
 * Returns posts that are eligible to be shown to users, sorted by “last updated”
 * descending (uses `modDatetime` when present, otherwise `pubDatetime`).
 *
 * Note: filtering respects drafts and scheduled posts via `postFilter()`.
 */
export function getSortedPosts(posts: CollectionEntry<"posts">[]) {
  // 排序键先算好：比较器里每次 new Date 两个对象，560 篇的 n log n 次比较就是上万次分配。
  const seconds = new Map(
    posts.map(post => [
      post,
      Math.floor(
        new Date(post.data.modDatetime ?? post.data.pubDatetime).getTime() /
          1000
      ),
    ])
  );
  return posts
    .filter(postFilter)
    .sort((a, b) => seconds.get(b)! - seconds.get(a)!);
}

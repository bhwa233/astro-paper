import type { APIContext } from "astro";
import type { CollectionEntry } from "astro:content";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { getTagFeedPaths } from "@/utils/localeStaticPaths";
import { buildTagRss } from "@/utils/rssFeed";

type Props = { tagName: string; posts: CollectionEntry<"posts">[] };

export async function getStaticPaths() {
  return getTagFeedPaths(DEFAULT_LOCALE);
}

export function GET({ props }: APIContext) {
  const { tagName, posts } = props as Props;
  return buildTagRss(DEFAULT_LOCALE, tagName, posts);
}

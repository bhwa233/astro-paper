import type { APIContext } from "astro";
import type { CollectionEntry } from "astro:content";
import { ENGLISH_LOCALE } from "@/i18n/locales";
import { getTagFeedPaths } from "@/utils/localeStaticPaths";
import { buildTagRss } from "@/utils/rssFeed";

type Props = { tagName: string; posts: CollectionEntry<"posts">[] };

export async function getStaticPaths() {
  return getTagFeedPaths(ENGLISH_LOCALE);
}

export function GET({ props }: APIContext) {
  const { tagName, posts } = props as Props;
  return buildTagRss(ENGLISH_LOCALE, tagName, posts);
}

import type { APIContext } from "astro";
import type { CollectionEntry } from "astro:content";
import {
  addLocaleParam,
  getNonDefaultLocaleStaticPaths,
  type SiteLocale,
} from "@/i18n/locales";
import { getTagFeedPaths } from "@/utils/localeStaticPaths";
import { buildTagRss } from "@/utils/rssFeed";

type Props = { tagName: string; posts: CollectionEntry<"posts">[] };

export async function getStaticPaths() {
  return getNonDefaultLocaleStaticPaths(async locale =>
    addLocaleParam(locale, await getTagFeedPaths(locale))
  );
}

export function GET({ props, params }: APIContext) {
  const { tagName, posts } = props as Props;
  return buildTagRss(params.locale as SiteLocale, tagName, posts);
}

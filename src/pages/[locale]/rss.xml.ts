import type { APIContext } from "astro";
import { getNonDefaultLocalePaths, type SiteLocale } from "@/i18n/locales";
import { buildLocalizedRss } from "@/utils/rssFeed";

export function getStaticPaths() {
  return getNonDefaultLocalePaths();
}

export function GET({ params }: APIContext) {
  return buildLocalizedRss(params.locale as SiteLocale);
}

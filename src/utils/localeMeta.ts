import { DEFAULT_LOCALE } from "@/i18n/locales";
import { getAssetPath } from "@/utils/withBase";
import config from "@/config";

export function getLocaleLangTag(locale: string): string {
  return config.site.locales[locale]?.lang ?? locale;
}

export function getLocaleLabel(locale: string): string {
  return config.site.locales[locale]?.label ?? locale;
}

export function getLocalizedRssPath(locale: string): string {
  return getAssetPath(
    locale === DEFAULT_LOCALE ? "rss.xml" : `${locale}/rss.xml`
  );
}

export function getTagRssPath(locale: string, tagSlug: string): string {
  const prefix = locale === DEFAULT_LOCALE ? "tags" : `${locale}/tags`;
  return getAssetPath(`${prefix}/${tagSlug}/rss.xml`);
}

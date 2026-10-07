import { DEFAULT_SITE_LOCALE, SITE_LOCALES } from "@/utils/siteLocaleConfig";

export type SiteLocale = string;

export const LOCALES = Object.keys(SITE_LOCALES) as SiteLocale[];

export const DEFAULT_LOCALE: SiteLocale = DEFAULT_SITE_LOCALE;
export const NON_DEFAULT_LOCALES = LOCALES.filter(
  locale => locale !== DEFAULT_LOCALE
);

export function getNonDefaultLocalePaths() {
  return NON_DEFAULT_LOCALES.map(locale => ({ params: { locale } }));
}

export async function getNonDefaultLocaleStaticPaths<T>(
  getPaths: (locale: SiteLocale) => T[] | Promise<T[]>
): Promise<T[]> {
  return (
    await Promise.all(NON_DEFAULT_LOCALES.map(locale => getPaths(locale)))
  ).flat();
}

export function addLocaleParam<T extends { params: object }>(
  locale: SiteLocale,
  paths: T[]
) {
  return paths.map(path => ({
    ...path,
    params: { locale, ...path.params },
  }));
}

const localeSet = new Set<string>(LOCALES);

export function isSupportedLocale(value: string): value is SiteLocale {
  return localeSet.has(value);
}

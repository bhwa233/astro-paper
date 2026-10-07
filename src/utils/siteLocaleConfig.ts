import userConfig from "../../astro-paper.config";
import type { LocaleConfig } from "../types/config";

export const DEFAULT_SITE_LOCALE =
  userConfig.site.defaultLocale ?? userConfig.site.lang ?? "en";

export const SITE_LOCALES: Record<string, LocaleConfig> = userConfig.site
  .locales ?? {
  [DEFAULT_SITE_LOCALE]: {
    label: DEFAULT_SITE_LOCALE,
    lang: DEFAULT_SITE_LOCALE,
  },
};

if (!SITE_LOCALES[DEFAULT_SITE_LOCALE]) {
  throw new Error(
    `The default locale \`${DEFAULT_SITE_LOCALE}\` is missing from site.locales.`
  );
}

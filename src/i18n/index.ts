import type { UIStrings } from "./types";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

export { tplStr } from "./format";

const modules = import.meta.glob<{ default: UIStrings }>("./lang/*.ts", {
  eager: true,
});

const translations: Record<string, UIStrings> = {};
for (const [path, mod] of Object.entries(modules)) {
  const locale = path.slice("./lang/".length, -".ts".length);
  translations[locale] = mod.default;
}

const defaultTranslations = translations[DEFAULT_LOCALE];
if (!defaultTranslations) {
  throw new Error(
    `Missing UI translations for default locale: ${DEFAULT_LOCALE}`
  );
}

/** Returns UI strings for the given locale, falling back to the default locale. */
export function useTranslations(locale: string = DEFAULT_LOCALE): UIStrings {
  return (
    (LOCALES.includes(locale) ? translations[locale] : undefined) ??
    defaultTranslations
  );
}

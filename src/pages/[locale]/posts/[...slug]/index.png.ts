import { GET } from "../../../posts/[...slug]/index.png.ts";
import { addLocaleParam, getNonDefaultLocaleStaticPaths } from "@/i18n/locales";
import { getPostOgPaths } from "@/utils/localeStaticPaths";

export { GET };

export async function getStaticPaths() {
  return getNonDefaultLocaleStaticPaths(async locale =>
    addLocaleParam(locale, await getPostOgPaths(locale))
  );
}

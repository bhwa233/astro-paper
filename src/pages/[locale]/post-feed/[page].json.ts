import type { APIContext } from "astro";
import { addLocaleParam, getNonDefaultLocaleStaticPaths } from "@/i18n/locales";
import { getHomePostFeedPaths, type HomePostFeed } from "@/utils/homePostFeed";

type Props = { feed: HomePostFeed };

export function getStaticPaths() {
  return getNonDefaultLocaleStaticPaths(async locale =>
    addLocaleParam(locale, await getHomePostFeedPaths(locale))
  );
}

export async function GET({ props }: APIContext) {
  const { feed } = props as Props;
  return new Response(JSON.stringify(feed), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

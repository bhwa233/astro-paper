import type { APIRoute } from "astro";
import satori from "satori";
import sharp from "sharp";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { getPostOgPaths } from "@/utils/localeStaticPaths";
import config from "@/config";
import { loadOgFonts, OG_FONT_FAMILY } from "@/utils/ogFonts";
import { getLocalizedSiteTitle } from "@/utils/siteMeta";
import { withOgCache } from "@/utils/ogImageCache";
import {
  platformCard,
  resolvePlatformKey,
  PLATFORM_THEMES,
} from "@/utils/platformTheme";

export async function getStaticPaths() {
  return getPostOgPaths(DEFAULT_LOCALE);
}

export const GET: APIRoute = async ({ props, url, currentLocale }) => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }

  const siteTitle = getLocalizedSiteTitle(currentLocale ?? DEFAULT_LOCALE);

  // 底色按文章的平台归属走，与公众号封面同色板。themeKey 必须进缓存键：
  // 同标题同作者的文章换了 tag 就该换底色，只按标题作者取缓存会拿回旧配色那张。
  const themeKey = resolvePlatformKey(props.data.tags);

  const pngBuffer = await withOgCache(
    { title: props.data.title, author: props.data.author, siteTitle, themeKey },
    async () => {
      const fonts = await loadOgFonts(url);

      const svg = await satori(
        platformCard(PLATFORM_THEMES[themeKey], OG_FONT_FAMILY, {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              margin: "44px 60px",
              width: "88%",
              height: "82%",
            },
            children: [
              {
                type: "p",
                props: {
                  style: {
                    margin: 0,
                    fontSize: 72,
                    fontWeight: "bold",
                    maxHeight: "84%",
                    overflow: "hidden",
                    lineHeight: 1.2,
                    letterSpacing: -1,
                  },
                  children: props.data.title,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                    marginBottom: "8px",
                    fontSize: 28,
                  },
                  children: [
                    {
                      type: "span",
                      props: {
                        children: [
                          "by ",
                          {
                            type: "span",
                            props: {
                              style: { color: "transparent" },
                              children: '"',
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                overflow: "hidden",
                                fontWeight: "bold",
                              },
                              children: props.data.author,
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          overflow: "hidden",
                          fontWeight: "bold",
                        },
                        children: siteTitle,
                      },
                    },
                  ],
                },
              },
            ],
          },
        }),
        {
          width: 1200,
          height: 630,
          embedFont: true,
          fonts,
        }
      );

      return sharp(Buffer.from(svg)).png().toBuffer();
    }
  );

  return new Response(new Uint8Array(pngBuffer), {
    headers: { "Content-Type": "image/png" },
  });
};

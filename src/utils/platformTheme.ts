/**
 * 平台主题：文章 OG 图与公众号封面共用的一套配色和卡片骨架。
 *
 * 放在 src/ 而不是 scripts/，是因为 OG 路由跑在 Astro 运行时里、够不着 scripts 的模块解析；
 * 反过来 scripts 用相对路径 import 这里没有障碍——本文件只有常量、纯函数和 satori 的普通对象树，
 * 不碰 astro:assets、@/ 别名和任何 Node API。
 *
 * 注意本文件受 prettier 管辖（.prettierignore 只放行 /src），scripts/ 那半边不受，
 * 两边风格不一致是配置决定的，不是随手写的。
 */

export type PlatformTheme = {
  /** 卡片之外铺满整张图的底色。 */
  bg: string;
  /** 卡片内的强调色：笔圈描边与条目编号。底色的加深版，压在浅色卡片上仍然读得出。 */
  accent: string;
  /** 卡片自身的底色。 */
  card: string;
};

/**
 * 米白压在橙底和蓝底上是暖对暖、暖对冷，都稳；压在微博红上红黄互冲，显廉价，
 * 所以微博单独用一个不带色温的中性白。卡片色因此逐主题给，不做全局常量。
 */
const CARD_WARM = "#FFFDF8";
const CARD_NEUTRAL = "#FAFAFA";

export const PLATFORM_THEMES = {
  reddit: { bg: "#FF4500", accent: "#C42D00", card: CARD_WARM },
  weibo: { bg: "#E6162D", accent: "#A8101F", card: CARD_NEUTRAL },
  neutral: { bg: "#006CAC", accent: "#004E7C", card: CARD_WARM },
} satisfies Record<string, PlatformTheme>;

export type PlatformKey = keyof typeof PLATFORM_THEMES;

/**
 * tag 到主题的映射。用完整 tag 精确匹配，不用前缀匹配：
 * tag 是人手写进 frontmatter 的，`Reddit` 前缀会让「Reddit 使用心得」这类无关文章
 * 悄悄套上平台配色；而精确匹配漏掉一个新 tag，代价只是回落到中性色。
 */
const THEME_BY_TAG: Record<string, PlatformKey> = {
  Reddit热门: "reddit",
  Reddit热搜: "reddit",
  微博热搜: "weibo",
};

/** 一篇文章命中多个平台 tag 时取先出现的那个；都不命中就是中性色。 */
export function resolvePlatformKey(
  tags: readonly string[] | undefined
): PlatformKey {
  for (const tag of tags ?? []) {
    const key = THEME_BY_TAG[tag];
    if (key) return key;
  }
  return "neutral";
}

export function resolvePlatformTheme(
  tags: readonly string[] | undefined
): PlatformTheme {
  return PLATFORM_THEMES[resolvePlatformKey(tags)];
}

/**
 * satori 吃的是普通对象树，不是 JSX。这里给一个最小结构类型，
 * 免得共享模块为了标注返回值把 react 类型拖进来。
 */
export type SatoriNode = { type: string; props: Record<string, unknown> };

/**
 * 卡片相对整张图的尺寸。OG（1200×630）与公众号封面（1175×500）两种画布共用同一组百分比，
 * 所以两边的观感一致，而各自的绝对像素不必对齐。
 */
const CARD_WIDTH = "94%";
const CARD_HEIGHT = "78%";
const CARD_RADIUS = "34px";

/** 平台色铺满，圆角卡片浮在正中。卡内那一层由调用方给。 */
export function platformCard(
  theme: PlatformTheme,
  fontFamily: string,
  inner: unknown,
  cardSize: { width: string; height: string } = {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  }
): SatoriNode {
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.bg,
        fontFamily,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              width: cardSize.width,
              height: cardSize.height,
              borderRadius: CARD_RADIUS,
              background: theme.card,
            },
            children: inner,
          },
        },
      ],
    },
  };
}

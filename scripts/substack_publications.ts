import {
  newsletterPublicationSchema,
  type NewsletterPublication,
  type PatternConfig,
} from "./substack_contracts.ts";

const SUBSTACK_IMAGE_HOSTS = [
  "substackcdn.com",
  "substack-post-media.s3.amazonaws.com",
];

const rawPublications = {
  "curiosity-chronicle": {
    key: "curiosity-chronicle",
    kind: "substack",
    displayName: "The Curiosity Chronicle",
    author: "Sahil Bloom",
    feedUrl: "https://sahilbloom.substack.com/feed",
    siteUrl: "https://sahilbloom.substack.com/",
    feedHosts: ["sahilbloom.substack.com"],
    articleHosts: ["sahilbloom.substack.com", "www.sahilbloom.com"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "Curiosity Chronicle",
    enabled: true,
    startAt: "2026-08-20",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
    ],
    cutBeforePatterns: [
      {
        source:
          "^Forwarded this email\\? Join [\\d,.]+(?:[KMB])?\\+ (?:other )?readers here\\.$",
        flags: "i",
      },
    ],
  },
  "after-babel": {
    key: "after-babel",
    kind: "substack",
    displayName: "After Babel",
    author: "Jon Haidt and Zach Rausch",
    feedUrl: "https://www.afterbabel.com/feed",
    siteUrl: "https://www.afterbabel.com/",
    feedHosts: ["www.afterbabel.com", "afterbabel.com"],
    articleHosts: ["www.afterbabel.com", "afterbabel.com"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "After Babel",
    focus: ["儿童手机与社交媒体", "注意力", "教育", "数字环境设计"],
    enabled: true,
    startAt: "2026-08-11",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
  },
  "honest-broker": {
    key: "honest-broker",
    kind: "substack",
    displayName: "The Honest Broker",
    author: "Ted Gioia",
    feedUrl: "https://www.honest-broker.com/feed",
    siteUrl: "https://www.honest-broker.com/",
    feedHosts: ["www.honest-broker.com", "honest-broker.com"],
    articleHosts: ["www.honest-broker.com", "honest-broker.com"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "The Honest Broker",
    focus: ["关系与仪式", "文化", "审美", "注意力经济"],
    enabled: true,
    startAt: "2026-08-19",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
    // 订阅 CTA 插在正文中间（`<div><hr></div>` 夹着一个无 class 的 h3/h4 加一个 .button-wrapper 按钮），
    // 截断类规则一动就会砍掉后半篇，只能逐块删。按钮走 removeSelectors，标题只能按文本删。
    dropPatterns: [{ source: "^Please support my work\\b", flags: "i" }],
  },
  "one-useful-thing": {
    key: "one-useful-thing",
    kind: "substack",
    displayName: "One Useful Thing",
    author: "Ethan Mollick",
    feedUrl: "https://www.oneusefulthing.org/feed",
    siteUrl: "https://www.oneusefulthing.org/",
    feedHosts: ["www.oneusefulthing.org"],
    articleHosts: ["www.oneusefulthing.org", "oneusefulthing.org"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "One Useful Thing",
    focus: ["AI与工作", "AI与教育", "人机协作", "组织管理"],
    enabled: true,
    startAt: "2026-07-23",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
  },
  "wheres-your-ed-at": {
    key: "wheres-your-ed-at",
    kind: "rss",
    displayName: "Where's Your Ed At",
    author: "Ed Zitron",
    feedUrl: "https://www.wheresyoured.at/rss/",
    siteUrl: "https://www.wheresyoured.at/",
    feedHosts: ["www.wheresyoured.at", "wheresyoured.at"],
    articleHosts: ["www.wheresyoured.at", "wheresyoured.at"],
    imageHosts: ["storage.ghost.io"],
    tag: "Where's Your Ed At",
    focus: ["AI商业模式", "算力", "数据中心", "平台经济"],
    enabled: true,
    startAt: "2026-08-18",
    imagePolicy: "mirror",
    removeSelectors: ["hr:first-of-type", "hr:last-of-type"],
    cutBeforePatterns: [
      {
        source: "^If you want to get in touch",
        flags: "i",
      },
    ],
    cutAfterPatterns: [
      {
        source:
          "^If you liked this piece, you should subscribe to my premium newsletter\\. It(?:'|’)s",
        flags: "i",
      },
    ],
  },
  "roots-of-progress-institute": {
    key: "roots-of-progress-institute",
    kind: "rss",
    displayName: "Roots of Progress Institute",
    author: "Roots of Progress Institute",
    feedUrl: "https://rootsofprogress.org/feed/",
    siteUrl: "https://rootsofprogress.org/",
    feedHosts: ["rootsofprogress.org", "www.rootsofprogress.org"],
    articleHosts: ["rootsofprogress.org", "www.rootsofprogress.org"],
    imageHosts: ["rootsofprogress.org", "lh7-rt.googleusercontent.com"],
    tag: "Roots of Progress Institute",
    focus: ["科技史", "医学史", "进步理念"],
    enabled: true,
    startAt: "2026-06-23",
    imagePolicy: "mirror",
    removeSelectors: [".sharedaddy", ".jp-relatedposts", ".post-end"],
    excludeTitlePatterns: [
      {
        source:
          "(?:career exploration|summer program|program (?:has )?(?:started|launched)|applications? (?:are )?open)",
        flags: "i",
      },
    ],
    cutAfterPatterns: [
      {
        source: "^The post .+ appeared first on ",
        flags: "i",
      },
    ],
  },
  "experimental-history": {
    key: "experimental-history",
    kind: "substack",
    displayName: "Experimental History",
    author: "Adam Mastroianni",
    feedUrl: "https://www.experimental-history.com/feed",
    siteUrl: "https://www.experimental-history.com/",
    feedHosts: ["www.experimental-history.com", "experimental-history.com"],
    articleHosts: [
      "www.experimental-history.com",
      "experimental-history.com",
    ],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "Experimental History",
    priority: "high",
    topics: ["心理学", "科学方法", "教育", "文化与阅读", "AI内容质量"],
    enabled: true,
    startAt: "2026-08-18",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
  },
  noahpinion: {
    key: "noahpinion",
    kind: "substack",
    displayName: "Noahpinion",
    author: "Noah Smith",
    feedUrl: "https://www.noahpinion.blog/feed",
    siteUrl: "https://www.noahpinion.blog/",
    feedHosts: ["www.noahpinion.blog", "noahpinion.blog"],
    articleHosts: ["www.noahpinion.blog", "noahpinion.blog"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "Noahpinion",
    priority: "high",
    topics: ["人口", "经济", "技术变迁", "产业", "城市"],
    selectionMode: "manual",
    selectionRule:
      "避开美国选举与即时政治；数据结论必须补充独立来源",
    enabled: true,
    startAt: "2026-08-19",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
    excludeTitlePatterns: [
      {
        source:
          "(?:^|\\b)(?:Trump|Biden|Democrats?|Republicans?|U\\.S\\. election|presidential election)(?:\\b|$)",
        flags: "i",
      },
    ],
  },
  "construction-physics": {
    key: "construction-physics",
    kind: "substack",
    displayName: "Construction Physics",
    author: "Brian Potter",
    feedUrl: "https://www.construction-physics.com/feed",
    siteUrl: "https://www.construction-physics.com/",
    feedHosts: ["www.construction-physics.com"],
    articleHosts: ["www.construction-physics.com"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "Construction Physics",
    priority: "medium",
    topics: ["住房", "建筑", "基础设施", "工业技术", "城市化"],
    selectionRule: "优先技术史和供给机制；少选美国法案逐条解读",
    enabled: true,
    startAt: "2026-07-30",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
    excludeTitlePatterns: [
      { source: "^Reading List\\b", flags: "i" },
      { source: "ROAD to Housing Act", flags: "i" },
    ],
    translationLengthRatio: {
      warnMin: 0.3,
      warnMax: 0.6,
      failMin: 0.25,
      failMax: 0.75,
    },
  },
  "intrinsic-perspective": {
    key: "intrinsic-perspective",
    kind: "substack",
    displayName: "The Intrinsic Perspective",
    author: "Erik Hoel",
    feedUrl: "https://www.theintrinsicperspective.com/feed",
    siteUrl: "https://www.theintrinsicperspective.com/",
    feedHosts: [
      "www.theintrinsicperspective.com",
      "theintrinsicperspective.com",
    ],
    articleHosts: [
      "www.theintrinsicperspective.com",
      "theintrinsicperspective.com",
    ],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "The Intrinsic Perspective",
    priority: "low",
    topics: ["意识", "神经科学", "AI哲学", "科学方法"],
    selectionMode: "manual",
    selectionRule: "只选能翻译为大众问题的文章，并补充主流研究",
    enabled: true,
    startAt: "2026-07-13",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
    excludeTitlePatterns: [
      { source: "^Goodbye Slopstack!", flags: "i" },
    ],
  },
  "astral-codex-ten": {
    key: "astral-codex-ten",
    kind: "substack",
    displayName: "Astral Codex Ten",
    author: "Scott Alexander",
    feedUrl: "https://www.astralcodexten.com/feed",
    siteUrl: "https://www.astralcodexten.com/",
    feedHosts: ["www.astralcodexten.com", "astralcodexten.com"],
    articleHosts: ["www.astralcodexten.com", "astralcodexten.com"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "Astral Codex Ten",
    priority: "low",
    topics: ["理性思维", "心理学", "医学", "社会科学"],
    selectionMode: "manual",
    selectionRule: "人工挑选，避开宗教争论、社群动态和立场性议题",
    enabled: true,
    startAt: "2026-08-04",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
      ".button-wrapper",
    ],
    excludeTitlePatterns: [
      {
        source:
          "(?:Open Thread|Meetups?|House Party|Religion Debate|^Your Book Review)",
        flags: "i",
      },
    ],
  },
  satpost: {
    key: "satpost",
    kind: "substack",
    displayName: "SatPost",
    author: "Trung Phan",
    feedUrl: "https://www.readtrung.com/feed",
    siteUrl: "https://www.readtrung.com/",
    feedHosts: ["www.readtrung.com", "readtrung.com"],
    articleHosts: ["www.readtrung.com", "readtrung.com"],
    imageHosts: SUBSTACK_IMAGE_HOSTS,
    tag: "SatPost",
    enabled: true,
    startAt: "2026-08-20",
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
    ],
  },
  marginalian: {
    key: "marginalian",
    kind: "rss",
    displayName: "The Marginalian",
    author: "Maria Popova",
    feedUrl: "https://feeds.feedburner.com/brainpickings/rss",
    siteUrl: "https://www.themarginalian.org/",
    feedHosts: [
      "feeds.feedburner.com",
      "www.themarginalian.org",
      "themarginalian.org",
    ],
    articleHosts: ["www.themarginalian.org", "themarginalian.org"],
    imageHosts: [
      "www.themarginalian.org",
      "themarginalian.org",
      "i0.wp.com",
      "i1.wp.com",
      "i2.wp.com",
    ],
    tag: "The Marginalian",
    enabled: true,
    startAt: "2026-08-21",
    imagePolicy: "mirror",
    removeSelectors: [".sharedaddy", ".jp-relatedposts", ".post-end"],
    // 每篇结尾固定挂「Complement with…」延伸阅读、donating = loving 捐赠段和 newsletter 订阅段。
    // 实测 2026-08-21 抓到的 20 篇：donating 每篇都有且总在末尾；Complement 出现在其中 9 篇，
    // 每篇仅一次且紧挨在 donating 之前，所以拿它当截断点不会腰斩正文。
    cutAfterPatterns: [
      { source: "^Complement\\b", flags: "i" },
      { source: "^donating = loving", flags: "i" },
    ],
  },
} as const;

export const NEWSLETTER_PUBLICATIONS: Record<string, NewsletterPublication> =
  Object.fromEntries(
    Object.entries(rawPublications).map(([key, value]) => [
      key,
      newsletterPublicationSchema.parse(value),
    ])
  );

export function publicationByKey(key: string): NewsletterPublication {
  const publication = NEWSLETTER_PUBLICATIONS[key];
  if (!publication) throw new Error(`unknown publication: ${key}`);
  return publication;
}

const PRIORITY_ORDER: Record<NewsletterPublication["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function orderPublicationsByPriority(
  publications: readonly NewsletterPublication[]
): NewsletterPublication[] {
  return [...publications].sort(
    (left, right) =>
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
  );
}

export function publicationsForInput(input: string): NewsletterPublication[] {
  if (input === "all")
    return orderPublicationsByPriority(
      Object.values(NEWSLETTER_PUBLICATIONS).filter(
        item => item.enabled && item.selectionMode === "automatic"
      )
    );
  const publication = publicationByKey(input);
  if (!publication.enabled)
    throw new Error(`publication is disabled: ${input}`);
  return [publication];
}

export function compilePatterns(patterns: readonly PatternConfig[]): RegExp[] {
  return patterns.map(pattern => new RegExp(pattern.source, pattern.flags));
}

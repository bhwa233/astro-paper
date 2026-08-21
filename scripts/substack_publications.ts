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
    minTextChars: 2_000,
    maxFeedBytes: 1_000_000,
    maxImageBytes: 12_000_000,
    maxImagePixels: 40_000_000,
    maxPostsPerRun: 1,
    maxEstimatedTokensPerArticle: 50_000,
    imagePolicy: "mirror",
    removeSelectors: [
      ".subscription-widget-wrap",
      ".post-footer",
      ".social-share-row",
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
    minTextChars: 4_000,
    maxFeedBytes: 6_000_000,
    maxImageBytes: 12_000_000,
    maxImagePixels: 40_000_000,
    maxPostsPerRun: 1,
    maxEstimatedTokensPerArticle: 50_000,
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
    startAt: "2026-08-20",
    minTextChars: 4_000,
    maxFeedBytes: 1_000_000,
    maxImageBytes: 12_000_000,
    maxImagePixels: 40_000_000,
    maxPostsPerRun: 1,
    maxEstimatedTokensPerArticle: 50_000,
    imagePolicy: "mirror",
    removeSelectors: [".sharedaddy", ".jp-relatedposts", ".post-end"],
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

export function publicationsForInput(input: string): NewsletterPublication[] {
  if (input === "all")
    return Object.values(NEWSLETTER_PUBLICATIONS).filter(item => item.enabled);
  const publication = publicationByKey(input);
  if (!publication.enabled)
    throw new Error(`publication is disabled: ${input}`);
  return [publication];
}

export function compilePatterns(patterns: readonly PatternConfig[]): RegExp[] {
  return patterns.map(pattern => new RegExp(pattern.source, pattern.flags));
}

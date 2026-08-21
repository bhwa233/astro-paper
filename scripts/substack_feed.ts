import { parseFeed } from "feedsmith";
import { compact } from "./blog_common.ts";
import { restrictedFetchText } from "./restricted_fetch.ts";
import {
  substackArchiveItemSchema,
  substackPostDetailSchema,
  type NewsletterPublication,
} from "./substack_contracts.ts";

export type SubstackFeedItem = {
  title: string;
  guid: string;
  link: string;
  canonicalUrl: string;
  publishedAt: string;
  author: string;
  description: string;
  contentHtml: string;
  contentApiUrl?: string;
  audience?: string;
};

export type ParsedSubstackFeed = {
  title: string;
  generator: string;
  transport: "rss" | "substack-api";
  items: SubstackFeedItem[];
};

function firstString(value: unknown): string {
  if (typeof value === "string") return compact(value);
  if (Array.isArray(value)) return firstString(value[0]);
  return "";
}

function normalizedDate(value: unknown, label: string): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid ${label}`);
  return date.toISOString();
}

export function parseNewsletterFeed(
  xml: string,
  publication: NewsletterPublication
): ParsedSubstackFeed {
  const parsed = parseFeed(xml);
  if (parsed.format !== "rss")
    throw new Error(
      `${publication.key} feed must be RSS, got ${parsed.format}`
    );
  const feed = parsed.feed;
  const generator = compact(feed.generator || "");
  if (publication.kind === "substack" && !/^substack$/i.test(generator)) {
    throw new Error(
      `${publication.key} feed generator must be Substack, got ${generator || "missing"}`
    );
  }
  const items = (feed.items || []).map((item, index): SubstackFeedItem => {
    const title = compact(item.title || "");
    const link = compact(item.link || "");
    const guid =
      typeof item.guid === "string"
        ? compact(item.guid)
        : compact(item.guid?.value || "");
    const contentHtml = item.content?.encoded || "";
    if (!title)
      throw new Error(
        `${publication.key} feed item ${index + 1} missing title`
      );
    if (!link)
      throw new Error(`${publication.key} feed item ${index + 1} missing link`);
    if (!guid && !link)
      throw new Error(
        `${publication.key} feed item ${index + 1} missing GUID and link`
      );
    return {
      title,
      guid: guid || link,
      link,
      canonicalUrl: link,
      publishedAt: normalizedDate(
        item.pubDate || item.dc?.date,
        `${publication.key} item ${index + 1} pubDate`
      ),
      author:
        firstString(item.dc?.creators) ||
        firstString(item.dc?.creator) ||
        publication.author,
      description: compact(item.description || ""),
      contentHtml,
    };
  });
  if (!items.length) throw new Error(`${publication.key} feed has no items`);
  return {
    title: compact(feed.title || publication.displayName),
    generator,
    transport: "rss",
    items,
  };
}

function substackApiUrl(
  publication: NewsletterPublication,
  pathname: string
): string {
  return new URL(pathname, new URL(publication.feedUrl).origin).href;
}

function parseSubstackArchive(
  text: string,
  publication: NewsletterPublication
): ParsedSubstackFeed {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${publication.key} Substack archive returned invalid JSON`);
  }
  if (!Array.isArray(payload) || !payload.length)
    throw new Error(`${publication.key} Substack archive has no items`);

  const items = payload.map((value, index): SubstackFeedItem => {
    const parsed = substackArchiveItemSchema.safeParse(value);
    if (!parsed.success)
      throw new Error(
        `${publication.key} archive item ${index + 1} failed schema validation`
      );
    const item = parsed.data;
    const bodyHtml = item.body_html || "";
    return {
      title: compact(item.title),
      guid: String(item.id),
      link: item.canonical_url,
      canonicalUrl: item.canonical_url,
      publishedAt: normalizedDate(
        item.post_date,
        `${publication.key} archive item ${index + 1} post_date`
      ),
      author: compact(item.publishedBylines?.[0]?.name || publication.author),
      description: compact(item.description || ""),
      contentHtml: bodyHtml,
      contentApiUrl: bodyHtml
        ? undefined
        : substackApiUrl(
            publication,
            `/api/v1/posts/${encodeURIComponent(item.slug)}`
          ),
      audience: compact(item.audience || ""),
    };
  });

  return {
    title: publication.displayName,
    generator: "Substack",
    transport: "substack-api",
    items,
  };
}

function isSubstackFeedBlocked(error: unknown): boolean {
  return error instanceof Error && /\bHTTP 403\b/.test(error.message);
}

export async function fetchNewsletterFeed(
  publication: NewsletterPublication
): Promise<ParsedSubstackFeed> {
  try {
    const feed = await restrictedFetchText(publication.feedUrl, {
      allowedHosts: publication.feedHosts,
      maxBytes: publication.maxFeedBytes,
    });
    return parseNewsletterFeed(feed.text, publication);
  } catch (error) {
    if (publication.kind !== "substack" || !isSubstackFeedBlocked(error))
      throw error;
    const archiveUrl = substackApiUrl(
      publication,
      "/api/v1/archive?sort=new&search=&offset=0&limit=20"
    );
    try {
      const archive = await restrictedFetchText(archiveUrl, {
        allowedHosts: publication.feedHosts,
        maxBytes: publication.maxFeedBytes,
        headers: { Accept: "application/json" },
      });
      return parseSubstackArchive(archive.text, publication);
    } catch (fallbackError) {
      const reason =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      throw new Error(
        `${publication.key} RSS was blocked and Substack archive fallback failed: ${reason}`,
        { cause: fallbackError }
      );
    }
  }
}

export async function hydrateNewsletterItem(
  item: SubstackFeedItem,
  publication: NewsletterPublication
): Promise<SubstackFeedItem> {
  if (item.audience && item.audience !== "everyone")
    throw new Error(`Substack article is not public: ${item.canonicalUrl}`);
  if (item.contentHtml) return item;
  if (!item.contentApiUrl)
    throw new Error(`Substack article body is missing: ${item.canonicalUrl}`);

  const response = await restrictedFetchText(item.contentApiUrl, {
    allowedHosts: publication.feedHosts,
    maxBytes: publication.maxFeedBytes,
    headers: { Accept: "application/json" },
  });
  let payload: unknown;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new Error(`Substack article detail returned invalid JSON`);
  }
  const parsed = substackPostDetailSchema.safeParse(payload);
  if (!parsed.success)
    throw new Error(`Substack article detail failed schema validation`);
  const detail = parsed.data;
  const audience = compact(detail.audience || "") || item.audience;
  if (audience && audience !== "everyone")
    throw new Error(`Substack article is not public: ${item.canonicalUrl}`);
  const contentHtml = detail.body_html;
  if (!compact(contentHtml))
    throw new Error(`Substack article body is missing: ${item.canonicalUrl}`);
  return {
    ...item,
    author: compact(detail.publishedBylines?.[0]?.name || item.author),
    contentHtml,
    contentApiUrl: undefined,
    audience,
  };
}

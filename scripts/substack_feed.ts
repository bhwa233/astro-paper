import { parseFeed } from "feedsmith";
import { compact } from "./blog_common.ts";
import type { NewsletterPublication } from "./substack_contracts.ts";

export type SubstackFeedItem = {
  title: string;
  guid: string;
  link: string;
  canonicalUrl: string;
  publishedAt: string;
  author: string;
  description: string;
  contentHtml: string;
};

export type ParsedSubstackFeed = {
  title: string;
  generator: string;
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
    items,
  };
}

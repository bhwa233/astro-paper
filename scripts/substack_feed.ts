import { parseFeed } from "feedsmith";
import { compact } from "./blog_common.ts";
import {
  restrictedFetchText,
  validateRestrictedUrl,
} from "./restricted_fetch.ts";
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
  transport: "rss" | "service-proxy";
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

function requiredSourceProxy(): { url: URL; token: string } {
  const baseUrl = process.env.SUBSTACK_FETCH_PROXY_URL?.trim().replace(/\/+$/, "");
  const token = process.env.SUBSTACK_FETCH_PROXY_TOKEN?.trim();
  if (!baseUrl)
    throw new Error(
      "SUBSTACK_FETCH_PROXY_URL is required for newsletter feed fetch"
    );
  if (!token)
    throw new Error(
      "SUBSTACK_FETCH_PROXY_TOKEN is required for newsletter feed fetch"
    );
  const url = new URL(`${baseUrl}/v1/proxy`);
  if (url.protocol !== "https:")
    throw new Error("SUBSTACK_FETCH_PROXY_URL must use HTTPS");
  if (url.username || url.password)
    throw new Error("SUBSTACK_FETCH_PROXY_URL must not contain credentials");
  return { url, token };
}

export async function fetchNewsletterFeed(
  publication: NewsletterPublication
): Promise<ParsedSubstackFeed> {
  const proxy = requiredSourceProxy();
  const targetUrl = validateRestrictedUrl(
    publication.feedUrl,
    publication.feedHosts
  );
  proxy.url.searchParams.set("url", targetUrl.href);
  proxy.url.searchParams.set(
    "userAgent",
    "astro-paper-newsletter-translator/1.0"
  );
  const feed = await restrictedFetchText(proxy.url.href, {
    allowedHosts: [proxy.url.hostname],
    maxBytes: publication.maxFeedBytes,
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
    },
  });
  return {
    ...parseNewsletterFeed(feed.text, publication),
    transport: "service-proxy",
  };
}

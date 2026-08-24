import * as cheerio from 'cheerio'

export interface LinkRewriteOptions {
  /** Hosts WeChat still renders as clickable anchors. Usually empty. */
  readonly clickableHosts: readonly string[]
}

/**
 * Strip outbound links down to their content.
 *
 * WeChat article bodies do not render arbitrary external hyperlinks as
 * clickable, so an anchor written by the author would lose its destination
 * silently. That is a content-correctness bug, not a styling difference, which
 * is why this transform is not optional.
 *
 * The anchor is unwrapped rather than replaced with its text: an anchor may
 * wrap an image (`[![alt](i.png)](url)`), and flattening to text would delete
 * that image without a trace. Unwrapping keeps whatever the author put inside
 * and only removes the link itself. Anything unsafe in there is the sanitizer's
 * problem, and the sanitizer runs after this.
 *
 * The destination is dropped, not recorded. An earlier version numbered each
 * link and appended the targets as a reference list; in articles that carry
 * dozens of links — a daily digest, a link roundup — that tail grew longer than
 * the body and pushed against WeChat's 20000-character limit. Readers cannot
 * follow a URL printed as text anyway.
 */
export function rewriteOutboundLinks(html: string, options: LinkRewriteOptions): string {
  const $ = cheerio.load(html, null, false)

  for (const element of $('a[href]').toArray()) {
    const anchor = $(element)
    const href = (anchor.attr('href') ?? '').trim()

    // In-document links are footnote references and heading anchors. They work
    // inside the article and must not be unwrapped.
    if (href === '' || href.startsWith('#')) continue
    if (anchor.closest('.footnote-ref, .footnote-backref').length > 0) continue

    if (isClickable(href, options.clickableHosts)) continue

    anchor.replaceWith(anchor.contents())
  }

  return $.html()
}

function isClickable(href: string, clickableHosts: readonly string[]): boolean {
  if (clickableHosts.length === 0) return false
  try {
    return clickableHosts.includes(new URL(href).hostname)
  } catch {
    return false
  }
}

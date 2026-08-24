import * as cheerio from 'cheerio'
import { ARTICLE_CLASS } from './theme.js'

/**
 * Gap left above the article's first element.
 *
 * WeChat puts its own padding between the article header and the body, so this
 * only has to keep the first block from sitting flush against it. Relative to
 * the element's own font size, which is what makes it read the same above a
 * heading as above a paragraph.
 */
export const LEADING_MARGIN = '0.5em'

/**
 * Force the top margin of the article's first element, as the last word.
 *
 * A theme cannot express this on its own. The obvious rule —
 * `.astro-wechat-article > :first-child { margin-top: 0 }` — silently loses:
 * `juice` does not count `:first-child` toward specificity, so it sorts that
 * declaration *before* `.astro-wechat-article h2 { margin: 4em auto 2em }`, and
 * the shorthand then resets all four sides. The published articles carried
 * 76.8px of blank above the first heading because of it.
 *
 * Appending wins where a stylesheet rule could not: an inline declaration that
 * comes last beats an earlier shorthand, and only the top side is touched, so a
 * heading centred with `margin: 4em auto 2em` keeps its `auto` sides and its
 * bottom margin.
 *
 * Must run after every pass that writes styles. `rewriteImages` appends
 * `margin:1.2em auto` to each image, which would override this the same way the
 * theme's shorthand did if the first element were an image.
 */
export function applyLeadingMargin(html: string): string {
  const $ = cheerio.load(html, null, false)
  const first = $(`.${ARTICLE_CLASS}`).first().children().first()
  if (first.length === 0) return html

  const style = (first.attr('style') ?? '').trim()
  const separator = style === '' || style.endsWith(';') ? '' : ';'
  first.attr('style', `${style}${separator}margin-top:${LEADING_MARGIN}`)

  return $.html()
}

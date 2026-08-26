import { dirname } from 'node:path'
import juice from 'juice'
import {
  CLICKABLE_LINK_HOSTS,
  CONTENT_LIMITS,
  HASH_SCHEMA_VERSION,
  NEWSPIC_LIMITS,
  RENDERER_VERSION,
} from '../constants.js'
import { RenderError, WarningCollector } from '../errors.js'
import type {
  ArticleDocument,
  AssetIdentity,
  RenderedArticle,
  RenderedNewspicArticle,
  ResolvedProject,
} from '../types.js'
import { identifyAsset } from '../assets/identity.js'
import { resolveAsset } from '../assets/resolve.js'
import { codePointLength, stripMarkdown } from '../util/text.js'
import { computeContentHash } from './hash.js'
import { prependCoverImage, rewriteImages } from './images.js'
import { applyLeadingMargin } from './leading-margin.js'
import { rewriteOutboundLinks } from './links.js'
import { renderMarkdown } from './markdown.js'
import { sanitizeArticleHtml } from './sanitize.js'
import { ARTICLE_CLASS, getTheme } from './theme.js'

/**
 * Render one article to the pre-upload state.
 *
 * Performs no network I/O and no writes. Everything here must be reproducible
 * offline, because the content hash it produces is what later decides whether
 * any upload happens at all.
 */
export async function renderArticle(
  document: ArticleDocument,
  project: ResolvedProject,
  warnings: WarningCollector = new WarningCollector(),
): Promise<RenderedArticle> {
  if (document.articleType === 'newspic') return renderNewspicArticle(document, project, warnings)

  const theme = getTheme(project.config.theme)

  // 1. Markdown to HTML.
  const parsed = renderMarkdown(document.body)

  // 2. Outbound links stripped to their content, before the theme sees them.
  const linked = rewriteOutboundLinks(parsed, { clickableHosts: CLICKABLE_LINK_HOSTS })

  // 3. The draft cover is always the first body image. It then follows the
  //    normal body-image path through styling, hashing, and upload.
  const withCover = prependCoverImage(linked, document.cover)

  // 4. Theme, and 5. inline it. WeChat drops <style>, so `juice` is not an
  //    optimization here; without it the article renders unstyled.
  const themed = `<style>${theme.css}</style><section class="${ARTICLE_CLASS}">${withCover}</section>`
  const inlined = juice(themed)

  // 6. Sanitize.
  const clean = sanitizeArticleHtml(inlined)

  // 7. Images to content-hash placeholders, with responsive styles forced on.
  const withPlaceholders = await rewriteImages(clean, document, project, warnings)

  // 8. Leading margin, last so nothing can override it. Measured before the
  //    limit check because this is the HTML that gets uploaded.
  const html = applyLeadingMargin(withPlaceholders.html)

  assertWithinContentLimits(html, document.source.absolutePath)

  const coverAsset = await resolveCoverAsset(document, project, warnings)

  const contentHash = computeContentHash({
    document,
    html,
    bodyAssets: withPlaceholders.assets,
    coverAsset,
    themeName: theme.name,
  })

  return {
    document,
    articleType: 'news',
    html,
    bodyAssets: withPlaceholders.assets,
    coverAsset,
    contentHash,
    hashSchemaVersion: HASH_SCHEMA_VERSION,
    rendererVersion: RENDERER_VERSION,
    warnings: warnings.warnings,
  }
}

/**
 * Render a 图片消息.
 *
 * Almost none of the news pipeline applies: there is no theme, no inlining, no
 * sanitizing and no leading margin, because WeChat accepts no markup here at
 * all. What is shared is the image pass — running the body through the same
 * Markdown render and `rewriteImages` and then discarding the HTML keeps one
 * definition of "which images does this article reference, in what order",
 * which is exactly the list WeChat wants.
 */
async function renderNewspicArticle(
  document: ArticleDocument,
  project: ResolvedProject,
  warnings: WarningCollector,
): Promise<RenderedNewspicArticle> {
  const parsed = renderMarkdown(document.body)
  const { assets } = await rewriteImages(parsed, document, project, warnings)
  const sourcePath = document.source.absolutePath

  assertNewspicImages(assets, sourcePath)

  const content = newspicContent(document.body)
  assertNewspicContent(content, sourcePath)

  const coverAsset = await resolveCoverAsset(document, project, warnings)

  const contentHash = computeContentHash({
    document,
    html: '',
    content,
    bodyAssets: assets,
    coverAsset,
    // No theme participates, and recording one would imply switching themes
    // changes a 图片消息. It does not.
    themeName: '',
  })

  return {
    document,
    articleType: 'newspic',
    content,
    bodyAssets: assets,
    coverAsset,
    contentHash,
    hashSchemaVersion: HASH_SCHEMA_VERSION,
    rendererVersion: RENDERER_VERSION,
    warnings: warnings.warnings,
  }
}

/**
 * Plain text with paragraph breaks kept.
 *
 * `stripMarkdown` collapses every run of whitespace, which is right for a digest
 * and wrong here: WeChat does render newlines in a 图片消息 caption, so a body
 * written as three paragraphs must not arrive as one run-on line. Strip each
 * paragraph on its own and rejoin. Image-only paragraphs strip to nothing and
 * drop out, which is what puts the caption above the pictures rather than
 * interleaved with them.
 */
function newspicContent(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => stripMarkdown(paragraph))
    .filter((paragraph) => paragraph !== '')
    .join('\n')
}

function resolveCoverAsset(
  document: ArticleDocument,
  project: ResolvedProject,
  warnings: WarningCollector,
): Promise<AssetIdentity> {
  return identifyAsset(
    resolveAsset(
      document.cover,
      {
        markdownDir: dirname(document.source.absolutePath),
        projectRoot: project.root,
        allowAbsolute: project.config.allowAbsoluteAssetPaths,
        role: 'cover',
      },
      warnings,
    ),
  )
}

/**
 * Both bounds are refusals, not truncations.
 *
 * Silently dropping images past the twentieth would publish a partial article
 * that reads as complete, and an image list is not a tail that can be cut — the
 * pictures are the content.
 */
function assertNewspicImages(assets: readonly AssetIdentity[], sourcePath: string): void {
  if (assets.length === 0) {
    throw new RenderError('图片消息正文里没有图片，微信的 image_list 不能为空。', {
      code: 'newspic-no-images',
      sourcePath,
    })
  }
  if (assets.length > NEWSPIC_LIMITS.maxImages) {
    throw new RenderError(
      `图片消息有 ${assets.length} 张图，超出微信上限 ${NEWSPIC_LIMITS.maxImages}。`,
      { code: 'newspic-too-many-images', sourcePath },
    )
  }
}

function assertNewspicContent(content: string, sourcePath: string): void {
  const characters = codePointLength(content)
  if (characters > NEWSPIC_LIMITS.maxContentCharacters) {
    throw new RenderError(
      `图片消息正文 ${characters} 字符，超出上限 ${NEWSPIC_LIMITS.maxContentCharacters}。`,
      { code: 'newspic-content-too-long', sourcePath },
    )
  }
}

/**
 * Check body size locally.
 *
 * Placeholders are longer than the WeChat URLs that replace them, so passing
 * here does not strictly guarantee the uploaded body fits. The margin is small
 * and in the safe direction: we reject slightly early rather than late.
 */
function assertWithinContentLimits(html: string, sourcePath: string): void {
  const characters = codePointLength(html)
  if (characters > CONTENT_LIMITS.maxCharacters) {
    throw new RenderError(
      `正文 HTML ${characters} 字符，超出微信上限 ${CONTENT_LIMITS.maxCharacters}。`,
      { code: 'content-too-long', sourcePath },
    )
  }

  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > CONTENT_LIMITS.maxBytes) {
    throw new RenderError(
      `正文 HTML ${bytes} 字节，超出微信上限 ${CONTENT_LIMITS.maxBytes}。`,
      { code: 'content-too-large', sourcePath },
    )
  }
}

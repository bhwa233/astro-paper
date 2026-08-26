import { HASH_SCHEMA_VERSION, RENDERER_VERSION } from '../constants.js'
import type { AssetIdentity, ArticleDocument } from '../types.js'
import { canonicalJson, sha256Hex } from '../util/hash.js'

export interface ContentHashInput {
  readonly document: ArticleDocument
  /** HTML with asset references still in placeholder form. Empty for `newspic`. */
  readonly html: string
  /** Plain-text body. Set only for `newspic`. */
  readonly content?: string
  readonly bodyAssets: readonly AssetIdentity[]
  readonly coverAsset: AssetIdentity
  readonly themeName: string
}

/**
 * Content hash over pre-upload inputs only.
 *
 * No uploaded URL and no WeChat media identifier participates. Substituting
 * real URLs into the HTML after the decision must not change this value —
 * see ADR-0002, and the test that asserts it directly.
 *
 * The two `newspic` fields are omitted entirely for `news` rather than sent as
 * empty values. `canonicalJson` drops undefined, so an ordinary article hashes
 * to exactly what it hashed to before this form existed — adding a draft form
 * must not mark the whole archive as drifted.
 */
export function computeContentHash(input: ContentHashInput): string {
  const { document } = input
  const newspic = document.articleType === 'newspic'

  return sha256Hex(
    canonicalJson({
      schema: HASH_SCHEMA_VERSION,
      renderer: RENDERER_VERSION,
      theme: input.themeName,
      sourceId: document.sourceId,
      title: document.title,
      author: document.author ?? '',
      digest: document.digest,
      html: input.html,
      articleType: newspic ? document.articleType : undefined,
      content: newspic ? (input.content ?? '') : undefined,
      // Ordered: moving an image within the article is a content change.
      bodyAssets: input.bodyAssets.map((asset) => asset.contentHash),
      cover: input.coverAsset.contentHash,
    }),
  )
}

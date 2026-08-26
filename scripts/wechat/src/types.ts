import type { Warning } from './errors.js'

/** Technical design section 4.1. Raw file content before normalization. */
export interface SourceArticle {
  readonly absolutePath: string
  readonly projectRelativePath: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly body: string
  readonly format: 'md'
}

/**
 * Which WeChat draft form an article becomes.
 *
 * `news` is the ordinary 图文消息: one cover plus an HTML body. `newspic` is
 * 图片消息, where the draft *is* an ordered list of images and the body is a
 * short piece of plain text with no markup at all.
 *
 * The two are not variations on a theme. They differ in what gets uploaded
 * (permanent material for every image rather than one cover), in what the
 * renderer produces, and in what the draft endpoint accepts — which is why the
 * distinction is carried on the document rather than decided at upload time.
 */
export type ArticleType = 'news' | 'newspic'

/** The optional `wechat` frontmatter object. Technical design section 6. */
export interface WechatFrontmatter {
  readonly enabled?: boolean
  /** Keep the draft cover as the WeChat list thumbnail without repeating it in the article body. */
  readonly showCoverInBody?: boolean
  /**
   * Draft form. Absent means `news`.
   *
   * Deliberately not inferred from the body: an article that happens to be all
   * images is still an ordinary 图文, and guessing wrong here uploads twenty
   * permanent materials that cannot be reclaimed.
   */
  readonly articleType?: ArticleType
  readonly title?: string
  readonly cover?: string
  readonly author?: string
  readonly digest?: string
  readonly sourceURL?: string
  /**
   * Sync identity, when it must not be the canonical URL.
   *
   * By default an article's identity in the ledger *is* its canonical URL, which
   * is also what becomes the draft's 阅读原文 link. Those two coincide for a blog
   * post and conflict as soon as several drafts are cut from one article: they
   * should all link back to the same page, yet each needs its own ledger row.
   * Sharing a row is not a loud failure — the second draft is skipped as
   * `already-synchronized` and simply never gets created.
   *
   * Set this to keep the two apart. Anything stable and unique per draft works;
   * it is never shown to a reader.
   */
  readonly syncId?: string
}

/**
 * Technical design section 4.2. The normalized article.
 *
 * Locale and timezone are deliberately absent: nothing consumes them, and an
 * unused field in the shared model invites inconsistent implementations.
 */
export interface ArticleDocument {
  /** Canonical URL when available, otherwise the normalized relative path. */
  readonly sourceId: string
  readonly canonicalUrl: string | undefined
  readonly articleType: ArticleType
  readonly title: string
  readonly body: string
  readonly author: string | undefined
  readonly digest: string
  /** Unresolved cover reference as written in frontmatter or configuration. */
  readonly cover: string
  readonly draft: boolean
  readonly tags: readonly string[]
  readonly wechat: WechatFrontmatter
  readonly source: SourceArticle
}

export type AssetSourceKind = 'local' | 'remote' | 'data-uri' | 'wechat-hosted'

export type AssetRole = 'body' | 'cover'

/** Technical design section 4.3. An image before upload. */
export interface AssetReference {
  readonly original: string
  readonly kind: AssetSourceKind
  /** Absolute filesystem path for local assets. */
  readonly localPath?: string
  /** Absolute URL for remote and already-hosted assets. */
  readonly url?: string
  readonly role: AssetRole
  readonly alt?: string
}

/** A resolved asset with its content identity computed. */
export interface AssetIdentity {
  readonly reference: AssetReference
  /**
   * Hash of the asset's bytes for local assets, or of its URL for remote ones.
   *
   * Remote assets are not downloaded during rendering, so their identity is the
   * URL. That is weaker than content identity and is why remote images cannot
   * detect an upstream edit.
   */
  readonly contentHash: string
  /** Placeholder substituted into the HTML until upload replaces it. */
  readonly placeholder: string
}

/**
 * Fields both draft forms carry. See `RenderedArticle`.
 */
export interface RenderedArticleBase {
  readonly document: ArticleDocument
  /**
   * Images the draft carries, in document order.
   *
   * For `news` these are body images that get spliced back into the HTML. For
   * `newspic` they are the draft itself — WeChat's `image_list`, whose first
   * entry is the cover.
   */
  readonly bodyAssets: readonly AssetIdentity[]
  /**
   * The article's declared cover.
   *
   * Still resolved for `newspic`, where WeChat takes the cover from the first
   * image instead: it participates in the content hash, and a source whose
   * `ogImage` changed is a source that changed.
   */
  readonly coverAsset: AssetIdentity
  readonly contentHash: string
  readonly hashSchemaVersion: number
  readonly rendererVersion: string
  readonly warnings: readonly Warning[]
}

export interface RenderedNewsArticle extends RenderedArticleBase {
  readonly articleType: 'news'
  /** Sanitized HTML with asset references still in placeholder form. */
  readonly html: string
}

export interface RenderedNewspicArticle extends RenderedArticleBase {
  readonly articleType: 'newspic'
  /** Plain text. WeChat renders no markup in a 图片消息 body. */
  readonly content: string
}

/**
 * Technical design section 4.4, pre-upload state.
 *
 * This is what the create decision reads. It contains no uploaded URL, because
 * the content hash must be computable before anything is uploaded.
 *
 * A union rather than one shape with both bodies optional: there is no article
 * that has HTML *and* plain text, and every consumer has to know which one it
 * is holding before it can do anything with it.
 */
export type RenderedArticle = RenderedNewsArticle | RenderedNewspicArticle

/** One uploaded permanent material, tied to the bytes that produced it. */
export interface ImageMaterial {
  readonly contentHash: string
  readonly materialId: string
}

/** Technical design section 4.5. Persisted by the state store in ADR-0002. */
export interface DraftIdentity {
  readonly sourceId: string
  readonly canonicalUrl?: string
  readonly mediaId?: string
  readonly contentHash?: string
  readonly hashSchemaVersion?: number
  readonly coverMaterialId?: string
  /** Content hash of the cover that produced `coverMaterialId`. */
  readonly coverContentHash?: string
  /**
   * Permanent material uploaded for a `newspic` image list, keyed by content.
   *
   * Written as each upload returns rather than at commit time. A run that dies
   * between the uploads and the draft call would otherwise leave twenty
   * materials charged to the quota with no way to find them again, and the
   * retry would upload twenty more.
   */
  readonly imageMaterialIds?: readonly ImageMaterial[]
  readonly orphanedCoverMaterialIds?: readonly string[]
  readonly writeState: 'pending' | 'committed'
  readonly updatedAt?: string
}

/** Project configuration. Technical design section 8. */
export interface ProjectConfig {
  readonly contentDir: string
  readonly siteUrl?: string
  /**
   * Pattern used to derive a canonical URL from a slug.
   *
   * Route shape is theme-specific, so it is configuration rather than a
   * built-in assumption. The default matches AstroPaper, which is the first
   * consumer, but nothing in the core depends on that theme.
   */
  readonly permalinkPattern: string
  readonly defaultAuthor?: string
  readonly defaultCover?: string
  readonly theme: string
  readonly eligibleTags?: readonly string[]
  readonly eligibleSourcePaths?: readonly string[]
  /** Exact hostnames permitted when downloading remote images for WeChat upload. */
  readonly remoteImageHosts?: readonly string[]
  readonly previewDir: string
  /**
   * Ledger location, relative to the project root.
   *
   * This file must be committed: it is the record of what has been
   * synchronized, and losing it means the next run cannot tell an already
   * published article from a new one (ADR-0002).
   */
  readonly ledgerPath: string
  /** Allow resolving assets from absolute filesystem paths. Off by default. */
  readonly allowAbsoluteAssetPaths: boolean
}

export interface ResolvedProject {
  readonly root: string
  readonly config: ProjectConfig
}

/** Why an article was not synchronized. Reported rather than silently omitted. */
export type SkipReason =
  | 'already-synchronized'
  | 'not-enabled'
  | 'excluded-by-config'
  | 'source-is-draft'

/**
 * `planned` only appears under `--dry-run`.
 *
 * There is no `updated`: the first release never updates a draft (technical
 * design section 2.3). Consumers must not assume this set is closed.
 */
export type ArticleStatus = 'skipped' | 'created' | 'failed' | 'planned'

export interface ArticleResult {
  readonly sourcePath: string
  readonly sourceId: string
  readonly title: string
  readonly status: ArticleStatus
  readonly skipReason?: SkipReason
  readonly contentHash?: string
  /** Source changed after synchronization; the draft will not be updated. */
  readonly drift?: boolean
  readonly mediaId?: string
  /** Set when a previously unknown outcome was resolved against WeChat. */
  readonly reconciled?: boolean
  readonly errorCategory?: string
  readonly errorMessage?: string
  readonly warnings: readonly Warning[]
}

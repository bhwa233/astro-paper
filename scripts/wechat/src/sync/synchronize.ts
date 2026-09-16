import { AstroWechatError, WarningCollector, type Warning } from '../errors.js'
import { normalizeImage, type NormalizedImage } from '../image/normalize.js'
import { substitutePlaceholders } from '../render/images.js'
import type { StateStore } from '../state/store.js'
import type {
  ArticleResult,
  ArticleStatus,
  AssetIdentity,
  DraftIdentity,
  RenderedArticle,
  RenderedNewspicArticle,
} from '../types.js'
import type { WeChatClient } from '../wechat/client.js'

/**
 * The part of a result the decision produces, on top of the identifying fields.
 *
 * `status` stays required rather than using `Partial<ArticleResult>`: spreading
 * a fully optional type would make `status` optional in the merged object too,
 * which is exactly the field that must never go missing.
 */
interface SyncOutcome {
  readonly status: ArticleStatus
  readonly skipReason?: ArticleResult['skipReason']
  readonly drift?: boolean
  readonly mediaId?: string
  readonly warnings?: readonly Warning[]
}

export interface SynchronizeDeps {
  readonly client: WeChatClient
  readonly store: StateStore
  /** Exact hostnames that actual uploads may download images from. */
  readonly remoteImageHosts?: readonly string[]
  /** Injected in tests so the suite does not require the native image pipeline. */
  readonly normalize?: (asset: AssetIdentity, warnings: WarningCollector) => Promise<NormalizedImage>
}

export interface SynchronizeOptions {
  /** Do everything up to the create decision, then report without writing. */
  readonly dryRun?: boolean
  /** Create a second draft for an article that already has one. */
  readonly forceCreate?: boolean
}

/**
 * Decide whether to skip or create, and carry out the create.
 *
 * There is no update path: the first release converges an article onto at most
 * one draft and stops there (technical design section 2.3). The skip decision
 * is therefore identity-based — does a committed record exist — and the content
 * hash only drives a drift warning.
 */
export async function synchronizeArticle(
  rendered: RenderedArticle,
  deps: SynchronizeDeps,
  options: SynchronizeOptions = {},
): Promise<ArticleResult> {
  const { document } = rendered
  const sourceId = document.sourceId
  const base = {
    sourcePath: document.source.projectRelativePath,
    sourceId,
    title: document.title,
    contentHash: rendered.contentHash,
    warnings: rendered.warnings,
  }

  try {
    const existing = await deps.store.get(sourceId)

    if (existing?.writeState === 'committed' && !options.forceCreate) {
      const drift = existing.contentHash !== rendered.contentHash
      return {
        ...base,
        status: 'skipped',
        skipReason: 'already-synchronized',
        drift,
        mediaId: existing.mediaId,
        warnings: drift ? [...rendered.warnings, driftWarning(document.source.absolutePath)] : rendered.warnings,
      }
    }

    if (existing?.writeState === 'pending' && !options.forceCreate) {
      // New drafts have no 阅读原文 link. A canonical URL still identifies the
      // local ledger entry, but cannot identify the draft remotely. Even an
      // older draft with that URL could belong to a previous force-create.
      throw new AstroWechatError(
        'wechat',
        '上一次同步结果未知；阅读原文已关闭，无法按原文地址核对远端草稿。' +
          '请手动检查草稿箱，确认需要新建后使用 --force-create。',
        { code: 'reconcile-impossible', sourcePath: document.source.absolutePath },
      )
    }

    if (options.dryRun) {
      return { ...base, status: 'planned' }
    }

    const outcome = await create(rendered, deps, existing)
    return { ...base, ...outcome, warnings: outcome.warnings ?? base.warnings }
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      errorCategory: error instanceof AstroWechatError ? error.category : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

type Normalizer = (asset: AssetIdentity, warnings: WarningCollector) => Promise<NormalizedImage>

function normalizerFor(deps: SynchronizeDeps): Normalizer {
  return deps.normalize ?? ((asset, warnings) =>
    normalizeImage(asset, warnings, { remoteImageHosts: deps.remoteImageHosts }))
}

async function create(
  rendered: RenderedArticle,
  deps: SynchronizeDeps,
  existing: DraftIdentity | undefined,
): Promise<SyncOutcome> {
  const { document } = rendered

  // Written before any WeChat call. A pending entry found on a later run is the
  // signal that the previous outcome is unknown.
  await deps.store.putPending({
    sourceId: document.sourceId,
    canonicalUrl: document.canonicalUrl,
    contentHash: rendered.contentHash,
    hashSchemaVersion: rendered.hashSchemaVersion,
  })

  if (rendered.articleType === 'newspic') return createNewspic(rendered, deps, existing)

  const normalize = normalizerFor(deps)
  const warnings = new WarningCollector()
  const reusableCoverMaterialId = existing?.coverMaterialId
  const reuseCover =
    reusableCoverMaterialId !== undefined &&
    existing?.coverContentHash === rendered.coverAsset.contentHash

  let coverMaterialId = reusableCoverMaterialId

  if (!reuseCover) {
    const image = await normalize(rendered.coverAsset, warnings)
    const uploaded = await deps.client.uploadPermanentImage(image)
    coverMaterialId = uploaded.mediaId

    // Recorded immediately: if draft creation fails, this material is already
    // consuming quota and belongs to no draft.
    await deps.store.recordOrphan(document.sourceId, uploaded.mediaId)
  }

  const substitutions = new Map<string, string>()
  for (const asset of rendered.bodyAssets) {
    const image = await normalize(asset, warnings)
    substitutions.set(asset.placeholder, await deps.client.uploadBodyImage(image))
  }

  const content = substitutePlaceholders(rendered.html, substitutions)

  const mediaId = await deps.client.createDraft({
    articleType: 'news',
    title: document.title,
    author: document.author,
    digest: document.digest,
    content,
    thumbMediaId: coverMaterialId!,
    // All synchronized drafts hide 阅读原文; canonicalUrl stays in the ledger.
    contentSourceUrl: '',
  })

  await deps.store.commit(document.sourceId, {
    mediaId,
    coverMaterialId,
    coverContentHash: rendered.coverAsset.contentHash,
  })

  // Unconditional: the invariant is "material a draft references is not an
  // orphan", not "material we just uploaded". Keying this off whether an upload
  // happened would leave a reused cover marked as an orphan, and cleanup would
  // then delete a material a published draft depends on.
  await deps.store.clearOrphan(document.sourceId, coverMaterialId!)

  return {
    status: 'created',
    mediaId,
    warnings: [...rendered.warnings, ...warnings.warnings],
  }
}

/**
 * Create a 图片消息.
 *
 * Every image goes up as permanent material, which makes this the one path in
 * the package where a failed run leaks quota at scale: twenty uploads, then a
 * draft call that never returns. Two records bound that. Each material is
 * written against its content hash the moment it exists, so the retry reuses
 * what the failed run already paid for instead of buying twenty more; and each
 * is also recorded as an orphan, so `cleanup-orphans` can still find material
 * that never made it into a draft.
 */
async function createNewspic(
  rendered: RenderedNewspicArticle,
  deps: SynchronizeDeps,
  existing: DraftIdentity | undefined,
): Promise<SyncOutcome> {
  const { document } = rendered
  const normalize = normalizerFor(deps)
  const warnings = new WarningCollector()

  const known = new Map(
    (existing?.imageMaterialIds ?? []).map((material) => [material.contentHash, material.materialId]),
  )
  const imageMediaIds: string[] = []

  for (const asset of rendered.bodyAssets) {
    const reused = known.get(asset.contentHash)
    if (reused !== undefined) {
      imageMediaIds.push(reused)
      continue
    }

    const image = await normalize(asset, warnings)
    const uploaded = await deps.client.uploadPermanentImage(image)

    known.set(asset.contentHash, uploaded.mediaId)
    await deps.store.recordImageMaterial(document.sourceId, {
      contentHash: asset.contentHash,
      materialId: uploaded.mediaId,
    })
    await deps.store.recordOrphan(document.sourceId, uploaded.mediaId)
    imageMediaIds.push(uploaded.mediaId)
  }

  const mediaId = await deps.client.createDraft({
    articleType: 'newspic',
    title: document.title,
    author: document.author,
    content: rendered.content,
    imageMediaIds,
    contentSourceUrl: '',
  })

  await deps.store.commit(document.sourceId, { mediaId })

  // Same invariant as the cover: material a draft references is not an orphan.
  // Reused ids are cleared too, because an earlier failed run recorded them.
  for (const id of new Set(imageMediaIds)) {
    await deps.store.clearOrphan(document.sourceId, id)
  }

  return {
    status: 'created',
    mediaId,
    warnings: [...rendered.warnings, ...warnings.warnings],
  }
}

function driftWarning(sourcePath: string): Warning {
  return {
    code: 'source-drift',
    message:
      '这篇文章已同步过，但源内容此后发生了变化。首个版本不更新草稿，因此改动不会反映到微信。' +
      '需要更新请在公众号后台编辑。',
    sourcePath,
  }
}

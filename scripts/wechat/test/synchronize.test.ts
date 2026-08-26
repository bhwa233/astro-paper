import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareArticle } from '../src/pipeline.js'
import { MemoryStateStore } from '../src/state/store.js'
import { synchronizeArticle, type SynchronizeDeps } from '../src/sync/synchronize.js'
import type { RenderedArticle } from '../src/types.js'
import type { CreateDraftInput, WeChatClient } from '../src/wechat/client.js'
import {
  createFixtureProject,
  SECOND_TINY_PNG_BASE64,
  TINY_PNG_BASE64,
  writePost,
  type FixtureProject,
} from './helpers/project.js'

let project: FixtureProject

beforeEach(() => {
  project = createFixtureProject()
  project.writeBinary('public/images/cover.png', TINY_PNG_BASE64)
})

afterEach(() => project.cleanup())

interface FakeOptions {
  readonly existingDraftId?: string | null
  /** Throw from `createDraft`, to exercise the "uploads paid for, no draft" path. */
  readonly failDraft?: boolean
}

function fakeClient(existingDraftId: string | null = null, options: FakeOptions = {}) {
  const calls: string[] = []
  const drafts: CreateDraftInput[] = []
  let materialSequence = 0

  return {
    calls,
    drafts,
    client: {
      async uploadBodyImage() {
        calls.push('uploadBodyImage')
        return 'https://mmbiz.qpic.cn/body'
      },
      async uploadPermanentImage() {
        materialSequence += 1
        calls.push('uploadPermanentImage')
        return { mediaId: `material-${materialSequence}`, url: undefined }
      },
      async createDraft(input: CreateDraftInput) {
        calls.push('createDraft')
        drafts.push(input)
        if (options.failDraft) throw new Error('draft rejected')
        return 'draft-a'
      },
      async findDraftBySourceUrl() {
        calls.push('findDraftBySourceUrl')
        return existingDraftId
      },
      async deleteMaterial() {},
    } as unknown as WeChatClient,
  }
}

async function render(): Promise<RenderedArticle> {
  const articlePath = writePost(project)
  return prepareArticle(articlePath, await project.resolved({ siteUrl: 'https://example.com' }))
}

/**
 * A 图片消息 whose body is nothing but images.
 *
 * The two pictures are distinct files with distinct bytes, so the reuse test
 * can tell "uploaded twice" from "uploaded once and reused".
 */
async function renderNewspic(): Promise<RenderedArticle> {
  project.writeBinary('src/data/blog/card-01.png', TINY_PNG_BASE64)
  project.writeBinary('src/data/blog/card-02.png', SECOND_TINY_PNG_BASE64)

  const articlePath = writePost(project, {
    slug: 'sample-newspic',
    frontmatter: {
      ogImage: 'card-01.png',
      wechat: { enabled: true, articleType: 'newspic', syncId: 'newspic-1' },
    },
    body: '一句导语。\n\n![](card-01.png)\n\n![](card-02.png)\n',
  })

  return prepareArticle(articlePath, await project.resolved({ siteUrl: 'https://example.com' }))
}

function deps(client: WeChatClient, store = new MemoryStateStore()): SynchronizeDeps & { store: MemoryStateStore } {
  return {
    client,
    store,
    normalize: async () => ({ bytes: new Uint8Array([1]), contentType: 'image/png', filename: 'image.png' }),
  }
}

describe('草稿同步', () => {
  it('重复同步同一篇文章时不再发起微信请求', async () => {
    const fake = fakeClient()
    const context = deps(fake.client)
    const article = await render()

    await synchronizeArticle(article, context)
    const callCount = fake.calls.length
    const second = await synchronizeArticle(article, context)

    expect(second).toMatchObject({ status: 'skipped', skipReason: 'already-synchronized' })
    expect(fake.calls).toHaveLength(callCount)
  })

  it('结果不明后发现远程草稿时恢复台账而不重复创建', async () => {
    const fake = fakeClient('draft-existing')
    const context = deps(fake.client)
    const article = await render()
    await context.store.putPending({ sourceId: article.document.sourceId, contentHash: article.contentHash })

    const result = await synchronizeArticle(article, context)

    expect(result).toMatchObject({ status: 'skipped', reconciled: true, mediaId: 'draft-existing' })
    expect(fake.calls).not.toContain('createDraft')
  })

  it('dry run 不写台账也不调用微信', async () => {
    const fake = fakeClient()
    const context = deps(fake.client)

    await expect(synchronizeArticle(await render(), context, { dryRun: true })).resolves.toMatchObject({ status: 'planned' })
    expect(fake.calls).toEqual([])
    expect(await context.store.all()).toEqual([])
  })

  it('图片消息按顺序传永久素材，且不带封面与摘要', async () => {
    const fake = fakeClient()
    const context = deps(fake.client)

    const result = await synchronizeArticle(await renderNewspic(), context)

    expect(result).toMatchObject({ status: 'created', mediaId: 'draft-a' })
    // 每张图各上传一次，没有单独的封面上传，也没有正文图 URL 上传。
    expect(fake.calls.filter((call) => call === 'uploadPermanentImage')).toHaveLength(2)
    expect(fake.calls).not.toContain('uploadBodyImage')

    const draft = fake.drafts[0]
    expect(draft).toMatchObject({
      articleType: 'newspic',
      imageMediaIds: ['material-1', 'material-2'],
    })
    expect(draft).not.toHaveProperty('thumbMediaId')
    expect(draft).not.toHaveProperty('digest')
  })

  it('建草稿失败后重试复用已上传的素材，不再吃一次配额', async () => {
    const store = new MemoryStateStore()
    const article = await renderNewspic()

    const failing = fakeClient(null, { failDraft: true })
    await synchronizeArticle(article, deps(failing.client, store))
    expect(failing.calls.filter((call) => call === 'uploadPermanentImage')).toHaveLength(2)

    // 失败那次的素材已经计入配额，重试必须认出它们。
    const retry = fakeClient()
    const result = await synchronizeArticle(article, deps(retry.client, store))

    expect(result).toMatchObject({ status: 'created' })
    expect(retry.calls).not.toContain('uploadPermanentImage')
    expect(retry.drafts[0]).toMatchObject({ imageMediaIds: ['material-1', 'material-2'] })

    // 素材进了草稿就不再是孤儿，否则 cleanup-orphans 会删掉在用的图。
    const [entry] = await store.all()
    expect(entry?.orphanedCoverMaterialIds).toEqual([])
  })
})

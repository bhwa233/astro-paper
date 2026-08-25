import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareArticle } from '../src/pipeline.js'
import { MemoryStateStore } from '../src/state/store.js'
import { synchronizeArticle, type SynchronizeDeps } from '../src/sync/synchronize.js'
import type { RenderedArticle } from '../src/types.js'
import type { WeChatClient } from '../src/wechat/client.js'
import { createFixtureProject, TINY_PNG_BASE64, writePost, type FixtureProject } from './helpers/project.js'

let project: FixtureProject

beforeEach(() => {
  project = createFixtureProject()
  project.writeBinary('public/images/cover.png', TINY_PNG_BASE64)
})

afterEach(() => project.cleanup())

function fakeClient(existingDraftId: string | null = null) {
  const calls: string[] = []
  return {
    calls,
    client: {
      async uploadBodyImage() {
        calls.push('uploadBodyImage')
        return 'https://mmbiz.qpic.cn/body'
      },
      async uploadCover() {
        calls.push('uploadCover')
        return { mediaId: 'cover-a', url: undefined }
      },
      async createDraft() {
        calls.push('createDraft')
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
})

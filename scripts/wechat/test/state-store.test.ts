import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { JsonLedgerStore } from '../src/state/store.js'
import { createFixtureProject, type FixtureProject } from './helpers/project.js'

let project: FixtureProject
let store: JsonLedgerStore
let ledgerPath: string

beforeEach(() => {
  project = createFixtureProject()
  ledgerPath = join(project.root, '.astro-wechat/ledger.json')
  store = new JsonLedgerStore(ledgerPath)
})

afterEach(() => project.cleanup())

describe('发布台账', () => {
  it('将 pending 草稿提交为可恢复的已发布记录', async () => {
    await store.putPending({ sourceId: 'post-a', contentHash: 'hash-a' })
    await store.commit('post-a', { mediaId: 'draft-a', coverMaterialId: 'cover-a' })

    const reopened = new JsonLedgerStore(ledgerPath)
    expect(await reopened.get('post-a')).toMatchObject({
      writeState: 'committed',
      mediaId: 'draft-a',
      coverMaterialId: 'cover-a',
    })
  })

  it('拒绝没有 pending 记录的提交，避免凭空标记为已发布', async () => {
    await expect(store.commit('missing', { mediaId: 'draft-a' })).rejects.toThrow(/pending/)
  })

  it('拒绝损坏的台账，避免把历史发布内容当成新文章', async () => {
    project.write('.astro-wechat/ledger.json', '{ invalid json')
    await expect(new JsonLedgerStore(ledgerPath).get('post-a')).rejects.toThrow(/不是合法 JSON/)
  })
})

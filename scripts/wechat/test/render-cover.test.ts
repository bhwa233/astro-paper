import { afterEach, beforeEach, expect, it } from 'vitest'
import { prepareArticle } from '../src/pipeline.js'
import { TINY_PNG_BASE64, createFixtureProject, writePost, type FixtureProject } from './helpers/project.js'

const BODY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let project: FixtureProject

beforeEach(() => {
  project = createFixtureProject()
  project.writeBinary('public/images/cover.png', TINY_PNG_BASE64)
  project.writeBinary('public/images/body.png', BODY_PNG_BASE64)
})

afterEach(() => project.cleanup())

it('places the WeChat draft cover before every body image', async () => {
  const path = writePost(project, { body: '![正文图片](/images/body.png)\n\n正文段落。' })
  const rendered = await prepareArticle(path, await project.resolved({ siteUrl: 'https://example.com' }))

  expect(rendered.articleType).toBe('news')
  if (rendered.articleType !== 'news') throw new Error('expected an ordinary WeChat news draft')

  expect(rendered.bodyAssets.map((asset) => asset.reference.original)).toEqual([
    '/images/cover.png',
    '/images/body.png',
  ])
  expect(rendered.html.indexOf(rendered.coverAsset.placeholder)).toBeLessThan(
    rendered.html.indexOf(rendered.bodyAssets[1]!.placeholder),
  )
})

it('can keep the WeChat draft cover out of the article body', async () => {
  const path = writePost(project, {
    frontmatter: { wechat: { enabled: true, showCoverInBody: false } },
    body: '一句导语。\n\n![正文图片](/images/body.png)',
  })
  const rendered = await prepareArticle(path, await project.resolved({ siteUrl: 'https://example.com' }))

  expect(rendered.articleType).toBe('news')
  if (rendered.articleType !== 'news') throw new Error('expected an ordinary WeChat news draft')

  expect(rendered.bodyAssets.map((asset) => asset.reference.original)).toEqual([
    '/images/body.png',
  ])
  expect(rendered.html).toContain('一句导语。')
  expect(rendered.html).not.toContain(rendered.coverAsset.placeholder)
})

// 2026-08-26 的微博图片草稿曾带着完整博客标题进入微信，超过后台 20 字限制。
it('rejects an oversized newspic title before rendering or uploading images', async () => {
  const path = writePost(project, {
    frontmatter: {
      title: '图'.repeat(21),
      wechat: { enabled: true, articleType: 'newspic' },
    },
    body: '![正文图片](/images/body.png)',
  })

  await expect(
    prepareArticle(path, await project.resolved({ siteUrl: 'https://example.com' })),
  ).rejects.toMatchObject({ code: 'newspic-title-too-long' })
})

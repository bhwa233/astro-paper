import { describe, expect, it } from 'vitest'
import { WeChatClient } from '../src/wechat/client.js'
import { readWechatConfig } from '../src/wechat/config.js'
import { OutcomeUnknownError } from '../src/wechat/errors.js'
import { TOKEN_OK, createMockFetch, jsonResponse, parseJsonBody, testConfig, timeoutError, type MockHandler } from './helpers/mock-wechat.js'

const IMAGE = { bytes: new Uint8Array([1, 2, 3]), filename: 'cover.png', contentType: 'image/png' }
const DRAFT = { articleType: 'news', title: '标题', author: '作者', digest: '摘要', content: '<p>正文</p>', thumbMediaId: 'cover-a', contentSourceUrl: 'https://example.com/posts/a/' } as const
const NEWSPIC_DRAFT = { articleType: 'newspic', title: '标题', author: '作者', content: '一句导语。', imageMediaIds: ['m-1', 'm-2'], contentSourceUrl: 'https://example.com/posts/a/' } as const

function withToken(handler: MockHandler): MockHandler {
  return (call, index) => call.upstreamUrl.pathname.endsWith('/cgi-bin/stable_token') ? jsonResponse(TOKEN_OK) : handler(call, index)
}

function client(handler: MockHandler) {
  const mock = createMockFetch(handler)
  return { client: new WeChatClient(testConfig({ maxRetries: 3 }), mock.fetch), mock }
}

describe('微信 API 客户端', () => {
  it('复用 access token，避免每个上传都请求一次凭证', async () => {
    const { client: wechat, mock } = client(withToken(() => jsonResponse({ url: 'https://mmbiz.qpic.cn/image' })))
    await wechat.uploadBodyImage(IMAGE)
    await wechat.uploadBodyImage(IMAGE)
    expect(mock.callsTo('/cgi-bin/stable_token')).toHaveLength(1)
  })

  it('创建草稿超时标记为结果不明且不重试，避免重复草稿', async () => {
    const { client: wechat, mock } = client(withToken(() => { throw timeoutError() }))
    await expect(wechat.createDraft(DRAFT)).rejects.toBeInstanceOf(OutcomeUnknownError)
    expect(mock.callsTo('/cgi-bin/draft/add')).toHaveLength(1)
  })

  it('图文草稿不带 article_type，保持既有请求形状', async () => {
    const { client: wechat, mock } = client(withToken(() => jsonResponse({ media_id: 'draft-a' })))
    await wechat.createDraft(DRAFT)

    const [article] = (parseJsonBody(mock.callsTo('/cgi-bin/draft/add')[0]?.body).articles ?? []) as Record<string, unknown>[]
    expect(article).toMatchObject({ digest: '摘要', thumb_media_id: 'cover-a' })
    expect(article).not.toHaveProperty('article_type')
    expect(article).not.toHaveProperty('image_info')
  })

  it('图片消息传 image_list，不传封面与摘要', async () => {
    const { client: wechat, mock } = client(withToken(() => jsonResponse({ media_id: 'draft-b' })))
    await wechat.createDraft(NEWSPIC_DRAFT)

    const [article] = (parseJsonBody(mock.callsTo('/cgi-bin/draft/add')[0]?.body).articles ?? []) as Record<string, unknown>[]
    expect(article).toMatchObject({
      article_type: 'newspic',
      content: '一句导语。',
      image_info: { image_list: [{ image_media_id: 'm-1' }, { image_media_id: 'm-2' }] },
    })
    // 首图即封面；额外传这两个字段等于向接口发送它在这个形态下不接受的东西。
    expect(article).not.toHaveProperty('thumb_media_id')
    expect(article).not.toHaveProperty('digest')
  })

  it('拒绝 HTTP 代理地址，避免将公众号凭证发到不安全链路', () => {
    expect(() => readWechatConfig({ WECHAT_APP_ID: 'id', WECHAT_APP_SECRET: 'secret', WECHAT_PROXY_URL: 'http://proxy.example.com', WECHAT_PROXY_TOKEN: 'token' })).toThrow(/必须是 HTTPS/)
  })
})

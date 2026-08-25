import { describe, expect, it } from 'vitest'
import { WeChatClient } from '../src/wechat/client.js'
import { readWechatConfig } from '../src/wechat/config.js'
import { OutcomeUnknownError } from '../src/wechat/errors.js'
import { TOKEN_OK, createMockFetch, jsonResponse, testConfig, timeoutError, type MockHandler } from './helpers/mock-wechat.js'

const IMAGE = { bytes: new Uint8Array([1, 2, 3]), filename: 'cover.png', contentType: 'image/png' }
const DRAFT = { title: '标题', author: '作者', digest: '摘要', content: '<p>正文</p>', thumbMediaId: 'cover-a', contentSourceUrl: 'https://example.com/posts/a/' }

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

  it('拒绝 HTTP 代理地址，避免将公众号凭证发到不安全链路', () => {
    expect(() => readWechatConfig({ WECHAT_APP_ID: 'id', WECHAT_APP_SECRET: 'secret', WECHAT_PROXY_URL: 'http://proxy.example.com', WECHAT_PROXY_TOKEN: 'token' })).toThrow(/必须是 HTTPS/)
  })
})

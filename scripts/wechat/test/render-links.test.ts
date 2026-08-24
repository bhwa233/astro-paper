import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/render/markdown.js'
import { rewriteOutboundLinks } from '../src/render/links.js'

const OPTIONS = { clickableHosts: [] as string[] }

function rewrite(markdown: string, options = OPTIONS) {
  return rewriteOutboundLinks(renderMarkdown(markdown), options)
}

describe('出站链接改写', () => {
  it('外部链接只留下锚点内容，链接本身消失', () => {
    const html = rewrite('见 [Astro 官网](https://astro.build) 说明。')

    expect(html).not.toContain('<a')
    expect(html).not.toContain('https://astro.build')
    expect(html).toContain('Astro 官网')
  })

  it('不生成编号，也不生成文末参考列表', () => {
    const html = rewrite(
      '[一](https://example.com/a) 和 [二](https://example.com/b) 还有 [三](https://example.com/c)',
    )

    expect(html).not.toContain('link-ref')
    expect(html).not.toContain('link-references')
    expect(html).not.toMatch(/\[\d+\]/)
  })

  it('锚文本本身是 URL 时，作为文本留下', () => {
    const html = rewrite('[https://example.com](https://example.com)')

    expect(html).not.toContain('<a')
    expect(html).toContain('https://example.com')
  })

  it('站内锚点保持原样', () => {
    const html = rewrite('[回到顶部](#top)')
    expect(html).toContain('href="#top"')
  })

  it('配置为可点击的域名保留为锚点', () => {
    const html = rewrite('[文章](https://mp.weixin.qq.com/s/abc)', {
      clickableHosts: ['mp.weixin.qq.com'],
    })

    expect(html).toContain('href="https://mp.weixin.qq.com/s/abc"')
  })

  // 解包而不是取 .text()：取文本会把这张图连同它的 src 一起丢掉，
  // 而正文里的图片正是后续 rewriteImages 要上传的东西。
  it('包着图片的链接不会把图片一起删掉', () => {
    const html = rewrite('[![说明](cover.png)](https://example.com)')

    expect(html).not.toContain('<a')
    expect(html).toContain('src="cover.png"')
  })

  it('图文混排的链接同时保住文字和图片', () => {
    const html = rewrite('[看图 ![说明](cover.png)](https://example.com)')

    expect(html).toContain('看图')
    expect(html).toContain('src="cover.png"')
  })

  it('锚点内的行内标记原样保留，交给后续的 sanitizer 把关', () => {
    const html = rewrite('[<b>粗体</b>](https://example.com)')

    expect(html).not.toContain('<a')
    expect(html).toContain('<b>粗体</b>')
  })
})

describe('与 Markdown 脚注共存', () => {
  const markdown = [
    '正文有脚注[^a] 和链接 [示例](https://example.com)。',
    '',
    '[^a]: 脚注内容。',
    '',
  ].join('\n')

  it('脚注引用与回跳锚点不受影响', () => {
    const html = rewrite(markdown)

    expect(html).toContain('footnote-ref')
    expect(html).toContain('footnote-backref')
    expect(html).toContain('footnotes-list')
  })

  it('外链不进入脚注列表，脚注编号不受外链影响', () => {
    const html = rewrite(markdown)

    expect(html).not.toContain('link-ref-item')
    expect(html).not.toContain('https://example.com')
  })
})

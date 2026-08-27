import { join } from 'node:path'
import { expect, it } from 'vitest'
import { WarningCollector } from '../src/errors.js'
import { toArticleDocument } from '../src/source/adapter.js'
import type { SourceArticle } from '../src/types.js'
import { createFixtureProject } from './helpers/project.js'

// 2026-08-27: an archived Reddit draft outside contentDir inherited siteUrl and
// was published with a nonexistent /posts/<archive-file>/ 阅读原文 link.
it('does not derive a canonical URL for a source outside the content directory', async () => {
  const project = createFixtureProject()

  try {
    const source: SourceArticle = {
      absolutePath: join(project.root, 'data/reddit-life-wechat/2099-01-01/01-post.md'),
      projectRelativePath: 'data/reddit-life-wechat/2099-01-01/01-post.md',
      frontmatter: {
        title: '归档稿',
        description: '归档稿摘要',
        author: '作者',
        ogImage: 'cover.png',
        wechat: { enabled: true, syncId: 'reddit-life-2099-01-01-v1' },
      },
      body: '正文',
      format: 'md',
    }
    const warnings = new WarningCollector()
    const document = toArticleDocument(
      source,
      await project.resolved({ siteUrl: 'https://example.com' }),
      warnings,
    )

    expect(document.sourceId).toBe('reddit-life-2099-01-01-v1')
    expect(document.canonicalUrl).toBeUndefined()
    expect(warnings.warnings.map(warning => warning.code)).toContain('no-canonical-url')

    const sourceUrl = 'https://example.com/posts/reddit-2099-01-01-life/'
    const explicitDocument = toArticleDocument(
      {
        ...source,
        frontmatter: {
          ...source.frontmatter,
          wechat: {
            enabled: true,
            syncId: 'reddit-life-2099-01-01-v1',
            sourceURL: sourceUrl,
          },
        },
      },
      await project.resolved({ siteUrl: 'https://example.com' }),
      new WarningCollector(),
    )
    expect(explicitDocument.canonicalUrl).toBe(sourceUrl)
  } finally {
    project.cleanup()
  }
})

import { describe, expect, it } from 'vitest'
import { FIELD_LIMITS } from '../src/constants.js'
import { WarningCollector } from '../src/errors.js'
import { assertWithinLimit, fitDigest } from '../src/source/validate.js'
import { codePointLength } from '../src/util/text.js'

describe('微信字段边界', () => {
  it('按码点限制标题，拒绝超限但允许同样数量的 emoji', () => {
    expect(() => assertWithinLimit('title', '字'.repeat(FIELD_LIMITS.title.max + 1), '/tmp/post.md')).toThrow(/超出微信限制/)
    expect(() => assertWithinLimit('title', '🎯'.repeat(FIELD_LIMITS.title.max), '/tmp/post.md')).not.toThrow()
  })

  it('截断超长摘要并留下警告，而不是让整篇文章无法发布', () => {
    const warnings = new WarningCollector()
    const digest = fitDigest('句子。'.repeat(200), warnings, '/tmp/post.md')
    expect(codePointLength(digest)).toBeLessThanOrEqual(FIELD_LIMITS.digest.max)
    expect(warnings.warnings.map(warning => warning.code)).toContain('digest-truncated')
  })
})

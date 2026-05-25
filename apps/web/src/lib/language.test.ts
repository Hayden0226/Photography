import { describe, expect, it } from 'vitest'

import { normalizeAppLanguage, toHtmlLanguage } from './language'

describe('language helpers', () => {
  it('maps browser language codes to supported app languages', () => {
    expect(normalizeAppLanguage('zh')).toBe('zh-CN')
    expect(normalizeAppLanguage('zh-Hans')).toBe('zh-CN')
    expect(normalizeAppLanguage('zh-Hant')).toBe('zh-TW')
    expect(normalizeAppLanguage('zh-HK')).toBe('zh-HK')
    expect(normalizeAppLanguage('en-US')).toBe('en')
    expect(normalizeAppLanguage('ja-JP')).toBe('jp')
    expect(normalizeAppLanguage('ko-KR')).toBe('ko')
  })

  it('uses valid HTML language codes', () => {
    expect(toHtmlLanguage('jp')).toBe('ja')
    expect(toHtmlLanguage('zh-CN')).toBe('zh-CN')
  })
})

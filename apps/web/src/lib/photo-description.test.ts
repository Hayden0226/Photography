import { describe, expect, it } from 'vitest'

import { getLocalizedPhotoTitle, getSearchablePhotoTitles } from './photo-description'

describe('photo description helpers', () => {
  it('selects localized photo titles with language fallback', () => {
    const photo = {
      title: '默认标题',
      titles: {
        'zh-CN': '中文标题',
        en: 'English title',
      },
    }

    expect(getLocalizedPhotoTitle(photo, 'en-US')).toBe('English title')
    expect(getLocalizedPhotoTitle(photo, 'zh-HK')).toBe('中文标题')
    expect(getLocalizedPhotoTitle(photo, 'fr')).toBe('English title')
  })

  it('falls back to the legacy title when localized titles are unavailable', () => {
    expect(getLocalizedPhotoTitle({ title: '旧标题' }, 'en')).toBe('旧标题')
  })

  it('deduplicates searchable photo titles', () => {
    const titles = getSearchablePhotoTitles({
      title: '中文标题',
      titles: {
        'zh-CN': '中文标题',
        en: 'English title',
      },
    })

    expect(titles).toEqual(['中文标题', 'English title'])
  })
})

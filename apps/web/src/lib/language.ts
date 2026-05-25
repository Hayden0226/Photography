import type { MainSupportedLanguages } from '~/@types/constants'
import { currentSupportedLanguages } from '~/@types/constants'

const supportedLanguageSet = new Set<string>(currentSupportedLanguages)

export function normalizeAppLanguage(language?: string | null): MainSupportedLanguages | undefined {
  const normalized = language?.trim()
  if (!normalized) return undefined

  const lower = normalized.toLowerCase()

  if (supportedLanguageSet.has(normalized)) {
    return normalized as MainSupportedLanguages
  }

  if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-hans' || lower.startsWith('zh-hans-')) {
    return 'zh-CN'
  }

  if (lower === 'zh-hk' || lower === 'zh-mo') {
    return 'zh-HK'
  }

  if (lower === 'zh-tw' || lower === 'zh-hant' || lower.startsWith('zh-hant-')) {
    return 'zh-TW'
  }

  if (lower === 'ja' || lower.startsWith('ja-') || lower === 'jp') {
    return 'jp'
  }

  if (lower === 'ko' || lower.startsWith('ko-')) {
    return 'ko'
  }

  if (lower === 'en' || lower.startsWith('en-')) {
    return 'en'
  }

  return undefined
}

export function toHtmlLanguage(language?: string | null): string {
  const normalized = normalizeAppLanguage(language) ?? 'en'
  return normalized === 'jp' ? 'ja' : normalized
}

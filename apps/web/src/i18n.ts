import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { atom } from 'jotai'
import { initReactI18next } from 'react-i18next'

import { currentSupportedLanguages } from './@types/constants'
import { resources } from './@types/resources'
import { jotaiStore } from './lib/jotai'
import { normalizeAppLanguage } from './lib/language'

const i18n = i18next.createInstance()
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    detection: {
      order: ['querystring', 'hash', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag'],
      convertDetectedLanguage: (language) => normalizeAppLanguage(language) ?? language,
    },
    fallbackLng: {
      ja: ['jp'],
      zh: ['zh-CN'],
      default: ['en'],
    },
    defaultNS: 'app',
    resources,
    supportedLngs: currentSupportedLanguages,
  })

export const i18nAtom = atom(i18n)

export const getI18n = () => {
  return jotaiStore.get(i18nAtom)
}

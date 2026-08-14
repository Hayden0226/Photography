import { merge } from 'es-toolkit/compat'

import userConfig from './config.json'

export interface SiteConfig {
  name: string
  title: string
  description: string
  url: string
  accentColor: string
  author: Author
  social?: Social
  feed?: Feed
  map?: MapConfig
  mapStyle?: string
  mapProjection?: 'globe' | 'mercator'
}

/**
 * Map configuration - can be either:
 * - A string for a single provider: 'maplibre'
 * - An array for multiple providers in priority order: ['maplibre']
 */
type MapConfig = 'maplibre'[]

interface Feed {
  folo?: {
    challenge?: {
      feedId: string
      userId: string
    }
  }
}
interface Author {
  name: string
  url: string
  avatar?: string
}
interface Social {
  twitter?: string
  github?: string
  instagram?: string
  rss?: boolean
}

const defaultConfig: SiteConfig = {
  name: "Hayden's Photography",
  title: "Hayden's Photography",
  description:
    'Hayden 的摄影画廊。用镜头记录光影与故事，在方寸之间留住值得纪念的瞬间。',
  url: 'https://visuals.haydenweb.com',
  accentColor: '#007bff',
  author: {
    name: 'Hayden',
    url: 'https://github.com/Hayden0226',
    avatar: '/images/avatar.jpg',
  },
}
export const siteConfig: SiteConfig = merge(defaultConfig, userConfig) as any

export default siteConfig

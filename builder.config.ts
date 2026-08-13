import { defineBuilderConfig } from '@afilmory/builder'

const fixtureMode = process.env.AFILMORY_E2E_FIXTURE === 'true'

export default defineBuilderConfig(() => ({
  // Publication policy: keep exact EXIF GPS coordinates in the public full
  // manifest for the map. See packages/docs/contents/photo-metadata/index.mdx.
  storage: {
    provider: 'local',
    basePath: process.env.AFILMORY_PHOTOS_PATH || './photos',
    baseUrl: process.env.AFILMORY_PHOTOS_BASE_URL || '/photos/',
    excludeRegex: '^incoming($|/.*)',
  },
  plugins: [new URL('plugins/builder/photo-descriptions.ts', import.meta.url).href],
}))

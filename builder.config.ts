import { defineBuilderConfig } from '@afilmory/builder'

const fixtureMode = process.env.AFILMORY_E2E_FIXTURE === 'true'

export default defineBuilderConfig(() => ({
  // Publication policy: photos keep exact EXIF GPS coordinates unless the
  // author protects them with `pnpm run photos:privacy`, which rounds
  // coordinates onto a ~0.05° (~5 km) grid with a small random offset.
  // See packages/docs/contents/photo-metadata/index.mdx.
  storage: {
    provider: 'local',
    basePath: process.env.AFILMORY_PHOTOS_PATH || './photos',
    baseUrl: process.env.AFILMORY_PHOTOS_BASE_URL || '/photos/',
    excludeRegex: '^incoming($|/.*)',
  },
  plugins: [new URL('plugins/builder/photo-descriptions.ts', import.meta.url).href],
}))

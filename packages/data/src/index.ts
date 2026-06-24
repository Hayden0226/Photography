import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem, PickedExif } from '@afilmory/builder'

export type GalleryExif = Pick<
  PickedExif,
  'ISO' | 'FNumber' | 'ExposureTime' | 'FocalLength' | 'FocalLengthIn35mmFormat'
>

export interface PhotoManifestIndexItem extends Omit<
  PhotoManifestItem,
  'exif' | 'fileCreatedAt' | 's3Key' | 'toneAnalysis'
> {
  sortTime: number
  cameraDisplayName?: string
  lensDisplayName?: string
  rating?: number
  galleryExif?: GalleryExif | null
  exif?: PickedExif | null
  fileCreatedAt?: string
  s3Key?: string
  toneAnalysis?: PhotoManifestItem['toneAnalysis'] | null
}

export interface AfilmoryIndexManifest extends Omit<AfilmoryManifest, 'data'> {
  data: PhotoManifestIndexItem[]
}

export interface PhotoTextEntry {
  title?: string
  description?: string
}

export interface PhotoTextPack {
  version?: string
  language: string
  photos: Record<string, PhotoTextEntry>
}

export interface ResolvedPhotoText {
  title: string
  description: string
}

declare const __MANIFEST__: AfilmoryIndexManifest
declare const __FULL_MANIFEST_URL__: string | undefined

const DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE = 'zh-CN'

function resolvePhotoTextLanguage(language: string): string {
  const normalized = language.trim()
  const baseLanguage = normalized.split('-')[0]?.toLowerCase()

  if (baseLanguage === 'zh') {
    return DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE
  }

  if (baseLanguage === 'en') {
    return 'en'
  }

  return 'en'
}

function getLanguageCandidates(language: string): string[] {
  const normalized = language.trim()
  const resolved = resolvePhotoTextLanguage(normalized)

  if (resolved === DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE) {
    return [normalized, DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE, 'en']
  }

  return [normalized, resolved, DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE]
}

function getLocalizedText(values: Record<string, string> | undefined, language: string): string {
  if (!values) return ''

  for (const candidate of getLanguageCandidates(language)) {
    const value = values[candidate]?.trim()
    if (value) return value
  }

  return ''
}

function getRuntimePhotoTextUrls(): Record<string, string> {
  const runtime = globalThis as typeof globalThis & {
    __PHOTO_TEXT_URLS__?: Record<string, string>
  }

  return runtime.__PHOTO_TEXT_URLS__ ?? {}
}

class PhotoLoader {
  private photos: PhotoManifestIndexItem[] = []
  private photoMap: Record<string, PhotoManifestIndexItem> = {}
  private cameras: CameraInfo[] = []
  private lenses: LensInfo[] = []
  private fullManifestPromise: Promise<AfilmoryManifest> | null = null
  private fullManifest: AfilmoryManifest | null = null
  private fullPhotoMap: Record<string, PhotoManifestItem> | null = null
  private photoTextUrls: Record<string, string> = {}
  private photoTextPromises = new Map<string, Promise<PhotoTextPack | null>>()
  private photoTextPacks = new Map<string, PhotoTextPack>()
  private loadedPhotoTextLanguages = new Set<string>([DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE])
  private searchableTextCache = new WeakMap<object, string[]>()

  constructor() {
    this.getAllTags = this.getAllTags.bind(this)
    this.getAllCameras = this.getAllCameras.bind(this)
    this.getAllLenses = this.getAllLenses.bind(this)
    this.getPhotos = this.getPhotos.bind(this)
    this.getPhoto = this.getPhoto.bind(this)
    this.getFullPhotos = this.getFullPhotos.bind(this)
    this.getPhotoDetail = this.getPhotoDetail.bind(this)
    this.loadFullManifest = this.loadFullManifest.bind(this)
    this.loadPhotoText = this.loadPhotoText.bind(this)
    this.getPhotoText = this.getPhotoText.bind(this)
    this.getSearchablePhotoText = this.getSearchablePhotoText.bind(this)

    this.photos = __MANIFEST__.data
    this.cameras = __MANIFEST__.cameras as unknown as CameraInfo[]
    this.lenses = __MANIFEST__.lenses as unknown as LensInfo[]
    this.photoTextUrls = getRuntimePhotoTextUrls()

    this.photos.forEach((photo) => {
      this.photoMap[photo.id] = photo
    })
  }

  getPhotos() {
    return this.photos
  }

  getPhoto(id: string) {
    return this.photoMap[id]
  }

  async loadFullManifest(): Promise<AfilmoryManifest> {
    if (this.fullManifest) {
      return this.fullManifest
    }

    if (!this.fullManifestPromise) {
      this.fullManifestPromise = this.fetchFullManifest()
    }

    return this.fullManifestPromise
  }

  async getFullPhotos(): Promise<PhotoManifestItem[]> {
    const manifest = await this.loadFullManifest()
    return manifest.data
  }

  async getPhotoDetail(id: string): Promise<PhotoManifestItem | undefined> {
    const manifest = await this.loadFullManifest()
    if (!this.fullPhotoMap) {
      this.fullPhotoMap = Object.fromEntries(manifest.data.map((photo) => [photo.id, photo]))
    }

    return this.fullPhotoMap[id]
  }

  async loadPhotoText(language: string): Promise<PhotoTextPack | null> {
    const resolvedLanguage = resolvePhotoTextLanguage(language)
    if (this.loadedPhotoTextLanguages.has(resolvedLanguage)) {
      return this.photoTextPacks.get(resolvedLanguage) ?? null
    }

    const existingPromise = this.photoTextPromises.get(resolvedLanguage)
    if (existingPromise) {
      return existingPromise
    }

    const promise = this.fetchPhotoText(resolvedLanguage).catch((error) => {
      this.photoTextPromises.delete(resolvedLanguage)
      throw error
    })
    this.photoTextPromises.set(resolvedLanguage, promise)
    return promise
  }

  getPhotoText(photo: PhotoManifestIndexItem | PhotoManifestItem, language: string): ResolvedPhotoText {
    const title = getLocalizedText(photo.titles, language) || photo.title || ''
    const description = getLocalizedText(photo.descriptions, language) || photo.description || ''

    return {
      title,
      description,
    }
  }

  getSearchablePhotoText(photo: PhotoManifestIndexItem | PhotoManifestItem): string[] {
    const cached = this.searchableTextCache.get(photo)
    if (cached) return cached

    const values = [
      photo.title,
      photo.description,
      ...Object.values(photo.titles ?? {}),
      ...Object.values(photo.descriptions ?? {}),
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0)

    const searchableText = Array.from(new Set(values))
    this.searchableTextCache.set(photo, searchableText)
    return searchableText
  }

  getAllTags() {
    const tagSet = new Set<string>()
    this.photos.forEach((photo) => {
      photo.tags.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }

  getAllCameras() {
    return this.cameras
  }

  getAllLenses() {
    return this.lenses
  }

  private async fetchPhotoText(language: string): Promise<PhotoTextPack | null> {
    const url = this.photoTextUrls[language]
    if (!url) {
      this.loadedPhotoTextLanguages.add(language)
      return null
    }

    const response = await fetch(url, {
      credentials: 'same-origin',
    })

    if (!response.ok) {
      throw new Error(`Failed to load photo text pack (${language}): ${response.status}`)
    }

    const pack = (await response.json()) as PhotoTextPack
    this.applyPhotoTextPack(language, pack)
    this.photoTextPacks.set(language, pack)
    this.loadedPhotoTextLanguages.add(language)

    return pack
  }

  private applyPhotoTextPack(language: string, pack: PhotoTextPack) {
    for (const [photoId, text] of Object.entries(pack.photos)) {
      const title = text.title?.trim()
      const description = text.description?.trim()
      if (!title && !description) continue

      const indexPhoto = this.photoMap[photoId]
      if (indexPhoto) {
        this.applyPhotoText(indexPhoto, language, title, description)
      }

      const fullPhoto = this.fullPhotoMap?.[photoId]
      if (fullPhoto) {
        this.applyPhotoText(fullPhoto, language, title, description)
      }
    }

    this.searchableTextCache = new WeakMap<object, string[]>()
  }

  private applyPhotoText(
    photo: PhotoManifestIndexItem | PhotoManifestItem,
    language: string,
    title: string | undefined,
    description: string | undefined,
  ) {
    if (title) {
      photo.titles = {
        ...photo.titles,
        [language]: title,
      }
    }

    if (description) {
      photo.descriptions = {
        ...photo.descriptions,
        [language]: description,
      }
    }
  }

  private async fetchFullManifest(): Promise<AfilmoryManifest> {
    const fullManifestUrl = __FULL_MANIFEST_URL__ === undefined ? undefined : __FULL_MANIFEST_URL__
    if (!fullManifestUrl) {
      return __MANIFEST__ as unknown as AfilmoryManifest
    }

    const response = await fetch(fullManifestUrl, {
      credentials: 'same-origin',
    })

    if (!response.ok) {
      throw new Error(`Failed to load full manifest: ${response.status}`)
    }

    const manifest = (await response.json()) as AfilmoryManifest
    this.fullManifest = manifest
    this.fullPhotoMap = Object.fromEntries(manifest.data.map((photo) => [photo.id, photo]))

    return manifest
  }
}
export const photoLoader = new PhotoLoader()

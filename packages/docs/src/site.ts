export const docsSite = {
  name: "Hayden's Photography Docs",
  description:
    "Documentation for Hayden's Photography at docs.visuals.haydenweb.com, covering the gallery, photo pipeline, storage, performance, and deployment.",
  url: 'https://docs.visuals.haydenweb.com',
  galleryUrl: 'https://visuals.haydenweb.com',
  homepageUrl: 'https://haydenweb.com/',
  repositoryUrl: 'https://github.com/Hayden0226/Photography',
  authorName: 'Hayden0226',
  avatarUrl: '/images/avatar.jpg',
} as const

export function getDocsUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(normalizedPath, `${docsSite.url}/`).toString()
}

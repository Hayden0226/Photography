export const docsSite = {
  name: "Jacky's Photography Docs",
  description:
    "Documentation for Jacky's Photography at docs.photo.jackyw.cn, covering the gallery, photo pipeline, storage, performance, and deployment.",
  url: 'https://docs.photo.jackyw.cn',
  galleryUrl: 'https://photo.jackyw.cn',
  homepageUrl: 'https://jackyw.cn/',
  repositoryUrl: 'https://github.com/Jackyhq/Photography',
  authorName: 'Jackywhq',
  avatarUrl: 'https://photos3.jackyw.cn/logo/avatar/final-1.png',
} as const

export function getDocsUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(normalizedPath, `${docsSite.url}/`).toString()
}

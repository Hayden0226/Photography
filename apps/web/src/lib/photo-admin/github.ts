// GitHub API client for the photo-admin manage panel.
// Only reachable from the hidden `?manage=1` mode on the photo detail page.

export const PHOTO_REPO_OWNER = 'Hayden0226'
export const PHOTO_REPO_NAME = 'Photography-Photos'
export const MAIN_REPO_NAME = 'Photography'

const qualifyRepoName = (repo: string): string => (repo.includes('/') ? repo : `${PHOTO_REPO_OWNER}/${repo}`)

export interface GitHubFile {
  path: string
  sha: string
  size: number
  content: string
  encoding: 'base64'
}

const TOKEN_STORAGE_KEY = 'photo-admin:github-token'

export const getAdminToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_STORAGE_KEY)
}

export const setAdminToken = (token: string): void => {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim())
}

export const clearAdminToken = (): void => {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export class GitHubApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
  }
}

const encodeRepoPath = (path: string): string =>
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

const githubFetch = async (token: string, path: string, init: RequestInit = {}): Promise<Response> => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { message?: string }
      detail = body.message ?? ''
    } catch {
      // ignore JSON parse failure
    }
    const suffix = detail ? `: ${detail}` : ''
    throw new GitHubApiError(`GitHub API ${response.status}${suffix}`, response.status)
  }

  return response
}

export const getRepoFile = async (token: string, repo: string, path: string): Promise<GitHubFile> => {
  const response = await githubFetch(token, `/repos/${qualifyRepoName(repo)}/contents/${encodeRepoPath(path)}`)
  return (await response.json()) as GitHubFile
}

export interface RepoFileCommit {
  content: string
  sha?: string
  message: string
}

export const createOrUpdateRepoFile = async (
  token: string,
  repo: string,
  path: string,
  options: RepoFileCommit,
): Promise<unknown> => {
  const response = await githubFetch(token, `/repos/${qualifyRepoName(repo)}/contents/${encodeRepoPath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: options.message,
      content: options.content,
      ...(options.sha ? { sha: options.sha } : {}),
    }),
  })
  return response.json()
}

export const deleteRepoFile = async (
  token: string,
  repo: string,
  path: string,
  sha: string,
  message: string,
): Promise<unknown> => {
  const response = await githubFetch(token, `/repos/${qualifyRepoName(repo)}/contents/${encodeRepoPath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha }),
  })
  return response.json()
}

export const isNotFound = (error: unknown): boolean => error instanceof GitHubApiError && error.status === 404

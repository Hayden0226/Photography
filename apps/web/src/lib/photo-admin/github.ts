// GitHub API client for the photo-admin manage panel.
// Only reachable from the hidden `?manage=1` mode on the photo detail page.

export const PHOTO_REPO_OWNER = 'Hayden0226'
export const PHOTO_REPO_NAME = 'Photography-Photos'
export const MAIN_REPO_NAME = 'Photography'
export const MAIN_REPO_BRANCH = 'main'
export const PAGES_WORKFLOW_FILE = 'pages.yml'

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

const NETWORK_RETRY_ATTEMPTS = 3

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const encodeRepoPath = (path: string): string =>
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

const githubFetch = async (token: string, path: string, init: RequestInit = {}): Promise<Response> => {
  let lastError: unknown

  for (let attempt = 1; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
    try {
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
    } catch (error) {
      // 只重试网络层失败（fetch 被拒绝），HTTP 错误状态不重试
      if (error instanceof GitHubApiError) throw error
      lastError = error
      if (attempt < NETWORK_RETRY_ATTEMPTS) {
        await sleep(400 * 2 ** (attempt - 1))
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('GitHub API 请求失败')
}

export const getRepoFile = async (token: string, repo: string, path: string): Promise<GitHubFile> => {
  const file = (await getRepoFileMeta(token, repo, path)) as GitHubFile

  // The contents API omits `content` for files larger than 1 MB; fetch the full blob via the git blobs API.
  if (!file.content) {
    const blobResponse = await githubFetch(token, `/repos/${qualifyRepoName(repo)}/git/blobs/${file.sha}`)
    const blob = (await blobResponse.json()) as { content: string; encoding: 'base64' }
    file.content = blob.content
  }

  return file
}

// Metadata-only lookup. Comparing two photos only needs the blob sha, and the contents API
// already returns it, so this avoids downloading multi-megabyte blobs just to check for equality.
export const getRepoFileMeta = async (token: string, repo: string, path: string): Promise<GitHubFile> => {
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

// The site bundles photos at build time, so a change that lives only in the private photo
// repository still needs a fresh Pages deployment. When an operation produces no commit in the
// main repository (for example deleting a photo that has no description entry), trigger the
// workflow explicitly so the published site cannot drift from the repository.
export const triggerPagesDeploy = async (token: string): Promise<void> => {
  await githubFetch(
    token,
    `/repos/${qualifyRepoName(MAIN_REPO_NAME)}/actions/workflows/${PAGES_WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      body: JSON.stringify({ ref: MAIN_REPO_BRANCH }),
    },
  )
}

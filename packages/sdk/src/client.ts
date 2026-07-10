import type { AnalysisDto, AnalysisResponse, ReactionDto, ViewDto } from './types'

export type { AnalysisDto, AnalysisResponse, ReactionDto, ViewDto } from './types'

export class Client {
  constructor(private readonly baseUrl: string) {}

  private buildUrl(path: string) {
    return `${this.baseUrl}${path}`
  }

  async actView(data: ViewDto) {
    return fetch(this.buildUrl('/api/act/views'), {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  async actReaction(data: ReactionDto) {
    return fetch(this.buildUrl('/api/reactions/add'), {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  async analysis(data: AnalysisDto) {
    const query = new URLSearchParams({ ...data }).toString()
    return (await fetch(this.buildUrl(`/api/reactions?${query}`), {
      method: 'GET',
    }).then((res) => res.json())) as Promise<AnalysisResponse>
  }
}

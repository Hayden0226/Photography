export interface ViewDto {
  refKey: string
}

export interface ReactionDto {
  refKey: string
  reaction: string
}

export interface AnalysisDto {
  refKey: string
}

export interface AnalysisResponse {
  data: {
    view: number
    reactions: Record<string, number>
  }
}

import { z } from 'zod'

import type { AnalysisDto, ReactionDto, ViewDto } from './types'

export { Client } from './client'
export type { AnalysisDto, AnalysisResponse, ReactionDto, ViewDto } from './types'

export const ViewDtoSchema: z.ZodType<ViewDto> = z.object({
  refKey: z.string().min(1),
})

export const ReactionDtoSchema: z.ZodType<ReactionDto> = z.object({
  refKey: z.string().min(1),
  reaction: z.string().min(1).max(20),
})

export const AnalysisDtoSchema: z.ZodType<AnalysisDto> = z.object({
  refKey: z.string().min(1),
})

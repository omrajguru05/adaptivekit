export type EventType = 'view' | 'click' | 'dwell'

export type AdaptiveKitEvent = {
  blockId: string
  userId: string
  eventType: EventType
  dwellMs?: number
  timestamp: number
  sessionId: string
}

export type BlockAffinity = {
  score: number
  lastUpdate: number
  clicks: number
  views: number
  dwells: number
  totalDwellMs: number
}

export type AffinityState = {
  userId: string
  blocks: Record<string, BlockAffinity>
  updatedAt: number
  version: 1
}

export type RankedLayout = {
  userId: string
  rankedBlockIds: string[]
  scores: Record<string, number>
  generatedAt: number
}

export type EngineWeights = {
  click: number
  dwell: number
  view: number
}

export type EngineOptions = {
  lambda?: number
  weights?: Partial<EngineWeights>
  dwellSaturationMs?: number
}

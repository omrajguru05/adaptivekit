export type EventType = 'view' | 'click' | 'dwell'

export type AdaptiveKitEvent = {
  blockId: string
  userId: string
  eventType: EventType
  dwellMs?: number
  timestamp: number
  sessionId: string
}

export type AdaptiveKitOptions = {
  userId: string
  onEvent: (event: AdaptiveKitEvent) => void
  attribute?: string
  viewThreshold?: number
  dwellMinMs?: number
  sessionId?: string
  root?: Element | Document | null
  debug?: boolean
}

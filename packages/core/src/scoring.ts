import type { AdaptiveKitEvent, BlockAffinity, EngineWeights } from './types.js'

export const DEFAULT_WEIGHTS: EngineWeights = {
  click: 3,
  dwell: 2,
  view: 0.5,
}

export const DEFAULT_LAMBDA_PER_DAY = 0.05
export const DEFAULT_DWELL_SATURATION_MS = 30_000

const MS_PER_DAY = 86_400_000

export function decayMultiplier(deltaMs: number, lambdaPerDay: number): number {
  if (deltaMs <= 0) return 1
  const days = deltaMs / MS_PER_DAY
  return Math.exp(-lambdaPerDay * days)
}

export function decayForward(
  block: BlockAffinity,
  toTimestamp: number,
  lambdaPerDay: number,
): number {
  const delta = toTimestamp - block.lastUpdate
  return block.score * decayMultiplier(delta, lambdaPerDay)
}

export function eventWeight(
  event: AdaptiveKitEvent,
  weights: EngineWeights,
  dwellSaturationMs: number,
): number {
  switch (event.eventType) {
    case 'click':
      return weights.click
    case 'view':
      return weights.view
    case 'dwell': {
      const dwellMs = event.dwellMs ?? 0
      if (dwellMs <= 0) return 0
      const saturated = Math.min(dwellMs, dwellSaturationMs)
      return weights.dwell * (saturated / dwellSaturationMs)
    }
  }
}

export function emptyBlockAffinity(timestamp: number): BlockAffinity {
  return {
    score: 0,
    lastUpdate: timestamp,
    clicks: 0,
    views: 0,
    dwells: 0,
    totalDwellMs: 0,
  }
}

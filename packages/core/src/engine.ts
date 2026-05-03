import {
  DEFAULT_DWELL_SATURATION_MS,
  DEFAULT_LAMBDA_PER_DAY,
  DEFAULT_WEIGHTS,
  decayForward,
  emptyBlockAffinity,
  eventWeight,
} from './scoring.js'
import type {
  AdaptiveKitEvent,
  AffinityState,
  BlockAffinity,
  EngineOptions,
  EngineWeights,
  RankedLayout,
} from './types.js'

export class AdaptiveEngine {
  private readonly states = new Map<string, AffinityState>()
  private readonly lambda: number
  private readonly weights: EngineWeights
  private readonly dwellSaturationMs: number

  constructor(options: EngineOptions = {}) {
    this.lambda = options.lambda ?? DEFAULT_LAMBDA_PER_DAY
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights }
    this.dwellSaturationMs = options.dwellSaturationMs ?? DEFAULT_DWELL_SATURATION_MS
  }

  ingestEvent(event: AdaptiveKitEvent): void {
    if (!event.blockId || !event.userId) return

    const state = this.getOrCreateState(event.userId)
    const block = state.blocks[event.blockId] ?? emptyBlockAffinity(event.timestamp)

    const decayed = decayForward(block, event.timestamp, this.lambda)
    const added = eventWeight(event, this.weights, this.dwellSaturationMs)

    block.score = decayed + added
    block.lastUpdate = event.timestamp

    if (event.eventType === 'click') block.clicks += 1
    else if (event.eventType === 'view') block.views += 1
    else if (event.eventType === 'dwell') {
      block.dwells += 1
      block.totalDwellMs += event.dwellMs ?? 0
    }

    state.blocks[event.blockId] = block
    state.updatedAt = event.timestamp
  }

  getScore(userId: string, blockId: string, now: number = Date.now()): number {
    const state = this.states.get(userId)
    if (!state) return 0
    const block = state.blocks[blockId]
    if (!block) return 0
    return decayForward(block, now, this.lambda)
  }

  getLayout(userId: string, now: number = Date.now()): RankedLayout {
    const state = this.states.get(userId)
    const scores: Record<string, number> = {}

    if (state) {
      for (const [blockId, block] of Object.entries(state.blocks)) {
        scores[blockId] = decayForward(block, now, this.lambda)
      }
    }

    const rankedBlockIds = Object.keys(scores).sort((a, b) => {
      const scoreA = scores[a] ?? 0
      const scoreB = scores[b] ?? 0
      if (scoreB !== scoreA) return scoreB - scoreA
      return a.localeCompare(b)
    })

    return {
      userId,
      rankedBlockIds,
      scores,
      generatedAt: now,
    }
  }

  getTrackedBlockIds(userId: string): string[] {
    const state = this.states.get(userId)
    if (!state) return []
    return Object.keys(state.blocks)
  }

  exportState(userId: string): AffinityState {
    const state = this.states.get(userId)
    if (!state) {
      return {
        userId,
        blocks: {},
        updatedAt: 0,
        version: 1,
      }
    }
    return cloneState(state)
  }

  importState(userId: string, state: AffinityState | null | undefined): void {
    if (!state) return
    if (state.version !== 1) {
      throw new Error(`Unsupported AffinityState version: ${state.version}`)
    }
    this.states.set(userId, cloneState({ ...state, userId }))
  }

  reset(userId?: string): void {
    if (userId) {
      this.states.delete(userId)
    } else {
      this.states.clear()
    }
  }

  private getOrCreateState(userId: string): AffinityState {
    let state = this.states.get(userId)
    if (!state) {
      state = { userId, blocks: {}, updatedAt: 0, version: 1 }
      this.states.set(userId, state)
    }
    return state
  }
}

function cloneState(state: AffinityState): AffinityState {
  const blocks: Record<string, BlockAffinity> = {}
  for (const [id, block] of Object.entries(state.blocks)) {
    blocks[id] = { ...block }
  }
  return {
    userId: state.userId,
    blocks,
    updatedAt: state.updatedAt,
    version: 1,
  }
}

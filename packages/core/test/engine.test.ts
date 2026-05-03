import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AdaptiveEngine, decayMultiplier } from '../src/index.js'
import type { AdaptiveKitEvent } from '../src/index.js'

const DAY = 86_400_000

function event(
  blockId: string,
  eventType: AdaptiveKitEvent['eventType'],
  timestamp: number,
  extra: Partial<AdaptiveKitEvent> = {},
): AdaptiveKitEvent {
  return {
    blockId,
    userId: 'u1',
    eventType,
    timestamp,
    sessionId: 's1',
    ...extra,
  }
}

describe('AdaptiveEngine', () => {
  it('ranks blocks with more clicks higher', () => {
    const engine = new AdaptiveEngine()
    const t = 1_700_000_000_000
    engine.ingestEvent(event('b-cold', 'view', t))
    engine.ingestEvent(event('b-hot', 'view', t))
    engine.ingestEvent(event('b-hot', 'click', t))
    engine.ingestEvent(event('b-hot', 'click', t))

    const layout = engine.getLayout('u1', t)
    assert.deepEqual(layout.rankedBlockIds, ['b-hot', 'b-cold'])
    assert.ok((layout.scores['b-hot'] ?? 0) > (layout.scores['b-cold'] ?? 0))
  })

  it('weights clicks > dwells > views', () => {
    const engine = new AdaptiveEngine()
    const t = 1_700_000_000_000
    engine.ingestEvent(event('view-only', 'view', t))
    engine.ingestEvent(event('dwell-only', 'dwell', t, { dwellMs: 30_000 }))
    engine.ingestEvent(event('click-only', 'click', t))

    const layout = engine.getLayout('u1', t)
    assert.deepEqual(layout.rankedBlockIds, ['click-only', 'dwell-only', 'view-only'])
  })

  it('applies time decay so older signals matter less', () => {
    const engine = new AdaptiveEngine()
    const now = 1_700_000_000_000
    engine.ingestEvent(event('old', 'click', now - 30 * DAY))
    engine.ingestEvent(event('new', 'click', now))

    const layout = engine.getLayout('u1', now)
    assert.deepEqual(layout.rankedBlockIds, ['new', 'old'])
    const oldScore = layout.scores['old'] ?? 0
    const newScore = layout.scores['new'] ?? 0
    assert.ok(oldScore < newScore)
    assert.ok(oldScore > 0)
  })

  it('forward-decay accumulation matches per-event decay sum', () => {
    const lambda = 0.05
    const engine = new AdaptiveEngine({ lambda })
    const start = 1_700_000_000_000
    engine.ingestEvent(event('b', 'click', start))
    engine.ingestEvent(event('b', 'click', start + 10 * DAY))
    engine.ingestEvent(event('b', 'click', start + 20 * DAY))

    const queryTime = start + 30 * DAY
    const got = engine.getScore('u1', 'b', queryTime)

    const expected =
      3 * decayMultiplier(30 * DAY, lambda) +
      3 * decayMultiplier(20 * DAY, lambda) +
      3 * decayMultiplier(10 * DAY, lambda)

    assert.ok(Math.abs(got - expected) < 1e-9, `got ${got}, expected ${expected}`)
  })

  it('exportState/importState round-trips', () => {
    const a = new AdaptiveEngine()
    const t = 1_700_000_000_000
    a.ingestEvent(event('b1', 'click', t))
    a.ingestEvent(event('b2', 'view', t))

    const snapshot = a.exportState('u1')
    const b = new AdaptiveEngine()
    b.importState('u1', snapshot)

    const layoutA = a.getLayout('u1', t + DAY)
    const layoutB = b.getLayout('u1', t + DAY)
    assert.deepEqual(layoutA.rankedBlockIds, layoutB.rankedBlockIds)
    assert.deepEqual(layoutA.scores, layoutB.scores)
  })

  it('returns empty state for unknown users', () => {
    const engine = new AdaptiveEngine()
    const layout = engine.getLayout('nobody', 1_700_000_000_000)
    assert.deepEqual(layout.rankedBlockIds, [])
    assert.deepEqual(layout.scores, {})
    const exported = engine.exportState('nobody')
    assert.equal(exported.version, 1)
    assert.deepEqual(exported.blocks, {})
  })

  it('saturates dwell weight at the configured ceiling', () => {
    const engine = new AdaptiveEngine({ dwellSaturationMs: 10_000 })
    const t = 1_700_000_000_000
    engine.ingestEvent(event('short', 'dwell', t, { dwellMs: 5_000 }))
    engine.ingestEvent(event('long', 'dwell', t, { dwellMs: 60_000 }))

    const layout = engine.getLayout('u1', t)
    assert.equal(layout.scores['short'], 1)
    assert.equal(layout.scores['long'], 2)
  })

  it('handles 1000 events under 5ms', () => {
    const engine = new AdaptiveEngine()
    const start = 1_700_000_000_000
    for (let i = 0; i < 1000; i++) {
      engine.ingestEvent(event(`b-${i % 50}`, 'view', start + i * 1000))
    }
    const t0 = performance.now()
    const layout = engine.getLayout('u1', start + 1_000_000)
    const elapsed = performance.now() - t0
    assert.equal(layout.rankedBlockIds.length, 50)
    assert.ok(elapsed < 5, `getLayout took ${elapsed}ms, expected < 5ms`)
  })
})

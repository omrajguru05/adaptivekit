import type { AdaptiveKitEvent, AdaptiveKitOptions } from './types.js'
import { isBrowser, ready } from './env.js'
import { resolveSessionId } from './session.js'

type TrackerInternals = {
  observer: IntersectionObserver
  mutation: MutationObserver
  observed: Set<Element>
  enteredAt: WeakMap<Element, number>
  emit: (event: AdaptiveKitEvent) => void
  destroy: () => void
  pause: () => void
  resume: () => void
  scan: (root: ParentNode) => void
  attribute: string
  paused: boolean
  options: Required<Pick<AdaptiveKitOptions, 'attribute' | 'viewThreshold' | 'dwellMinMs'>>
  rootEl: Element | Document
  sessionId: string
  userId: string
  onClick: (e: Event) => void
}

let active: TrackerInternals | null = null

function noop(): void {}

function getBlockId(el: Element, attribute: string): string | null {
  return el.getAttribute(attribute)
}

function findTrackedAncestor(target: EventTarget | null, attribute: string): Element | null {
  if (!(target instanceof Element)) return null
  return target.closest(`[${attribute}]`)
}

function createTracker(options: AdaptiveKitOptions): TrackerInternals {
  const attribute = options.attribute ?? 'data-ak-id'
  const viewThreshold = options.viewThreshold ?? 0.5
  const dwellMinMs = options.dwellMinMs ?? 2000
  const rootEl = (options.root as Element | Document | null | undefined) ?? document
  const sessionId = resolveSessionId(options.sessionId)
  const userId = options.userId
  const debug = options.debug ?? false

  const observed = new Set<Element>()
  const enteredAt = new WeakMap<Element, number>()
  let paused = false

  const emit: TrackerInternals['emit'] = (event) => {
    if (paused) return
    try {
      options.onEvent(event)
    } catch (err) {
      if (debug) console.error('[adaptivekit] onEvent threw:', err)
    }
  }

  const onIntersect: IntersectionObserverCallback = (entries) => {
    for (const entry of entries) {
      const el = entry.target
      const blockId = getBlockId(el, attribute)
      if (!blockId) continue
      const now = Date.now()

      if (entry.isIntersecting && entry.intersectionRatio >= viewThreshold) {
        if (!enteredAt.has(el)) {
          enteredAt.set(el, now)
          emit({
            blockId,
            userId,
            eventType: 'view',
            timestamp: now,
            sessionId,
          })
        }
      } else {
        const enteredTime = enteredAt.get(el)
        if (enteredTime != null) {
          const dwellMs = now - enteredTime
          enteredAt.delete(el)
          if (dwellMs >= dwellMinMs) {
            emit({
              blockId,
              userId,
              eventType: 'dwell',
              dwellMs,
              timestamp: now,
              sessionId,
            })
          }
        }
      }
    }
  }

  const observer = new IntersectionObserver(onIntersect, {
    threshold: [viewThreshold],
  })

  const observeIfNew = (el: Element) => {
    if (observed.has(el)) return
    observed.add(el)
    observer.observe(el)
  }

  const unobserveIfTracked = (el: Element) => {
    if (!observed.has(el)) return
    observed.delete(el)
    observer.unobserve(el)

    const enteredTime = enteredAt.get(el)
    if (enteredTime != null) {
      const blockId = getBlockId(el, attribute)
      enteredAt.delete(el)
      const dwellMs = Date.now() - enteredTime
      if (blockId && dwellMs >= dwellMinMs) {
        emit({
          blockId,
          userId,
          eventType: 'dwell',
          dwellMs,
          timestamp: Date.now(),
          sessionId,
        })
      }
    }
  }

  const scan: TrackerInternals['scan'] = (root) => {
    const selector = `[${attribute}]`
    const nodes = (root as Element).querySelectorAll
      ? (root as Element).querySelectorAll(selector)
      : []
    nodes.forEach(observeIfNew)
    if (root instanceof Element && root.matches?.(selector)) {
      observeIfNew(root)
    }
  }

  const onClick: TrackerInternals['onClick'] = (e) => {
    const el = findTrackedAncestor(e.target, attribute)
    if (!el) return
    const blockId = getBlockId(el, attribute)
    if (!blockId) return
    emit({
      blockId,
      userId,
      eventType: 'click',
      timestamp: Date.now(),
      sessionId,
    })
  }

  const onMutate: MutationCallback = (mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) scan(n as Element)
      })
      m.removedNodes.forEach((n) => {
        if (n.nodeType !== 1) return
        const el = n as Element
        const selector = `[${attribute}]`
        if (el.matches?.(selector)) unobserveIfTracked(el)
        el.querySelectorAll?.(selector).forEach(unobserveIfTracked)
      })
    }
  }

  const mutation = new MutationObserver(onMutate)
  const eventTarget: EventTarget = rootEl instanceof Document ? rootEl : rootEl

  eventTarget.addEventListener('click', onClick, true)
  mutation.observe(rootEl instanceof Document ? rootEl.body : rootEl, {
    childList: true,
    subtree: true,
  })

  scan(rootEl as ParentNode)

  return {
    observer,
    mutation,
    observed,
    enteredAt,
    emit,
    scan,
    attribute,
    paused,
    options: { attribute, viewThreshold, dwellMinMs },
    rootEl,
    sessionId,
    userId,
    onClick,
    pause() {
      paused = true
      this.paused = true
    },
    resume() {
      paused = false
      this.paused = false
    },
    destroy() {
      observer.disconnect()
      mutation.disconnect()
      eventTarget.removeEventListener('click', onClick, true)
      observed.clear()
    },
  }
}

export function init(options: AdaptiveKitOptions): void {
  if (!isBrowser) return
  if (!options || !options.userId || typeof options.onEvent !== 'function') {
    throw new Error('[adaptivekit] init requires { userId, onEvent }')
  }
  if (active) active.destroy()
  ready(() => {
    active = createTracker(options)
  })
}

export function destroy(): void {
  if (active) {
    active.destroy()
    active = null
  }
}

export function getTrackedBlocks(): string[] {
  if (!active) return []
  const out: string[] = []
  active.observed.forEach((el) => {
    const id = el.getAttribute(active!.attribute)
    if (id) out.push(id)
  })
  return out
}

export function pauseTracking(): void {
  active?.pause()
}

export function resumeTracking(): void {
  active?.resume()
}

export const __testInternals = {
  noop,
}

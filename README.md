# AdaptiveKit

AdaptiveKit is an open-source toolkit that gives any React, Next.js, Vue, or vanilla web app behavioral UI personalization in under ten minutes. Install three npm packages, run one CLI command, and the UI starts adapting to each user's behavior. No hosted backend, no data leaving your stack.

Most personalization tools operate at the content layer (which data to show). AdaptiveKit operates at the component layer (which UI blocks to surface and in what order). It tracks how each user engages with each block, then ranks the blocks per user. Apply the ranking with CSS order, conditional rendering, slot-based layouts, or whatever the project's design system allows.

## Status

Version 1.0. The three packages build, the test suite passes, and the SDK ships at 3 KB minified.

| Package | Version | Build size | Purpose |
|---|---|---|---|
| [`@adaptivekit/cli`](https://www.npmjs.com/package/@adaptivekit/cli) | 1.0.1 | n/a | One-time codemod that injects tracking IDs into JSX |
| [`@adaptivekit/sdk`](https://www.npmjs.com/package/@adaptivekit/sdk) | 1.0.0 | 3.04 KB min | Browser tracker that emits engagement events |
| [`@adaptivekit/core`](https://www.npmjs.com/package/@adaptivekit/core) | 1.0.0 | 4.29 KB min | Scoring engine that ranks blocks per user |

## What it does

Run the CLI once. It walks every `.jsx` and `.tsx` file in the project, finds container elements like `div`, `section`, `article`, and `aside`, and writes a stable `data-ak-id` attribute onto each one. It also writes a manifest file that maps every ID back to its source component. The browser SDK attaches an `IntersectionObserver` to every tagged element and a delegated click listener to the document, then emits events when a user views, clicks, or dwells on a block. The core engine reads those events and ranks the blocks per user using a decay-weighted affinity score. The ranking comes back as a plain array of block IDs, ready to apply however the layout system allows.

## Why it exists

B2B SaaS products ship a fixed UI layout. Every user sees the same blocks in the same order. Enterprise customers want layouts that adapt: the analytics widget opened daily belongs at the top, the rarely-touched settings panel belongs at the bottom. Existing personalization tools demand a hosted backend, a tracking script, an analytics dashboard, and a paid tier.

AdaptiveKit ships as code you own. Events route through your server. State lives in your database. The ranking runs in your process. There is no AdaptiveKit cloud.

## Quickstart

This walkthrough uses Next.js App Router. The same flow applies to Vite, Remix, plain Create React App, or any other JSX project.

### Step 1: Install the packages

```bash
npm install @adaptivekit/sdk @adaptivekit/core
npm install -D @adaptivekit/cli
```

`@adaptivekit/sdk` runs in the browser. `@adaptivekit/core` runs on the server. `@adaptivekit/cli` runs once at setup time and again whenever new components ship.

### Step 2: Inject tracking IDs

```bash
npx adaptivekit generate
```

The CLI parses every JSX/TSX file in `src/`, `app/`, and `components/` by default. For each container element it finds, it inserts a `data-ak-id` attribute and records the ID in `adaptivekit.manifest.json` at the project root. The manifest commits to git. Re-running the command picks up new components and leaves existing IDs untouched.

A typical injection looks like this:

```tsx
// Before
<section className="hero">
  <h1>Welcome back</h1>
</section>

// After
<section className="hero" data-ak-id="ak-dashboard-section-3a9f">
  <h1>Welcome back</h1>
</section>
```

The ID format is `ak-[component-name]-[element-type]-[hash]`. The hash is deterministic, so the same element generates the same ID across machines and across re-runs.

### Step 3: Initialize the browser SDK

In the root layout (or `_app.tsx`), call `init()` with the current user ID and a callback that posts events to your own API:

```tsx
'use client'
import { init } from '@adaptivekit/sdk'
import { useEffect } from 'react'

export function AdaptiveKitProvider({ userId }: { userId: string }) {
  useEffect(() => {
    init({
      userId,
      onEvent: async (event) => {
        await fetch('/api/ak/event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
        })
      },
    })
  }, [userId])
  return null
}
```

The SDK is server-render safe. It only attaches observers after `DOMContentLoaded` and guards every `window` access. The `onEvent` callback runs in fire-and-forget mode, so a slow handler never blocks the UI.

### Step 4: Ingest events on the server

Create a route that takes the event, loads the user's stored affinity state, feeds the event into the engine, and writes the new state back. Any key-value store works: Redis, Postgres JSONB, DynamoDB, Supabase, even an in-memory `Map` for prototyping.

```ts
// app/api/ak/event/route.ts
import { AdaptiveEngine, type AdaptiveKitEvent, type AffinityState } from '@adaptivekit/core'
import { redis } from '@/lib/redis'

const engine = new AdaptiveEngine()

export async function POST(req: Request) {
  const event = (await req.json()) as AdaptiveKitEvent
  const stored = await redis.get<AffinityState>(`ak:${event.userId}`)
  engine.importState(event.userId, stored)
  engine.ingestEvent(event)
  await redis.set(`ak:${event.userId}`, engine.exportState(event.userId))
  return new Response(null, { status: 204 })
}
```

`AffinityState` is a plain JSON object. It contains the running decayed score and the raw event counts per block per user. Store it as-is. The engine reconstructs from it on every request.

### Step 5: Fetch the ranked layout

Expose a second route that returns the user's ranking:

```ts
// app/api/ak/layout/route.ts
import { AdaptiveEngine } from '@adaptivekit/core'
import { redis } from '@/lib/redis'

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get('userId')
  if (!userId) return new Response('userId required', { status: 400 })

  const engine = new AdaptiveEngine()
  const stored = await redis.get(`ak:${userId}`)
  if (stored) engine.importState(userId, stored)
  return Response.json(engine.getLayout(userId))
}
```

The layout response looks like:

```json
{
  "userId": "u_42",
  "rankedBlockIds": [
    "ak-dashboard-section-3a9f",
    "ak-recent-card-7b21",
    "ak-promo-aside-12bc"
  ],
  "scores": {
    "ak-dashboard-section-3a9f": 12.4,
    "ak-recent-card-7b21": 8.1,
    "ak-promo-aside-12bc": 0.3
  },
  "generatedAt": 1714766400000
}
```

### Step 6: Apply the ranking

This is the only opinionated step, and AdaptiveKit takes no opinion on it. Pick whatever fits the layout system. CSS `order` works on flex containers without any conditional rendering:

```tsx
const { rankedBlockIds } = useAdaptiveLayout(userId)

return (
  <main className="flex flex-col gap-6">
    {blocks.map((block) => (
      <section
        key={block.id}
        data-ak-id={block.id}
        style={{ order: rankedBlockIds.indexOf(block.id) }}
      >
        {block.content}
      </section>
    ))}
  </main>
)
```

For slot-based layouts, sort the children before rendering. For grid layouts, use `grid-row`. The ranking is an array of strings, used however the parent design system allows.

## Recipes

Common patterns when wiring AdaptiveKit into a real app. Each recipe is independent and copy-pasteable.

### A `useAdaptiveLayout` React hook

The roadmap promises this as a first-class export. Until it ships, here is a working implementation:

```tsx
// src/lib/use-adaptive-layout.ts
'use client'
import { useEffect, useState } from 'react'

type Layout = {
  rankedBlockIds: string[]
  scores: Record<string, number>
}

const cache = new Map<string, { layout: Layout; expires: number }>()

export function useAdaptiveLayout(userId: string | null, ttlMs = 30_000) {
  const [layout, setLayout] = useState<Layout | null>(
    () => cache.get(userId ?? '')?.layout ?? null,
  )

  useEffect(() => {
    if (!userId) return
    const cached = cache.get(userId)
    if (cached && cached.expires > Date.now()) {
      setLayout(cached.layout)
      return
    }
    let cancelled = false
    fetch(`/api/ak/layout?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data: Layout) => {
        if (cancelled) return
        cache.set(userId, { layout: data, expires: Date.now() + ttlMs })
        setLayout(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, ttlMs])

  return layout
}
```

The hook caches the layout in memory for 30 seconds, so navigating between pages does not refetch. Tune the TTL based on how aggressive the personalization should feel.

### Cold start (a brand-new user with zero events)

The engine returns an empty `rankedBlockIds` array for users it has never seen. Treat that as a signal to fall back to a default order:

```ts
const layout = engine.getLayout(userId)
const ranking = layout.rankedBlockIds.length > 0
  ? layout.rankedBlockIds
  : DEFAULT_RANKING_FOR_NEW_USERS
```

`DEFAULT_RANKING_FOR_NEW_USERS` is whatever order the app would have shipped without AdaptiveKit. The personalization layer activates the moment a user starts engaging.

### Custom React components (Card, Panel, FeatureBlock)

By default, the CLI skips PascalCase components because changing their props can break custom prop validation. Opt them in by adding to `componentTags`:

```js
// adaptivekit.config.js
module.exports = {
  componentTags: ['Card', 'Panel', 'FeatureBlock'],
}
```

The component must forward `data-ak-id` to its root element. Most components do this implicitly via prop spreading. If yours does not, add the forwarding manually:

```tsx
function Card({ children, ...rest }: CardProps) {
  return <section {...rest}>{children}</section>
}
```

### Excluding a single element from tracking

Delete the `data-ak-id` attribute from any element you want to opt out, and add a sentinel attribute the CLI recognizes so re-runs do not re-inject:

```tsx
// This block stays untracked across re-runs
<section className="legal-footer" data-ak-skip>
  ...
</section>
```

Commit the `data-ak-skip` attribute to source. Any future `generate` skips elements that have it.

### Anonymous users

For users without an account, generate a stable anonymous ID once and store it in `localStorage`:

```ts
function getAnonymousId() {
  let id = localStorage.getItem('ak-anon-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('ak-anon-id', id)
  }
  return id
}

init({ userId: getAnonymousId(), onEvent })
```

This works across browser sessions on the same device. It does not survive a `localStorage` clear or cross-device usage. Both are acceptable tradeoffs for anonymous personalization.

### Batching events on the wire

The default `onEvent` callback fires once per event. On busy pages, batch events in memory and flush every 5 seconds or every 20 events, whichever comes first:

```ts
import type { AdaptiveKitEvent } from '@adaptivekit/sdk'

const queue: AdaptiveKitEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  if (queue.length === 0) return
  const batch = queue.splice(0)
  navigator.sendBeacon('/api/ak/event/batch', JSON.stringify(batch))
}

init({
  userId,
  onEvent: (event) => {
    queue.push(event)
    if (queue.length >= 20) return flush()
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, 5000)
  },
})

window.addEventListener('beforeunload', flush)
```

`navigator.sendBeacon` is a browser API designed for fire-and-forget telemetry that survives page unload.

### React Server Components and the SDK

The SDK is a client-side library. It must be imported from a `'use client'` file. The recommended setup is a small client wrapper imported into a server layout:

```tsx
// src/lib/adaptivekit-provider.tsx
'use client'
import { init } from '@adaptivekit/sdk'
import { useEffect } from 'react'

export function AdaptiveKitProvider({ userId }: { userId: string }) {
  useEffect(() => {
    init({ userId, onEvent: postEvent })
  }, [userId])
  return null
}
```

```tsx
// app/layout.tsx (server component)
import { AdaptiveKitProvider } from '@/lib/adaptivekit-provider'

export default async function Layout({ children }) {
  const session = await getSession()
  return (
    <html>
      <body>
        <AdaptiveKitProvider userId={session.user.id} />
        {children}
      </body>
    </html>
  )
}
```

### GDPR and right-to-be-forgotten

Deleting a user's affinity state is two calls:

```ts
engine.reset(userId)
await myStore.delete(`ak:${userId}`)
```

Wire that into the same code path that deletes the user's account. The events themselves are write-only and are not stored individually, so there is no event log to purge.

### Edge-caching the layout response

The layout endpoint is read-mostly. Cache it in the browser with a short TTL:

```ts
return new Response(JSON.stringify(layout), {
  headers: {
    'content-type': 'application/json',
    'cache-control': 'private, max-age=30',
  },
})
```

`private` keeps the response in the browser cache only, never on a shared CDN, because the layout is per-user.

### When to re-run `npx adaptivekit generate`

Re-run the CLI in three situations:

1. After adding new components or new container elements that should be tracked.
2. After renaming a component (the IDs change because the component name is part of the hash).
3. Never as part of a build pipeline. The manifest commits to git and serves as the source of truth.

### What to commit

| File | Commit? | Why |
|---|---|---|
| `adaptivekit.manifest.json` | Yes | Source of truth for which IDs the engine recognizes. |
| `adaptivekit.config.js` | Yes | Reproducible setup for every contributor. |
| Source files with injected `data-ak-id` | Yes | The IDs are part of the rendered DOM. |
| `node_modules/` | No | Standard `.gitignore` rule. |
| Affinity state (per-user JSON) | No | Lives in your database, not in the repo. |

## How the three packages fit together

```
┌──────────────────────────┐
│  @adaptivekit/cli        │  Build-time. Walks JSX/TSX, injects data-ak-id,
│  AST codemod             │  writes adaptivekit.manifest.json.
└────────────┬─────────────┘
             │
             ▼
   ┌─────────────────────┐
   │  Your source files  │  Now contain stable tracking IDs.
   └─────────────────────┘
             │
             ▼
┌──────────────────────────┐
│  @adaptivekit/sdk        │  Runtime in the browser. Observes tagged blocks
│  IntersectionObserver +  │  and emits view/click/dwell events.
│  click delegation        │
└────────────┬─────────────┘
             │   POST /api/ak/event
             ▼
┌──────────────────────────┐
│  @adaptivekit/core       │  Runtime on your server. Ingests events, runs
│  Decay-weighted scoring  │  the scoring algorithm, returns a ranked layout.
└──────────────────────────┘
             │   { rankedBlockIds, scores }
             ▼
   ┌─────────────────────┐
   │  Your UI            │  Apply the ranking with CSS order or render order.
   └─────────────────────┘
```

The arrows are the only contract. Every interface is a typed function call.

## CLI reference

`@adaptivekit/cli` is the codemod. A codemod is a script that rewrites source code by parsing it into an abstract syntax tree, modifying the tree, and writing the result back. An abstract syntax tree (AST) is the structured representation of source code that compilers and tools work with internally. The CLI uses `@babel/parser` to parse JSX and TypeScript. It does not re-print the source. It computes byte offsets from the parsed tree and splices attribute strings into the original file, preserving formatting, comments, and quote style.

### Commands

```bash
npx adaptivekit generate    # Inject IDs and write the manifest
npx adaptivekit reset       # Remove every injected ID and clear the manifest
```

### Flags

| Flag | What it does |
|---|---|
| `--dry-run` | Parse and report what would change. Write nothing. |
| `--verbose` | Log every file scanned, including untouched files. |
| `--config <path>` | Use a config file at a custom path. |
| `-h`, `--help` | Print usage. |
| `-v`, `--version` | Print the CLI version. |

### Configuration

The CLI reads `adaptivekit.config.js`, `adaptivekit.config.cjs`, or `adaptivekit.config.mjs` from the project root. If none exists, it uses defaults that work for most React and Next.js layouts.

```js
// adaptivekit.config.js
module.exports = {
  include: ['src/**/*.{jsx,tsx}', 'app/**/*.{jsx,tsx}'],
  exclude: ['**/*.test.tsx', '**/*.stories.tsx'],
  elementTypes: ['div', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav'],
  componentTags: [],         // PascalCase components opted in
  attribute: 'data-ak-id',   // Attribute name (rarely changed)
  minDepth: 1,               // Skip top-level wrappers
  maxDepth: 8,               // Skip deeply nested layout primitives
  manifestPath: 'adaptivekit.manifest.json',
}
```

`elementTypes` controls which lowercase HTML tags get IDs. `componentTags` opts in custom React components by name. Use it when the design system wraps everything in a `<Card>` instead of a `<section>`.

`minDepth` and `maxDepth` are JSX nesting depths. The outermost JSX in a component returns at depth 0. Setting `minDepth: 1` skips the wrapper element to avoid tracking the entire page as a single block.

### Stable IDs

The hash in each ID is computed from the file path, the enclosing component name, the element type, and the occurrence index of that element type within that component. It does not depend on line numbers or surrounding code. Adding a new sibling at the bottom of a component does not invalidate existing IDs. Renaming a component does invalidate them, which is the right tradeoff: a renamed component is a new component.

## SDK reference

`@adaptivekit/sdk` is the runtime tracker. It uses `IntersectionObserver`, a browser API that fires a callback when an element crosses a visibility threshold. The SDK uses one shared observer for every tagged element and one delegated `click` listener on the document, so the cost stays flat as more blocks get added.

### `init(options)`

```ts
type AdaptiveKitOptions = {
  userId: string
  onEvent: (event: AdaptiveKitEvent) => void
  attribute?: string         // default 'data-ak-id'
  viewThreshold?: number     // default 0.5 (50% visible)
  dwellMinMs?: number        // default 2000ms
  sessionId?: string         // default: auto-generated, persisted in sessionStorage
  root?: Element | Document  // default: document
  debug?: boolean
}
```

Pass the current user ID and an event handler. Everything else has a default chosen to match the reference spec.

### Events

```ts
type AdaptiveKitEvent = {
  blockId: string                       // the data-ak-id value
  userId: string
  eventType: 'view' | 'click' | 'dwell'
  dwellMs?: number                      // present when eventType === 'dwell'
  timestamp: number
  sessionId: string
}
```

| Event type | When it fires |
|---|---|
| `view` | The block crosses 50% visibility on entry into the viewport |
| `click` | The user clicks anywhere inside the block |
| `dwell` | The block leaves the viewport after the user looked at it for at least 2 seconds |

The SDK uses a `MutationObserver` to track elements added to the DOM after init, so single-page-app route changes work without router hooks. A `MutationObserver` is a browser API that notifies code when the DOM tree changes.

### Other API

```ts
init(options)            // Start tracking
destroy()                // Disconnect every observer and listener
getTrackedBlocks()       // Return the IDs the SDK currently observes
pauseTracking()          // Stop emitting events without losing observers
resumeTracking()         // Resume emission
```

### Bundle size

The minified ESM build is 3.04 KB, well under the 8 KB target. The SDK has zero runtime dependencies. `IntersectionObserver`, `MutationObserver`, and `fetch` are all native browser APIs.

## Core reference

`@adaptivekit/core` is the scoring engine. It runs in any Node-compatible runtime: Node.js, Bun, Deno, edge runtimes, serverless functions. It has zero runtime dependencies.

### `AdaptiveEngine`

```ts
import { AdaptiveEngine } from '@adaptivekit/core'

const engine = new AdaptiveEngine({
  lambda: 0.05,              // decay rate per day, default 0.05
  weights: {
    click: 3,                // a click is worth 3 score points
    dwell: 2,                // a full dwell is worth 2 points
    view: 0.5,               // a view is worth 0.5 points
  },
  dwellSaturationMs: 30_000, // dwell weight saturates after 30 seconds
})
```

### Methods

```ts
engine.ingestEvent(event)              // Apply one event to the running state
engine.getScore(userId, blockId, now?) // Decayed score for one block
engine.getLayout(userId, now?)         // Ranked array of blockIds + score map
engine.exportState(userId)             // Serializable snapshot for storage
engine.importState(userId, state)      // Restore from a snapshot
engine.reset(userId?)                  // Wipe one user or all users
```

### How the scoring works

Each event has a base weight. Clicks score highest, dwells score in the middle, views score lowest. Each event is also exponentially decayed by how old it is, so engagement from yesterday outweighs engagement from last month.

The formula for a single block, queried at time `t_now`:

```
score(block) = Σ weight(event) * exp(-λ * (t_now - t_event) / 86_400_000)
```

`λ` is the decay rate per day. With the default of 0.05, an event from 14 days ago contributes about half its original weight. An event from 60 days ago contributes about 5%.

The engine does not store every event individually. It stores one running score per block and decays it forward whenever a new event arrives. This is mathematically equivalent to summing each event's individual decay, and it runs in O(1) memory per block.

Dwell weight saturates: a 30-second dwell is worth the full dwell weight. A 5-second dwell is worth one sixth of it. This prevents a user who leaves a tab open overnight from skewing the entire model.

### Performance

`getLayout` returns in under 5 ms for a user with 1000 ingested events across 50 blocks, measured on a 2024 M-class laptop. The scoring is a single pass over the user's blocks with one `Math.exp` per block.

### Storage

The engine is stateless between calls. Bring your own storage. The pattern:

```ts
// Read on every server request
const stored = await myStore.get(`ak:${userId}`)
if (stored) engine.importState(userId, stored)

// Apply work
engine.ingestEvent(event)

// Persist
await myStore.set(`ak:${userId}`, engine.exportState(userId))
```

The exported state is a plain JSON object roughly:

```json
{
  "userId": "u_42",
  "version": 1,
  "updatedAt": 1714766400000,
  "blocks": {
    "ak-dashboard-section-3a9f": {
      "score": 12.4,
      "lastUpdate": 1714766400000,
      "clicks": 4,
      "views": 7,
      "dwells": 2,
      "totalDwellMs": 18400
    }
  }
}
```

Store it as-is. The version field allows schema migration without breaking existing snapshots.

## Troubleshooting

The most common issues, organized by where they show up.

### CLI errors

**`Parse failed for ...`**
The file uses syntax `@babel/parser` does not recognize. The CLI enables `jsx`, `typescript`, `classProperties`, `decorators-legacy`, `objectRestSpread`, and `topLevelAwait`. If the file uses an experimental plugin (Vue SFC, Svelte, MDX), exclude it from `include`:

```js
exclude: ['**/*.vue', '**/*.svelte', '**/*.mdx']
```

**Manifest is empty after `generate`**
The CLI scanned files but found nothing to inject. Three usual causes:

1. `minDepth` is higher than the deepest container in the components. Lower it to 0 and re-run.
2. None of the container elements match `elementTypes`. Check what tags the components actually use and add them to the list.
3. The components use custom PascalCase wrappers (`<Stack>`, `<Box>`). Add them to `componentTags`.

**`No files matched`**
The `include` glob does not match the project structure. Run with `--verbose` to see what the CLI scanned. A common adjustment for non-standard layouts:

```js
include: ['packages/web/src/**/*.{jsx,tsx}']
```

**Source files reformat themselves after `generate`**
The CLI does byte-level inserts and does not touch formatting. If files reformat, an editor or pre-commit hook (Prettier, ESLint) is the cause. Run the CLI, then run the formatter, and commit both diffs together.

### SDK errors

**`ReferenceError: window is not defined`**
The SDK was imported into a server-side file. Move the `init` call into a `'use client'` component or guard the import:

```ts
if (typeof window !== 'undefined') {
  import('@adaptivekit/sdk').then(({ init }) => init(options))
}
```

**No events arrive at the server**
Walk through the checklist in order:

1. Open DevTools and confirm the elements have `data-ak-id` attributes.
2. Set `debug: true` in `init()` and check the console for SDK errors.
3. Confirm `onEvent` posts to a real route. Test the route directly with `curl`.
4. Check for content-blockers. uBlock Origin and similar extensions block requests to paths containing `track`, `event`, or `analytics`. Rename the route to `/api/ak/ingest` if this is the cause.

**Events fire but the layout never changes**
The events arrive but the engine state is not persisting. Check that `engine.exportState(userId)` writes to storage and `engine.importState(userId, ...)` reads on every request. A common bug is creating a new `AdaptiveEngine` per request without importing the prior state, which throws away every event.

**The same view event fires repeatedly**
This is correct behavior. Each time a block crosses the visibility threshold, the SDK emits a view event. To get one view per page session, dedupe inside `onEvent`:

```ts
const seen = new Set<string>()
init({
  userId,
  onEvent: (event) => {
    const key = `${event.blockId}:${event.eventType}`
    if (event.eventType === 'view' && seen.has(key)) return
    seen.add(key)
    postEvent(event)
  },
})
```

### Engine errors

**`engine.getLayout(userId)` always returns empty**
The engine is in-memory only. Every server restart wipes its state. The pattern is to load from storage on every request:

```ts
const stored = await myStore.get(`ak:${userId}`)
if (stored) engine.importState(userId, stored)
```

If `stored` is `null`, the user genuinely has no events yet. See the cold start recipe.

**`Unsupported AffinityState version`**
The imported snapshot is in a format the engine does not recognize. The engine writes `version: 1` and only accepts `version: 1`. This error means the storage holds a corrupt or hand-edited snapshot.

**Scores grow unboundedly**
The decay rate `lambda` is too low. The default of 0.05 keeps scores bounded for typical usage. If lowered, raise it back. Verify by querying `engine.exportState(userId)` and looking at the largest `score` value.

### TypeScript errors

**`Property 'data-ak-id' does not exist on type ...`**
Custom React components do not extend `HTMLAttributes` by default. Two fixes:

1. Make the component spread props onto the root element: `<div {...props}>`.
2. Add `[key: \`data-${string}\`]: string` to the component's prop type.

**`Cannot find module '@adaptivekit/sdk'`**
The package was not installed. Run `npm install @adaptivekit/sdk` and confirm it appears in `package.json`. If installed but still missing, restart the TypeScript server.

### Install errors

**`npm ERR! 404 Not Found - GET ... @adaptivekit/cli`**
npm registry propagation lag right after publish. Usually resolves within 5 minutes. If it persists, check the package status at https://www.npmjs.com/package/@adaptivekit/cli.

**`npm ERR! peer dep missing`**
None of the AdaptiveKit packages declare peer dependencies. This error comes from another package in the project. Read the full error message to see which one.

### Behavior issues

**IDs change every time `generate` runs**
The hash includes the enclosing component name. If a tool (Prettier, ESLint, a refactoring rename) renamed components between runs, the IDs change. Solution: revert the rename or accept the new IDs and treat them as new blocks.

**Some elements get IDs and others do not**
The CLI applies depth filtering. Elements at depth less than `minDepth` or greater than `maxDepth` are skipped. Lower `minDepth` to 0 to inspect everything, then tune.

**Ranking does not match expectation**
The decay-weighted score favors recent engagement. A block clicked last week scores lower than a block viewed yesterday. To verify, dump the raw scores: `engine.getLayout(userId).scores` shows the actual numbers per block.

## Compatibility

| Layer | Requirement |
|---|---|
| Browser | Chrome 80+, Firefox 75+, Safari 13+, Edge 80+ |
| Node | 18+ |
| TypeScript | Full type coverage. `.d.ts` files ship with each package. |
| React | 17+ |
| Next.js | 13+ (Pages Router and App Router) |
| Vue | 3+ |
| Plain HTML | Works. The SDK has no framework assumption. |

## Privacy

AdaptiveKit collects engagement events (views, clicks, dwells) keyed by the user ID passed into `init()`. It does not collect personally identifiable information, IP addresses, user-agent strings, or content. Events route through your own server. There is no AdaptiveKit cloud and no third-party recipient.

## Setting up with an AI assistant

AdaptiveKit installs in under ten minutes by hand. With an AI coding assistant (Claude Code, Cursor, GitHub Copilot Chat, Aider), the setup compresses to a single conversation. The prompts below are self-contained and copy-pasteable.

A reusable skill for Claude Code lives at `.claude/skills/adaptivekit/`. It teaches a model the full operational playbook (modes, config, recipes, troubleshooting) in one load. See `.claude/skills/adaptivekit/INSTALL.md` for global installation.

### Best practices for AI-assisted setup

These rules apply to any AI prompt run against AdaptiveKit:

1. **Have the AI read the codebase before suggesting changes.** Tell it which files to read first. AI assistants invent config when they have no context.
2. **Run `npx adaptivekit generate --dry-run` before the real run.** The dry-run output is the AI's chance to catch a wrong include glob before any source file is touched.
3. **Never let the AI invent block IDs.** The CLI generates them deterministically. If the AI writes literal `data-ak-id="ak-something"` strings into source files, undo that.
4. **Ask the AI to list its assumptions.** Anything it cannot verify from the codebase (storage choice, auth source, framework version) should be called out.
5. **Commit before regenerating.** A clean working tree makes the diff readable and allows easy revert.
6. **Pin the package versions in the prompt.** AI training data lags. Specifying `@adaptivekit/cli@1.0.1` prevents the AI from suggesting calls based on a different version.
7. **Show the AI the existing manifest.** If `adaptivekit.manifest.json` exists, the AI must respect every ID in it.

### Prompt 1: Setup questionnaire

Use this for a guided setup. The AI walks the user through six questions and produces the full integration in one go.

````
You are helping me set up AdaptiveKit (https://www.npmjs.com/package/@adaptivekit/cli) in this project.

Step 1: Read these files first if they exist. Do not skip this step.
- package.json
- tsconfig.json
- The top-level structure of src/, app/, and components/ (one level deep, no recursion)
- adaptivekit.config.js
- adaptivekit.manifest.json

Step 2: Ask me these questions one at a time and wait for my answer before moving on:

1. Which framework am I using? (React, Next.js App Router, Next.js Pages Router, Vite, Remix, plain HTML)
2. Where do my page-level UI components live? Default guesses: src/components, src/pages, app/.
3. Are there directories I want excluded from tracking? Default guesses: tests, stories, generated code.
4. Do I have a list of specific components I want personalized? If yes, give me the list. If no, I want you to decide based on file size, naming convention, and how often each component appears in route files.
5. What is my user identity source? Examples: Clerk, NextAuth, Supabase Auth, custom JWT, anonymous-only.
6. Where do I want to store the affinity state? Examples: Redis, Postgres JSONB, Upstash KV, in-memory Map.

Step 3: After I answer all six, do this in order:

1. Show me the proposed adaptivekit.config.js with one-line comments explaining each value.
2. Show me the proposed AdaptiveKitProvider client component.
3. Show me the proposed /api/ak/event server route.
4. Show me the proposed /api/ak/layout server route.
5. Show me the proposed useAdaptiveLayout React hook.
6. List every assumption you made that you could not verify from the codebase.

Do not write any files until I confirm. Run npx adaptivekit generate --dry-run first and show me the output before running it for real.

Pin the package versions: @adaptivekit/cli@1.0.1, @adaptivekit/sdk@1.0.0, @adaptivekit/core@1.0.0.
````

### Prompt 2: Decide for me

Use this when the AI should make opinionated calls and ask zero questions.

````
You are setting up AdaptiveKit in this project. I am not going to answer questions. Read the codebase and decide for me.

Step 1: Read in this order. Do not skip.
1. package.json. Note: framework, dependencies, scripts.
2. The directory tree of src/, app/, components/ (one level deep).
3. Any existing adaptivekit.config.js.
4. Any existing adaptivekit.manifest.json. Respect every ID in this file. Do not change it.
5. Pick 3 to 5 representative source files that look like top-level page or feature components. Read them in full to learn my naming conventions, my JSX nesting style, and my prop spreading patterns.

Step 2: Decide and produce these files:
- adaptivekit.config.js with opinionated defaults based on what you saw.
- src/lib/adaptivekit-provider.tsx (or my project's equivalent path).
- app/api/ak/event/route.ts (or pages/api equivalent for Pages Router).
- app/api/ak/layout/route.ts.
- src/lib/use-adaptive-layout.ts.

Step 3: Before writing any files, output a plan that lists:
- The components you decided to include and why.
- The components you decided to exclude and why.
- The storage backend you assumed (default to in-memory Map for prototyping with a TODO comment to swap for Redis or Postgres).
- The auth source you assumed.
- Any other assumption you could not verify.

Step 4: Run npx adaptivekit generate --dry-run and show me the output.

Step 5: Wait for me to say "go" before writing files or running the real generate.

Pin the package versions: @adaptivekit/cli@1.0.1, @adaptivekit/sdk@1.0.0, @adaptivekit/core@1.0.0.
````

### Prompt 3: Audit after a refactor

Use this after a rename, move, or restructure of components. The AI reports what changed and whether to re-run the CLI.

````
You are auditing my AdaptiveKit setup after a refactor.

Step 1: Read these files:
- adaptivekit.manifest.json
- adaptivekit.config.js
- The current state of every source file referenced in the manifest (filePath field on each entry).

Step 2: For each entry in the manifest, check:
- Does the file still exist at the recorded filePath?
- Does the component named componentName still exist in that file?
- Does the element at the recorded line and column still match the recorded elementType?

Step 3: Output a report with three sections:

A. Stable IDs. Components that did not move and will keep their IDs.
B. Invalidated IDs. Components that were renamed or moved. The next generate will create new IDs for them. The old IDs become orphans in the affinity state.
C. Orphan affinity state. IDs in the manifest that no longer correspond to any element.

Step 4: Recommend one of these actions and explain why:
- Re-run npx adaptivekit generate now (small refactor, safe to re-tag).
- Delete the orphan entries from the manifest first, then re-run (medium refactor).
- Reset the affinity state for affected users (large refactor, history is lost but the model is clean).

Do not modify any files. This is a read-only audit.
````

### Prompt 4: Diagnose an integration issue

Use this when something is not working and the cause is unclear.

````
You are debugging my AdaptiveKit integration. The symptom is: [describe the symptom in one sentence, e.g., "events fire in the browser but the ranking never updates"].

Step 1: Read these files:
- The file where I call init() from @adaptivekit/sdk.
- The /api/ak/event route handler.
- The /api/ak/layout route handler.
- adaptivekit.manifest.json (top of the file only).
- package.json (versions of @adaptivekit/* packages).

Step 2: Check the README troubleshooting section at https://github.com/omrajguru05/adaptivekit#troubleshooting for the symptom I described.

Step 3: Walk through the data flow in order:
1. Are data-ak-id attributes present in the rendered DOM? Suggest a DevTools snippet I can run to verify.
2. Does init() receive a valid userId?
3. Does onEvent fire? Suggest a console.log to add temporarily.
4. Does the event POST reach the server route?
5. Does the engine import the prior state before ingesting?
6. Does the engine export and persist after ingesting?
7. Does the layout route import state on every request?

Step 4: For each step, mark it Verified, Likely, or Unknown based on what the code shows. List the next debugging action.

Do not modify any files. Output diagnostic suggestions only.
````

### Picking the right prompt

| Situation | Prompt to use |
|---|---|
| First-time setup, guided walkthrough | Prompt 1 |
| First-time setup, AI decides | Prompt 2 |
| Refactor happened, want to know what to re-run | Prompt 3 |
| Something is broken and the cause is unclear | Prompt 4 |

## Roadmap

Items planned for future releases:

- A `useAdaptiveLayout()` React hook as a first-class export.
- A Vue composable with the same shape.
- Cohort scoring: a ranking shared across user segments to bootstrap new users.
- Cold start handling: returning a sensible default ranking when a user has zero events.
- A watch mode for the CLI so new components get IDs the moment a file is saved.
- An OpenTelemetry adapter so the SDK can emit events through existing observability tooling.

## Local development

```bash
git clone https://github.com/omrajguru05/adaptivekit.git
cd adaptivekit
npm install
npm run build
npm test
```

The repo is an npm workspace with three packages under `packages/`. Each package has its own `tsup` build and its own test suite. Build artifacts land in `packages/<name>/dist/`.

## Contributing

This is open source. The code is small enough to read in one sitting. If something is wrong or missing, open an issue or send a pull request. Tests live under each package's `test/` directory and run with `npm test`.

## License

MIT.

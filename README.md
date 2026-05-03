# AdaptiveKit

I built AdaptiveKit because every frontend ships the same UI to every user, and the tools that fix that need a hosted backend, a dashboard, and a week of integration work. AdaptiveKit installs as three npm packages and gives any React, Next.js, Vue, or vanilla web app behavioral UI personalization in under ten minutes. There is no server I run. There is no data I store. The stack stays yours.

The core idea: most personalization tools operate at the content layer (which data to show). AdaptiveKit operates at the component layer (which UI blocks to surface and in what order). It tracks how each user engages with each block, then ranks the blocks per user. I take the ranking and reorder the UI however I want.

## Status

Version 1.0. The three packages build, the test suite passes, and the SDK ships at 3 KB minified.

| Package | Version | Build size | Purpose |
|---|---|---|---|
| `@adaptivekit/cli` | 1.0.0 | n/a | One-time codemod that injects tracking IDs into JSX |
| `@adaptivekit/sdk` | 1.0.0 | 3.04 KB min | Browser tracker that emits engagement events |
| `@adaptivekit/core` | 1.0.0 | 4.29 KB min | Scoring engine that ranks blocks per user |

## What it does, in one paragraph

I run the CLI once. It walks every `.jsx` and `.tsx` file in my project, finds container elements like `div`, `section`, `article`, and `aside`, and writes a stable `data-ak-id` attribute onto each one. It also writes a manifest file that maps every ID to the component it came from. The browser SDK attaches an `IntersectionObserver` to every tagged element and a delegated click listener to the document, then emits events when a user views, clicks, or dwells on a block. The core engine reads those events and ranks the blocks per user using a decay-weighted affinity score. I take the ranking and reorder my UI.

## Why I built this

I worked on a B2B SaaS product where customers asked for "personalized dashboards" every quarter. The asks were not data personalization. They wanted the layout itself to adapt: the analytics widget the user opens daily should sit at the top, the rarely-touched settings panel should sink. Every existing tool I evaluated wanted a hosted backend, a tracking script, an analytics dashboard, and a paid tier. None of them shipped as code I could own.

AdaptiveKit ships as code I own. The events route through my server. The state lives in my database. The ranking runs in my process. There is no AdaptiveKit cloud.

## Quickstart

I'll walk through a Next.js App Router setup. The same flow works for Vite, Remix, plain Create React App, or any other JSX project.

### Step 1: Install the packages

```bash
npm install @adaptivekit/sdk @adaptivekit/core
npm install -D @adaptivekit/cli
```

`@adaptivekit/sdk` runs in the browser. `@adaptivekit/core` runs on my server. `@adaptivekit/cli` runs once at setup time and again whenever I add new components.

### Step 2: Inject tracking IDs

```bash
npx adaptivekit generate
```

The CLI parses every JSX/TSX file in `src/`, `app/`, and `components/` by default. For each container element it finds, it inserts a `data-ak-id` attribute and records the ID in `adaptivekit.manifest.json` at the project root. The manifest commits to git. Re-running the command picks up new components and leaves the existing IDs untouched.

What this looks like in my source:

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

In my root layout (or `_app.tsx`), I call `init()` with the current user ID and a callback that posts events to my own API:

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

I create a route that takes the event, loads the user's stored affinity state, feeds the event into the engine, and writes the new state back. Any key-value store works: Redis, Postgres JSONB, DynamoDB, Supabase, even a `Map` in memory for prototyping.

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

`AffinityState` is a plain JSON object. It contains the running decayed score and the raw event counts per block per user. I store it as-is. The engine reconstructs from it on every request.

### Step 5: Fetch the ranked layout

I expose a second route that returns the user's ranking:

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

This is the only opinionated step, and AdaptiveKit takes no opinion on it. I pick whatever fits my layout system. CSS `order` works on flex containers without any conditional rendering:

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

For slot-based layouts, I sort the children before rendering. For grid layouts, I use `grid-row`. The ranking is an array of strings, and I do whatever the parent design system allows.

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
│  @adaptivekit/core       │  Runtime on my server. Ingests events, runs the
│  Decay-weighted scoring  │  scoring algorithm, returns a ranked layout.
└──────────────────────────┘
             │   { rankedBlockIds, scores }
             ▼
   ┌─────────────────────┐
   │  Your UI            │  I apply the ranking with CSS order or render order.
   └─────────────────────┘
```

The arrows are the only contract. Every interface is a typed function call, and there is no protocol I invented.

## CLI reference

`@adaptivekit/cli` is the codemod. A codemod is a script that rewrites source code by parsing it into an abstract syntax tree, modifying the tree, and writing the result back. An abstract syntax tree (AST) is the structured representation of source code that compilers and tools work with internally. The CLI uses `@babel/parser` to parse JSX and TypeScript. It does not re-print the source. It computes byte offsets from the parsed tree and splices attribute strings into the original file, so my formatting, comments, and quote style stay exactly as I wrote them.

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
  componentTags: [],         // PascalCase components I want tracked too
  attribute: 'data-ak-id',   // The attribute name (rarely changed)
  minDepth: 1,               // Skip top-level wrappers
  maxDepth: 8,               // Skip deeply nested layout primitives
  manifestPath: 'adaptivekit.manifest.json',
}
```

`elementTypes` controls which lowercase HTML tags get IDs. `componentTags` opts in custom React components by name. I use it when my design system wraps everything in a `<Card>` instead of a `<section>`.

`minDepth` and `maxDepth` are JSX nesting depths. The outermost JSX in a component returns at depth 0. Setting `minDepth: 1` skips the wrapper element so I avoid tracking the entire page as a single block.

### Stable IDs

The hash in each ID is computed from the file path, the enclosing component name, the element type, and the occurrence index of that element type within that component. It does not depend on line numbers or surrounding code. Adding a new sibling at the bottom of a component does not invalidate the existing IDs. Renaming a component does invalidate them, which is the right tradeoff: a renamed component is a new component.

## SDK reference

`@adaptivekit/sdk` is the runtime tracker. It uses `IntersectionObserver`, a browser API that fires a callback when an element crosses a visibility threshold. The SDK uses one shared observer for every tagged element and one delegated `click` listener on the document, so the cost stays flat as I add more blocks.

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

I pass the current user ID and an event handler. Everything else has a default I chose to match the reference spec.

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

The SDK uses a `MutationObserver` to track elements added to the DOM after init, so single-page-app route changes work without me wiring up router hooks. A `MutationObserver` is a browser API that notifies code when the DOM tree changes.

### Other API

```ts
init(options)            // Start tracking
destroy()                // Disconnect every observer and listener
getTrackedBlocks()       // Return the IDs the SDK currently observes
pauseTracking()          // Stop emitting events without losing observers
resumeTracking()         // Resume emission
```

### Bundle size

The minified ESM build is 3.04 KB. I aimed for under 8 KB and beat it. The SDK has zero runtime dependencies. `IntersectionObserver`, `MutationObserver`, and `fetch` are all native browser APIs.

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

The engine is stateless between calls. I bring my own storage. The pattern:

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

I store it as-is. The version field lets me migrate the schema later without breaking existing snapshots.

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

AdaptiveKit collects engagement events (views, clicks, dwells) keyed by the user ID I pass in. It does not collect personally identifiable information, IP addresses, user-agent strings, or content. The events route through my server, not Anthropic's, not the maintainer's, not anyone else's. I decide where they land.

## Roadmap

Items I want to ship next:

- A `useAdaptiveLayout()` React hook so the layout fetch is one line in a component.
- A Vue composable with the same shape.
- Cohort scoring: a ranking shared across user segments to bootstrap new users.
- Cold start handling: returning a sensible default ranking when a user has zero events.
- A watch mode for the CLI so new components get IDs the moment I save the file.
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

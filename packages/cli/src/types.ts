export type AdaptiveKitConfig = {
  include: string[]
  exclude: string[]
  elementTypes: string[]
  attribute: string
  minDepth: number
  maxDepth: number
  manifestPath: string
  componentTags: string[]
}

export type ManifestEntry = {
  id: string
  filePath: string
  componentName: string
  elementType: string
  depth: number
  loc: { line: number; column: number }
}

export type Manifest = {
  version: 1
  generatedAt: number
  blocks: Record<string, ManifestEntry>
}

export type InjectionResult = {
  filePath: string
  injected: ManifestEntry[]
  skipped: number
  bytesAdded: number
}

export type RunStats = {
  filesScanned: number
  filesTouched: number
  blocksInjected: number
  blocksSkipped: number
  durationMs: number
}

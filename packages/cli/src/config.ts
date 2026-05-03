import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AdaptiveKitConfig } from './types.js'

export const DEFAULT_CONFIG: AdaptiveKitConfig = {
  include: ['src/**/*.{jsx,tsx}', 'app/**/*.{jsx,tsx}', 'components/**/*.{jsx,tsx}'],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/*.test.{jsx,tsx}',
    '**/*.spec.{jsx,tsx}',
    '**/*.stories.{jsx,tsx}',
  ],
  elementTypes: ['div', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav'],
  attribute: 'data-ak-id',
  minDepth: 1,
  maxDepth: 8,
  manifestPath: 'adaptivekit.manifest.json',
  componentTags: [],
}

const CONFIG_FILE_CANDIDATES = [
  'adaptivekit.config.js',
  'adaptivekit.config.cjs',
  'adaptivekit.config.mjs',
]

export async function loadConfig(
  cwd: string,
  explicit?: string,
): Promise<{ config: AdaptiveKitConfig; source: string | null }> {
  const explicitPath = explicit ? resolve(cwd, explicit) : null
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`Config file not found at ${explicitPath}`)
    }
    return { config: await loadFromFile(explicitPath), source: explicitPath }
  }

  for (const name of CONFIG_FILE_CANDIDATES) {
    const candidate = resolve(cwd, name)
    if (existsSync(candidate)) {
      return { config: await loadFromFile(candidate), source: candidate }
    }
  }

  return { config: DEFAULT_CONFIG, source: null }
}

async function loadFromFile(filePath: string): Promise<AdaptiveKitConfig> {
  const url = pathToFileURL(filePath).href
  const mod = await import(url)
  const userConfig = (mod.default ?? mod) as Partial<AdaptiveKitConfig>
  return mergeConfig(DEFAULT_CONFIG, userConfig)
}

export function mergeConfig(
  base: AdaptiveKitConfig,
  override: Partial<AdaptiveKitConfig> = {},
): AdaptiveKitConfig {
  return {
    include: override.include ?? base.include,
    exclude: override.exclude ?? base.exclude,
    elementTypes: override.elementTypes ?? base.elementTypes,
    attribute: override.attribute ?? base.attribute,
    minDepth: override.minDepth ?? base.minDepth,
    maxDepth: override.maxDepth ?? base.maxDepth,
    manifestPath: override.manifestPath ?? base.manifestPath,
    componentTags: override.componentTags ?? base.componentTags,
  }
}

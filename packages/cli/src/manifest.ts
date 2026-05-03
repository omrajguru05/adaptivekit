import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Manifest, ManifestEntry } from './types.js'

export function emptyManifest(): Manifest {
  return { version: 1, generatedAt: 0, blocks: {} }
}

export async function readManifest(cwd: string, manifestPath: string): Promise<Manifest> {
  const fullPath = resolve(cwd, manifestPath)
  if (!existsSync(fullPath)) return emptyManifest()
  try {
    const raw = await readFile(fullPath, 'utf8')
    const parsed = JSON.parse(raw) as Manifest
    if (parsed.version !== 1) return emptyManifest()
    return parsed
  } catch {
    return emptyManifest()
  }
}

export async function writeManifest(
  cwd: string,
  manifestPath: string,
  manifest: Manifest,
): Promise<void> {
  const fullPath = resolve(cwd, manifestPath)
  await writeFile(fullPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

export function buildManifest(entries: ManifestEntry[], generatedAt: number): Manifest {
  const blocks: Record<string, ManifestEntry> = {}
  for (const entry of entries) {
    blocks[entry.id] = entry
  }
  return { version: 1, generatedAt, blocks }
}

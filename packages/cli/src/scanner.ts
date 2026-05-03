import fg from 'fast-glob'
import type { AdaptiveKitConfig } from './types.js'

export async function findCandidateFiles(
  cwd: string,
  config: AdaptiveKitConfig,
): Promise<string[]> {
  const matches = await fg(config.include, {
    cwd,
    ignore: config.exclude,
    absolute: false,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
  })
  return matches.sort()
}

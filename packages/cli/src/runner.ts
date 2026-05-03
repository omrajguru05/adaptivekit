import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from './config.js'
import { buildManifest, writeManifest } from './manifest.js'
import { findCandidateFiles } from './scanner.js'
import { stripAttributes, transform } from './transform.js'
import type { ManifestEntry, RunStats } from './types.js'

export type GenerateOptions = {
  cwd: string
  configPath?: string
  dryRun?: boolean
  verbose?: boolean
}

export type ResetOptions = {
  cwd: string
  configPath?: string
  dryRun?: boolean
  verbose?: boolean
}

export async function runGenerate(opts: GenerateOptions): Promise<RunStats> {
  const startedAt = Date.now()
  const { config, source } = await loadConfig(opts.cwd, opts.configPath)
  if (opts.verbose) {
    log(pc.dim(`config: ${source ?? '(defaults)'}`))
  }

  const files = await findCandidateFiles(opts.cwd, config)
  log(pc.dim(`scanning ${files.length} file${files.length === 1 ? '' : 's'}…`))

  const allEntries: ManifestEntry[] = []
  let filesTouched = 0
  let blocksInjected = 0
  let blocksSkipped = 0

  for (const relPath of files) {
    const absPath = resolve(opts.cwd, relPath)
    const original = await readFile(absPath, 'utf8')
    let result
    try {
      result = transform(original, relPath, config)
    } catch (err) {
      log(pc.yellow(`skip ${relPath}: ${(err as Error).message}`))
      continue
    }

    allEntries.push(...result.entries)
    blocksSkipped += result.preExistingIds.length

    const newEntries = result.entries.length - result.preExistingIds.length
    if (result.code !== original) {
      filesTouched += 1
      blocksInjected += newEntries
      if (!opts.dryRun) {
        await writeFile(absPath, result.code, 'utf8')
      }
      log(`${pc.green('+')} ${relPath} ${pc.dim(`(${newEntries} block${newEntries === 1 ? '' : 's'})`)}`)
    } else if (opts.verbose) {
      log(`${pc.dim('·')} ${pc.dim(relPath)}`)
    }
  }

  const manifest = buildManifest(allEntries, Date.now())
  if (!opts.dryRun) {
    await writeManifest(opts.cwd, config.manifestPath, manifest)
    log(pc.dim(`manifest: ${config.manifestPath}`))
  } else {
    log(pc.yellow('dry-run: no files written'))
  }

  const durationMs = Date.now() - startedAt
  const stats: RunStats = {
    filesScanned: files.length,
    filesTouched,
    blocksInjected,
    blocksSkipped,
    durationMs,
  }

  log('')
  log(
    `${pc.bold('done')} ${pc.dim('·')} ${pc.green(`${blocksInjected} injected`)}` +
      ` ${pc.dim('·')} ${blocksSkipped} pre-existing` +
      ` ${pc.dim('·')} ${filesTouched}/${files.length} files` +
      ` ${pc.dim('·')} ${durationMs}ms`,
  )
  return stats
}

export async function runReset(opts: ResetOptions): Promise<RunStats> {
  const startedAt = Date.now()
  const { config } = await loadConfig(opts.cwd, opts.configPath)
  const files = await findCandidateFiles(opts.cwd, config)
  log(pc.dim(`scanning ${files.length} file${files.length === 1 ? '' : 's'}…`))

  let filesTouched = 0
  let blocksInjected = 0
  let blocksSkipped = 0

  for (const relPath of files) {
    const absPath = resolve(opts.cwd, relPath)
    const original = await readFile(absPath, 'utf8')
    const { code, removed } = stripAttributes(original, config.attribute)
    if (removed > 0) {
      filesTouched += 1
      blocksSkipped += removed
      if (!opts.dryRun) {
        await writeFile(absPath, code, 'utf8')
      }
      log(`${pc.red('-')} ${relPath} ${pc.dim(`(${removed} block${removed === 1 ? '' : 's'} removed)`)}`)
    } else if (opts.verbose) {
      log(`${pc.dim('·')} ${pc.dim(relPath)}`)
    }
  }

  if (!opts.dryRun) {
    await writeManifest(opts.cwd, config.manifestPath, { version: 1, generatedAt: Date.now(), blocks: {} })
  }

  const durationMs = Date.now() - startedAt
  log('')
  log(
    `${pc.bold('reset')} ${pc.dim('·')} ${pc.red(`${blocksSkipped} removed`)}` +
      ` ${pc.dim('·')} ${filesTouched}/${files.length} files` +
      ` ${pc.dim('·')} ${durationMs}ms`,
  )
  return {
    filesScanned: files.length,
    filesTouched,
    blocksInjected,
    blocksSkipped,
    durationMs,
  }
}

function log(msg: string): void {
  process.stdout.write(msg + '\n')
}

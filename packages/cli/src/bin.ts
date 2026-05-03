import pc from 'picocolors'
import { runGenerate, runReset } from './runner.js'

type ParsedArgs = {
  command: string | null
  flags: {
    dryRun: boolean
    verbose: boolean
    configPath?: string
    help: boolean
    version: boolean
  }
  positional: string[]
}

const HELP = `${pc.bold('adaptivekit')} — drop-in behavioral UI personalization

${pc.bold('Usage')}
  adaptivekit <command> [options]

${pc.bold('Commands')}
  generate           Inject data-ak-id attributes and write the manifest
  reset              Remove all injected attributes and clear the manifest

${pc.bold('Options')}
  --dry-run          Preview changes without writing
  --verbose          Log every file scanned
  --config <path>    Path to a custom adaptivekit.config.js
  -h, --help         Show this help
  -v, --version      Show CLI version

${pc.bold('Examples')}
  npx adaptivekit generate
  npx adaptivekit generate --dry-run --verbose
  npx adaptivekit reset
`

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    command: null,
    flags: { dryRun: false, verbose: false, help: false, version: false },
    positional: [],
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    if (arg === '--dry-run') out.flags.dryRun = true
    else if (arg === '--verbose') out.flags.verbose = true
    else if (arg === '--reset') out.command = out.command ?? 'reset'
    else if (arg === '-h' || arg === '--help') out.flags.help = true
    else if (arg === '-v' || arg === '--version') out.flags.version = true
    else if (arg === '--config') {
      const next = argv[++i]
      if (next) out.flags.configPath = next
    } else if (arg.startsWith('--config=')) {
      out.flags.configPath = arg.slice('--config='.length)
    } else if (!out.command && !arg.startsWith('-')) {
      out.command = arg
    } else if (!arg.startsWith('-')) {
      out.positional.push(arg)
    }
  }

  return out
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseArgs(argv)

  if (args.flags.help || (!args.command && !args.flags.version)) {
    process.stdout.write(HELP)
    return
  }

  if (args.flags.version) {
    process.stdout.write('@adaptivekit/cli 1.0.0\n')
    return
  }

  const cwd = process.cwd()
  try {
    if (args.command === 'generate' || args.command === 'gen') {
      await runGenerate({
        cwd,
        configPath: args.flags.configPath,
        dryRun: args.flags.dryRun,
        verbose: args.flags.verbose,
      })
    } else if (args.command === 'reset') {
      await runReset({
        cwd,
        configPath: args.flags.configPath,
        dryRun: args.flags.dryRun,
        verbose: args.flags.verbose,
      })
    } else {
      process.stderr.write(pc.red(`unknown command: ${args.command}\n`))
      process.stdout.write(HELP)
      process.exit(1)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(pc.red(`error: ${message}\n`))
    process.exit(1)
  }
}

main()

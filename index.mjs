#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CODEZY CLI — one entry point, following the conventions of the mature agent
// CLIs (Claude Code, Codex, Antigravity, opencode): interactive by default,
// -p/--print for one-shot runs, `exec`/`run` for scripted agent runs, one
// --help/--version surface, honest exit codes (0 ok · 1 error · 2 usage).
//
// Routing (the engines stay self-contained; this file only dispatches):
//   codezy                → ./src/shell/agent.mjs  unified REPL    (agent)
//   codezy "prompt"       → ./src/shell/print.mjs  one-shot chat   (v1 engine)
//   codezy -p "prompt"    → ./src/shell/print.mjs
//   codezy exec|run "…"   → ./codezy-v2.mjs        one-shot agent (harness)
//   codezy --agent -p "…" → ./codezy-v2.mjs        one-shot agent (harness)
//   codezy --agent|--plan → ./src/shell/agent.mjs  unified REPL
//   codezy --chat         → ./src/shell/agent.mjs  unified REPL    (chat)
//   codezy doctor         → ./src/services/doctor.mjs  health check, exit 0/1
// ---------------------------------------------------------------------------

import { parseArgs, helpText, execHelpText, doctorHelpText, getVersion } from './lib/cli.mjs'

const argv = process.argv.slice(2)

const COMMON = ['h', 'help', 'V', 'version']
const V1 = new Set([...COMMON, 'model', 'dir', 'root', 'chat', 'plan', 'mode']) // --root is documented as a --dir alias
const PRINT = new Set([...V1, 'p', 'print', 'url', 'output-format'])
const V2 = new Set([...COMMON, 'a', 'agent', 'p', 'print', 'model', 'dir', 'root', 'ctx', 'url', 'auto', 'output-format', 'c', 'continue', 'preview', 'mode', 'chat', 'plan'])

const A = parseArgs(argv, ['model', 'dir', 'root', 'ctx', 'url', 'print', 'p', 'output-format', 'mode'])

// -- help / version first, regardless of engine -------------------------------
// `codezy exec --help` and `codezy doctor --help` get their own screen; a
// bare --help stays the map of the whole CLI.
if (A.present.has('h') || A.present.has('help')) {
  const topic = A.positionals[0]
  const page =
    topic === 'exec' || topic === 'run' ? execHelpText() : topic === 'doctor' ? doctorHelpText() : helpText()
  process.stdout.write(`${page}\n`)
  process.exit(0)
}
if (A.present.has('V') || A.present.has('version')) {
  process.stdout.write(`codezy ${getVersion()}\n`)
  process.exit(0)
}

// -- doctor: a health check, not an engine -------------------------------------
if (A.positionals[0] === 'doctor' && A.positionals.length === 1) {
  for (const flag of A.present) {
    if (!COMMON.includes(flag) && flag !== 'json') {
      const dash = flag.length === 1 ? '-' : '--'
      process.stderr.write(`codezy: unknown option ${dash}${flag} for "doctor"\nrun: codezy --help\n`)
      process.exit(2)
    }
  }
  await import('./src/services/doctor.mjs') // prints the report (or --json) and exits 0/1 itself
}

// -- config: settings surface -------------------------------------------------
if (A.positionals[0] === 'config') {
  await import('./src/commands/config.mjs')
  process.exit(0)
}

// -- sessions: browse/resume saved sessions ------------------------------------
if (A.positionals[0] === 'sessions') {
  await import('./src/commands/sessions.mjs')
  process.exit(0)
}

// -- mcp: inspect servers/tools headlessly ------------------------------------
if (A.positionals[0] === 'mcp') {
  await import('./src/commands/mcp.mjs')
  process.exit(0)
}

// -- new subcommands (3.2.0) ---------------------------------------------------
for (const [name, file] of [['skills','skills.mjs'],['completions','completions.mjs'],['update','update.mjs'],['serve','serve.mjs']]) {
  if (A.positionals[0] === name) { await import('./src/commands/' + file); process.exit(0) }
}
// -- pick the engine ----------------------------------------------------------
const sub = A.positionals[0]
const chat = A.present.has('chat')
const agent = !chat && (A.present.has('agent') || A.present.has('a') || sub === 'exec' || sub === 'run' || A.present.has('continue') || A.present.has('c') || A.present.has('plan') || A.present.has('mode') || A.present.has('auto') || A.present.has('ctx'))
const oneShot =
  A.present.has('p') || A.present.has('print') || A.positionals.length > 0

const target = chat || !oneShot ? './src/shell/agent.mjs' : agent ? './codezy-v2.mjs' : './src/shell/print.mjs'
const known = chat || agent || !oneShot ? V2 : PRINT

for (const flag of A.present) {
  if (!known.has(flag)) {
    const dash = flag.length === 1 ? '-' : '--'
    const col = process.stderr.isTTY ? (s) => `\x1b[31m${s}\x1b[0m` : (s) => s
    process.stderr.write(`${col(`codezy: unknown option ${dash}${flag}`)}\nrun: codezy --help\n`)
    process.exit(2)
  }
}

if (chat) process.argv.push('--mode', 'chat')
await import(target)

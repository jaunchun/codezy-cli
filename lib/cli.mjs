// ---------------------------------------------------------------------------
// cli.mjs — shared command-line plumbing for every CODEZY CLI entry point.
//
// One parser, one help text, one exit-code convention — the CLI must behave
// like the mature agent CLIs (Claude Code, Codex, Antigravity, opencode)
// instead of each script inventing its own flags:
//   - flags are `--name value`, `--name=value` or boolean; `-x` shorts work
//   - positionals are the free words (a prompt, or an `exec`/`run` subcommand)
//   - exit codes: 0 ok · 1 runtime error · 2 usage error
// Plain Node, no dependencies.
// ---------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paintFor, detectColor } from '../src/theme.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// package.json FIRST: the CLI ships as its own npm package, so a global
// install has no repo root next to it. The Electron app's package.json stays
// the fallback for older checkouts.
const PKGS = [path.join(HERE, '..', 'package.json'), path.join(HERE, '..', '..', 'package.json')]

/** Version from the CLI package.json — the single source of truth. */
export function getVersion() {
  for (const f of PKGS) {
    try {
      const v = JSON.parse(fs.readFileSync(f, 'utf8')).version
      if (v) return v
    } catch {
      /* try the next candidate */
    }
  }
  return '0.0.0'
}

/**
 * Parses argv into flags + positionals.
 * @param {string[]} argv
 * @param {string[]} valueFlags names that take a value (stored in `values`)
 * @returns {{ values: Record<string,string>, present: Set<string>, positionals: string[] }}
 */
export function parseArgs(argv, valueFlags = []) {
  const values = Object.create(null)
  const present = new Set()
  const positionals = []
  const takesValue = new Set(valueFlags)

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (a.length > 1 && a.startsWith('-')) {
      let name = a.replace(/^--?/, '')
      let inline = null
      const eq = name.indexOf('=')
      if (eq !== -1) {
        inline = name.slice(eq + 1)
        name = name.slice(0, eq)
      }
      present.add(name)
      if (takesValue.has(name)) {
        if (inline !== null) {
          values[name] = inline
        } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
          values[name] = argv[++i]
        } else if (name === 'p' || name === 'print') {
          // `-p` immediately followed by another flag: leave the value UNSET
          // so the engine falls through to positionals (or stdin) instead of
          // eating `--dir` as the prompt. `present` still records `-p`, so
          // one-shot routing is unaffected. (Value after the flag works:
          // `-p "text"` — only a flag-looking token is refused.)
        } else {
          values[name] = '' // flag present without a value → read stdin
        }
      }
      continue
    }
    positionals.push(a)
  }
  return { values, present, positionals }
}

/** Reads all of stdin (for `-p` with no inline prompt). */
export async function readStdin() {
  let buf = ''
  for await (const chunk of process.stdin) buf += chunk
  return buf
}

// -- one help screen, styled when it lands on a TTY, plain when piped --------
const P = paintFor('graphite', detectColor(process.env, process.stdout), 'blue')
const dim = (s) => P.low(s)
const cyan = (s) => P.signal(s)
const bold = (s) => P.bold(s)

/** One aligned option row; long flags keep two spaces before the text. */
const row = (flag, text = '') => `  ${flag}${' '.repeat(Math.max(2, 29 - flag.length))}${text}`

/** The one unified `--help` screen, codex/claude-code style. */
export function helpText() {
  const head = (t) => bold(t)
  const section = (t) => `\n${cyan('▎')} ${head(t)} ${dim('-'.repeat(Math.max(2, 74 - t.length)))}`
  return `${cyan('◆')} ${bold('CODEZY')} ${dim('— local coding agent for the terminal')}  ${dim(`v${getVersion()}`)}

${head('START')}
${row('codezy', dim('open the REPL in agent mode'))}
${row('codezy --chat', dim('chat mode — answers only, no tools'))}
${row('codezy --plan', dim('plan mode — read-only research'))}
${row('codezy "prompt"', dim('one-shot chat'))}
${row('codezy exec "<prompt>"', dim('one-shot agent run: tools + approvals, then exit'))}
${row('codezy doctor [--json]', dim('check install, settings and endpoint'))}

${section('MODES')}
${row('chat', dim('answers only — no tools, no file changes'))}
${row('plan', dim('reads and researches — never writes or runs'))}
${row('agent', dim('tools with per-action approval (default)'))}
${row('auto', dim('tools, gated actions approved automatically'))}
  ${dim('switch inside the REPL with')} ${cyan('/mode <chat|agent|plan|auto')}

${section('OPTIONS')}
${row('-p, --print <prompt>', 'one-shot mode; omit the value to read stdin')}
${row('-a, --agent', 'tool-calling agent (tools + approvals)')}
${row('    --chat', 'open the REPL without tools')}
${row('    --plan', 'open the REPL in read-only plan mode')}
${row('    --mode <m>', 'chat · agent · plan · auto')}
${row('-c, --continue', 'resume the last saved agent session')}
${row('    --model <id>', 'override the model from settings')}
${row('    --dir <path>', 'workspace root / linked folder (alias: --root)')}
${row('    --url <url>', 'Ollama or OpenAI-compatible endpoint')}
${row('    --ctx <n>', 'context window (agent mode, default 65536)')}
${row('    --auto', 'approve gated tools automatically')}
${row('    --output-format <fmt>', 'one-shot: text (default) · json · stream-json')}
${row('    --preview', 'print the terminal chrome and exit')}
${row('-h, --help', 'show this help')}
${row('-V, --version', 'show the version')}

${section('REPL')}
  ${cyan('/help')} ${dim('commands')}   ${cyan('/theme')} ${dim('graphite · paper · contrast')}   ${cyan('/mode')} ${dim('chat · agent · plan · auto')}
  ${cyan('/model')} ${dim('switch')}   ${cyan('/root')} ${dim('workspace')}   ${cyan('/todos')} ${dim('checklist')}   ${cyan('/diff')} ${dim('and')} ${cyan('/undo')} ${dim('review changes')}
  ${cyan('/search')} ${dim('<q>')}   ${cyan('/scout')} ${dim('<q>')}   ${cyan('/compact')} ${dim('context')}   ${cyan('/usage')} ${dim('tokens')}   ${cyan('/exit')} ${dim('quit')}
  ${dim('TAB completes commands · ↑/↓ history · Esc stops a running turn')}

${section('EXAMPLES')}
  codezy                                    ${dim('open the REPL')}
  codezy --chat                             ${dim('ask a question, no tools')}
  codezy -p "explain this stack trace"
  cat error.log | codezy -p "why is this failing?"
  codezy exec "fix the failing tests" --auto
  codezy --agent --dir ../my-repo           ${dim('agent REPL over a folder')}
  codezy --agent --preview                  ${dim('print the terminal chrome only')}
  codezy doctor                             ${dim('is everything wired up?')}

${section('EXIT CODES')}
  0  ok    ${dim('1  runtime error')}    ${dim('2  usage error')}

${dim('Install: npm i codezy-cli   (add -g to put codezy on your PATH)')}
${dim('/thinking on = long mode: reason-first replies and double the step budget.')}
${dim('/model fast <id> picks a cheap model for summaries and scouting so the')}
${dim('main model keeps its context for real coding.')}`
}

/** `codezy exec --help` / `codezy run --help`: the scripted agent surface. */
export function execHelpText() {
  const head = (t) => bold(t)
  return `${bold('CODEZY exec')} ${dim('— one-shot agent run (tools + approvals)')}  ${dim(`(v${getVersion()})`)}

${head('USAGE')}
${row('codezy exec "<prompt>" [options]', dim('run one task, print the answer, exit'))}
${row('codezy run "<prompt>" [options]', dim('alias for exec'))}
${row('codezy --agent', dim('interactive agent REPL over the same harness'))}
${row('codezy --agent -p "<prompt>"', dim('one-shot with an explicit flag'))}

${head('WHAT IT DOES')}
  The model reads, searches, edits and runs commands inside --dir. Writes
  and commands ask for approval first; --auto approves them. Tool activity
  goes to stderr, the final answer to stdout. A model that cannot call
  tools falls back to classic edit blocks with the real file contents.

${head('OPTIONS')}
${row('    --model <id>', 'override the model from settings')}
${row('    --dir <path>', 'workspace root (alias: --root; default: current folder)')}
${row('    --url <url>', 'Ollama or OpenAI-compatible endpoint')}
${row('    --ctx <n>', 'context window (default 65536)')}
${row('    --auto', 'approve every gated write/command automatically')}
${row('-c, --continue', 'resume the most recent saved agent session')}
${row('    --output-format <fmt>', 'text (default) · json · stream-json')}
${row('-h, --help', 'show this help')}

${head('EXAMPLES')}
  codezy exec "fix the failing tests" --auto
  codezy exec "add a README" --dir ../my-app --output-format json
  codezy run "why is the build slow?" --model qwen2.5-coder:7b
  codezy --agent --dir .                     ${dim('stay for a conversation')}
  codezy --agent --preview                   ${dim('print the terminal chrome only')}

${head('EXIT CODES')}
  0  ok    1  runtime error    2  usage error

${dim('Approval is real: without --auto and without a TTY, gated tools are denied.')}
${dim('Use --auto only on a branch or a disposable checkout.')}`
}

/** `codezy doctor --help`: the headless health check. */
export function doctorHelpText() {
  const head = (t) => bold(t)
  return `${bold('CODEZY doctor')} ${dim('— headless health check')}  ${dim(`(v${getVersion()})`)}

${head('USAGE')}
${row('codezy doctor', dim('human report; exit 0 when usable, 1 on a real problem'))}
${row('codezy doctor --json', dim('one machine-readable JSON line for CI and scripts'))}

${head('CHECKS')}
  node        version is new enough for the CLI
  package     package.json, version and bin mapping
  settings    ~/.codezy/settings.json (or the custom data folder)
  data dir    writable
  endpoint    Ollama / OpenAI-compatible endpoint reachable
  model       the active model is installed (Ollama) or listed (provider)
  hooks       configured hooks load
  mcp         configured MCP servers are readable
  git         git is on PATH

${head('EXIT CODES')}
  0  no errors (warnings are allowed — Ollama may simply be stopped)
  1  a real problem, such as an unreadable settings file
  2  usage error

${dim('A stopped Ollama is a warning, not a failure: start it, then rerun.')}`
}

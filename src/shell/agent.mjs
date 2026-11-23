#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CODEZY v2 — terminal shell over the shared agent harness.
//
//   node codezy-v2.mjs [--root <dir>] [--model <id>] [--url <ollama>]
//                      [--auto] [--ctx <n>]
//
// ONE core, two shells: every loop / tool / safety / approval-gate line lives
// in lib/harness.mjs — the Electron app imports that exact file too. This
// shell only injects the terminal pieces:
//   - approve → an interactive y/N question on your TTY (never in pipes:
//               piped input without --auto DENIES everything, by design)
//   - onEvent → prints one activity line per tool step
//   - reply   → rendered as markdown
//
// v1 (codezy.mjs) is untouched — v2 is new files only.
// ---------------------------------------------------------------------------

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

import {
  runAgent,
  makeRegistry,
  loadHooks,
  ollamaCall,
  openaiCall,
  resolveInRoots,
  DEFAULT_NUM_CTX,
  DANGEROUS_TOOLS,
  TOOLS
} from '../../lib/harness.mjs'
import { mcpRegistryTools, mcpGetSession, mcpDisconnectAll } from '../../lib/mcp.mjs'
import { renderMd, setMdPalette } from '../../lib/md.mjs'
import { paintFor, detectColor, resolveTheme, resolveAccent, stripAnsi, DEFAULT_THEME, DEFAULT_ACCENT } from '../theme.mjs'
import { TOKENS, THEMES as THEME_NAMES, ACCENTS } from '../tokens.mjs'
import {
  card,
  panel,
  rule,
  section,
  banner,
  settingsPanel,
  settingsChoices,
  settingsScreen,
  pickerList,
  wordmark,
  commandPalette,
  promptText as promptFor,
  promptMarker,
  activity,
  statLine,
  notice,
  hint,
  assistantBlock,
  userLine,
  toolLabel,
  clipVisible,
  SPINNER_FRAMES
} from '../render/chrome.mjs'
import { createSpinner } from 'nanospinner'
import { webSearch, keyLines, buildWebContext } from '../../lib/search.mjs'
import { parseArgs, readStdin, getVersion } from '../../lib/cli.mjs'
import { modelCapabilities, listOllamaModels, listOpenAIModels, fmtSize } from '../../lib/engine.mjs'
import { createScreen, makeSink } from './screen.mjs'

// -- flags (shared parser - lib/cli.mjs, same surface as `codezy --help`) -----

const argv = process.argv.slice(2)
// `codezy exec|run "prompt"` — codex-exec / opencode-run style one-shot entry
const A = parseArgs(argv, ['root', 'dir', 'model', 'url', 'ctx', 'print', 'p', 'output-format', 'mode'])
const SUB = A.positionals[0] === 'exec' || A.positionals[0] === 'run' ? A.positionals.shift() : null
let auto = A.present.has('auto') // `/auto` flips it mid-session
const RO_TOOLS = new Set(['list_dir', 'read_file', 'grep_search', 'glob', 'web_search', 'web_fetch'])
const modeArg = String(A.values.mode || '').toLowerCase()
let MODE = modeArg === 'chat' ? 'chat' : modeArg === 'plan' ? 'plan' : modeArg === 'auto' ? 'auto' : (A.present.has('chat') ? 'chat' : A.present.has('plan') ? 'plan' : A.present.has('auto') ? 'auto' : 'agent')
if (MODE === 'auto') auto = true
const ROOT0 = path.resolve(A.values.root ?? A.values.dir ?? process.cwd())
const CTX = Math.max(4096, parseInt(A.values.ctx ?? '', 10) || DEFAULT_NUM_CTX)
// one-shot print mode: `exec "prompt"` · `-p "prompt"` · `--agent "prompt"`
const PRINT =
  SUB !== null ||
  A.positionals.length > 0 ||
  A.present.has('print') ||
  A.present.has('p')

// one-shot output shape: text (default) · json (one object) · stream-json (NDJSON)
const FMT = String(A.values['output-format'] ?? 'text')
if (!['text', 'json', 'stream-json'].includes(FMT)) {
  console.error('codezy: --output-format must be text, json or stream-json')
  process.exit(2)
}
const toolEvents = [] // json mode: collected for the final result object

// -- settings (same conventions as codezy.mjs) ---------------------------------

const HOME = path.join(os.homedir(), '.codezy')
function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch {
    return fallback
  }
}
let settings = readJson(path.join(HOME, 'settings.json'), {})
if (settings.dataDir && settings.dataDir !== HOME) {
  settings = { ...settings, ...readJson(path.join(settings.dataDir, 'settings.json'), {}) }
}
let MODEL = A.values.model || settings.activeModel || 'llama3.1:8b' // `/model` switches it live
const URL = A.values.url || settings.ollamaUrl || 'http://127.0.0.1:11434'
// dual-model roles: the fast model does the CHEAP work (compaction summaries,
// /scout research runs) so the main model spends its context on real coding.
// '' = off → everything runs on the main model. Set with `/model fast <id>`
// or persist `fastModel` in settings.json (the app ignores the field).
let FAST = String(settings.fastModel || '')
// thinking mode (long mode): the explicit "big task" switch — reason-first
// prompting + a deeper step budget. Toggled with /thinking in the REPL; the
// app's Thinking button persists the same `thinkingMode` settings field.
let THINKING = settings.thinkingMode === true
// an ask_user call mid-chain parks here until the REPL's next typed line
// (or ctrl+c) resolves it — see the wire 'line' handler below
let pendingAsk = null

// cloud provider from settings (desktop or /provider nebius <key> sets this
// up): an OpenAI-compatible endpoint — Nebius Token Factory & friends — is
// used unless an explicit --url override was given.
const PROVIDER =
  !A.values.url && settings.activeProvider && settings.activeProvider !== 'ollama'
    ? (settings.providers ?? []).find((p) => p.id === settings.activeProvider) ?? null
    : null
// `--url …/v1` (or any …/vN) speaks the OpenAI wire format too
const URL_OPENAI = /\/v\d+\/?$/.test(URL)

/** Persist only the keys a terminal command actually changed. */
function persistSettings(patch) {
  try {
    const file = path.join(settings.dataDir && settings.dataDir !== HOME ? settings.dataDir : HOME, 'settings.json')
    const disk = readJson(file, {})
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ ...disk, ...patch }, null, 2))
    settings = { ...settings, ...patch }
  } catch {
    // a read-only settings file must not break the session
  }
}

// -- styling (`none` when piped -> clean test output) --------------------------

/** --preview prints the terminal chrome as a design sheet and exits. */
const PREVIEW = process.argv.includes('--preview')
// detectColor owns NO_COLOR / FORCE_COLOR / CODEZY_COLOR / truecolor probes.
// TTY is a separate UI switch: the banner and spinner still only belong on a
// real terminal, even when a caller forces colour in a pipe.
const TTY = !!process.stdout.isTTY || process.env.CODEZY_FORCE_COLOR === '1'
const COLOR = detectColor(process.env, process.stdout)
// A real terminal can be answered. CODEZY_TTY=1 says "pretend it is" — the
// same escape hatch the chat shell uses, so a test can drive the live screens.
const interactive = () => !!process.stdin.isTTY || process.env.CODEZY_TTY === '1'
const START_THEME = resolveTheme(process.env.CODEZY_THEME || settings.theme || DEFAULT_THEME)
const START_ACCENT = resolveAccent(process.env.CODEZY_ACCENT || settings.accent || DEFAULT_ACCENT)

// One paint kit, swapped live by /theme. Every helper closes its own escape,
// so nested values stay balanced and the card measurer can strip ANSI safely.
let P = paintFor(START_THEME, COLOR, START_ACCENT)
// the reply's markdown follows the same palette as the rest of the screen
setMdPalette(P)
const cyan = (s) => P.signal(s)
const dim = (s) => P.low(s)
const mid = (s) => P.mid(s)
const bold = (s) => P.bold(s)
const green = (s) => P.ok(s)
const red = (s) => P.danger(s)
const yellow = (s) => P.warn(s)

// Runtime model capability: Ollama's /api/show is the source of truth, not a
// hard-coded list of model names. Probed only when the banner will be seen
// (a TTY), so piped/test runs stay instant and offline. --preview is a design
// sheet: it shows the tool-capable face without touching an endpoint.
let CAPS = PREVIEW ? ['completion', 'tools'] : null
if (TTY && !PREVIEW && !PROVIDER) CAPS = await modelCapabilities(URL, MODEL)
const capabilityLabel = () => {
  if (PROVIDER) return 'agent tools (provider)'
  if (!CAPS) return 'not reported'
  return CAPS.includes('tools') ? 'agent tools' : 'chat only - edit blocks'
}

// -- thinking spinner (TTY only — pipes stay byte-clean for tests/CI) -----------
// nanospinner draws it: the frames, the colour and the line bookkeeping are
// its job. We keep the two things it cannot know about — never wipe the
// line the human is typing on, and the elapsed-seconds suffix — and we
// drive its loop ourselves instead of start(), whose SIGINT handler would
// exit the process and break "ctrl+c interrupts the turn".
let spin = null
let spinTimer = null
let spinLabel = 'thinking'
let spinT0 = 0
const spinAllowed = () =>
  TTY &&
  !PRINT &&
  !!process.stderr.isTTY &&
  !!process.stdout.isTTY &&
  process.env.TERM !== 'dumb' &&
  !process.env.CI

/** The stream nanospinner writes to: stderr (so print mode keeps stdout
 *  machine-clean), but a frame is DROPPED while the human is typing or a
 *  question owns the line. */
const spinStream = {
  get columns() {
    return process.stderr.columns ?? 80
  },
  write(chunk) {
    if (awaitingApproval || pendingAsk || rl?.line) return
    process.stderr.write(chunk)
  }
}

function spinStart(label = 'thinking') {
  if (!spinAllowed() || spin) return
  spinLabel = label
  spinT0 = Date.now()
  const accentColor = { blue: 'blue', lime: 'green', amber: 'yellow', magenta: 'magenta' }
  spin = createSpinner('', {
    stream: spinStream,
    frames: SPINNER_FRAMES,
    color: COLOR === 'none' ? undefined : accentColor[P.accentName] || 'blue',
    interval: 80
  })
  const draw = () => {
    if (!spin) return
    // after 2s show elapsed time — a quiet local model must never look frozen
    const secs = Math.floor((Date.now() - spinT0) / 1000)
    const elapsed = secs >= 2 ? P.low(` · ${secs}s`) : ''
    const label = spinLabel === 'thinking' ? 'Thinking' : spinLabel
    spin.update(`${P.mid(label)}${P.low('…')}${elapsed}`)
    spin.spin()
  }
  draw()
  spinTimer = setInterval(draw, 90)
  spinTimer.unref?.()
}

/** swap the live label without restarting the spinner (step counter, tool…) */
function spinSet(label) {
  if (!spin) return // no spinner on screen — nothing to relabel
  spinLabel = label
}

/** Erase the spinner's line without retiring it - call before writing output. */
function spinClear() {
  if (!spin) return // no spinner on screen (and pipes stay byte-clean)
  spin.clear()
}

function spinStop() {
  if (!spin) return
  if (spinTimer) {
    clearInterval(spinTimer)
    spinTimer = null
  }
  spin.clear()
  spin.reset()
  // nanospinner hides the cursor in render(); clear/reset does not restore it,
  // so put it back explicitly or the prompt looks dead after every turn.
  if (process.stderr.isTTY) process.stderr.write('\x1b[?25h')
  spin = null
}

// -- session state ---------------------------------------------------------------

let roots = [ROOT0]
let history = [] // assistant/tool chain from the previous turn (stateful!)

// -- agent session saves (~/.codezy/agent/) ------------------------------------
// Autosaved after EVERY turn, so Ctrl+D (or a crash) never costs a chain.
// Deliberately its own folder: v1's /resume and the desktop app's session
// lists never see these files, and a v2 chain (tool_calls / role:"tool") is
// not a v1 conversation shape.
const AGENT_DIR = path.join(HOME, 'agent')
let saveId = null
let saveTitle = ''

function listAgentSaves() {
  const out = []
  try {
    for (const f of fs.readdirSync(AGENT_DIR).filter((x) => x.endsWith('.json'))) {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, f), 'utf8'))
        if (s?.id && Array.isArray(s.history)) out.push(s)
      } catch {
        // skip a corrupt file — one bad save must not hide the others
      }
    }
  } catch {
    // no saves yet
  }
  return out.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
}

function autosave() {
  if (!history.length) return
  try {
    fs.mkdirSync(AGENT_DIR, { recursive: true })
    if (!saveId) saveId = `a${Date.now().toString(36)}`
    if (!saveTitle) {
      saveTitle = String(history.find((m) => m.role === 'user')?.content ?? 'agent session')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 56)
    }
    fs.writeFileSync(
      path.join(AGENT_DIR, `${saveId}.json`),
      JSON.stringify({ id: saveId, title: saveTitle, savedAt: Date.now(), model: MODEL, roots, history }, null, 2),
      'utf8'
    )
  } catch {
    // saving is best-effort — never break the chat over it
  }
}

function resumeSave(s) {
  history = Array.isArray(s.history) ? s.history : []
  if (Array.isArray(s.roots) && s.roots.length) roots = s.roots
  saveId = s.id
  saveTitle = s.title || 'untitled'
}

// -- session usage (/usage) ------------------------------------------------------
const sessionUsage = { promptTokens: 0, completionTokens: 0, calls: 0 }
function addUsage(u) {
  if (!u) return
  sessionUsage.promptTokens += Number(u.promptTokens) || 0
  sessionUsage.completionTokens += Number(u.completionTokens) || 0
  sessionUsage.calls += Number(u.calls) || 0
}

/** Update the status bar on the chat screen with live stats. */
function updateStatusBar() {
  if (!rl || !interactive()) return
  const total = sessionUsage.promptTokens + sessionUsage.completionTokens
  const tokStr = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total)
  const ws = roots.length ? path.basename(roots[0]) : ''
  const parts = [MODE, MODEL || '—', ws].filter(Boolean)
  const bar = `${parts.join(' · ')}  ·  ${tokStr} tokens  ·  ${sessionUsage.calls} calls`
  screen.setStatusBar(bar)
}

// --continue / -c: restore the newest save at startup (REPL and exec alike)
if (A.present.has('continue') || A.present.has('c')) {
  const latest = listAgentSaves()[0]
  const out = PRINT ? console.error : console.log // stdout stays machine-readable
  if (latest) {
    resumeSave(latest)
    out(dim(`resumed "${saveTitle}" — ${history.length} messages · /clear starts fresh`))
  } else {
    out(dim(`no saved agent session in ${AGENT_DIR} to continue`))
  }
}

// -- auto-compact (/compact) -----------------------------------------------------
// Long chains bloat the window and blur the model's focus. Older messages
// collapse into one summary; the last 6 (and the SYSTEM line rebuilt per
// turn) always survive. Runs manually via /compact and automatically past
// 60 messages inside turn().
let compacting = false
async function compactHistory(manual) {
  if (compacting) return false
  if (history.length < 6) {
    if (manual) console.log(dim('nothing to compact yet — the chain is still short'))
    return false
  }
  compacting = true
  try {
    const keep = history.slice(-6)
    const old = history.slice(0, Math.max(history.length - 6, 1))
    if (manual) console.log(dim(`compacting ${old.length} messages…`))
    const convo = old
      .map((m) =>
        m.role === 'tool'
          ? `${m.tool_name ?? 'tool'}: [result] ${String(m.content ?? '').slice(0, 500)}`
          : `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 3000) : ''}`
      )
      .join('\n\n')
    // dual-model: summarize on the FAST model when one is set — a summary is
    // grunt work, and the main model's context is too precious to spend on it
    const res = await call({
      model: FAST || undefined,
      messages: [
        {
          role: 'user',
          content:
            `Summarize this coding-assistant conversation for continuation. ` +
            `Keep decisions, file paths, code state, and open tasks. Max 15 lines, no preamble.\n\n${convo}`
        }
      ]
    })
    if (res.stats) {
      addUsage(res.stats)
      sessionUsage.calls++
    }
    const summary = String(res.content ?? '').trim()
    if (!summary) return false
    history = [
      { role: 'user', content: `[conversation summary]\n${summary}` },
      { role: 'assistant', content: 'Understood — continuing from the summary above.' },
      ...keep
    ]
    if (manual) console.log(dim(`compacted — ${old.length} messages → 1 summary (+${keep.length} kept)`))
    return true
  } finally {
    compacting = false
  }
}

/** thinking mode (long mode) — appended to SYSTEM when the toggle is on: the
 *  explicit "reason it out first" contract for hard problems. */
const THINKING_MODE = `## Thinking mode
The user turned on THINKING (long mode) — this deserves care, not speed. Before working: restate the problem to yourself in one line, sketch a short plan, and when more than one reasonable approach exists, name the alternative you rejected and why. Work through the steps, verify your own reasoning before presenting it, check edge cases, and state your assumptions. If a requirement is genuinely ambiguous, ask the user ONE focused question with ask_user instead of guessing. Slower and thorough beats fast and wrong.`

/** ask_user in the REPL: park the chain, show the question, wait for the next
 *  typed line (the wire 'line' handler routes it straight back here) — or
 *  ctrl+c, which resolves it as skipped so the chain can unwind. */
function askRealUser(question, options) {
  spinStop()
  // a question is a decision, so it gets one frame: the text, the choices,
  // and the way out, in that order.
  const rows = [question]
  if (options?.length) {
    rows.push(null)
    for (const [i, o] of options.entries()) rows.push(`${P.signal(String(i + 1))}  ${P.mid(o)}`)
    rows.push(null)
  }
  rows.push(P.low('type your answer — an empty line = the model decides'))
  console.log(`\n${card(P, 'question', rows, { maxWidth: 64 })}\n`)
  if (rl && process.stdin.isTTY) {
    rl.setPrompt(`${P.mid('answer')} ${P.signal('❯')} `)
    screen.render()
  }
  return new Promise((resolve) => {
    pendingAsk = { resolve }
  })
}

/** non-interactive stub (print/exec mode): the tool still exists, it just
 *  never blocks a headless run waiting for a human who isn't there. */
function askNoOne() {
  return Promise.resolve('(no user available in this mode — proceed with your best judgement and state the assumption you made)')
}

const SYSTEM = `You are CODEZY, a coding agent running in the user's terminal.
You have tools: list_dir, read_file, write_file, edit_file, glob, grep_search, run_command,
task_status, web_search, web_fetch, todo_write, ask_user. Inspect the workspace with them before
answering when that helps. web_search queries the internet (DuckDuckGo) and returns titles,
URLs and snippets — USE IT for anything current or web-related (releases, prices, docs, news)
and whenever you are unsure; you DO have internet access through it, never claim you cannot
search the web. web_fetch opens one URL and returns its text (HTML stripped to prose) — after
a search, fetch the 1–3 most promising links instead of answering from snippets alone. Paths
are relative to the workspace root. For any task with more than two steps, first save your
plan with todo_write (pending / in_progress / done) and update it as you finish each
step. Be direct and practical; answer in plain markdown,
fenced code blocks with a language tag. write_file, edit_file and run_command always ask the
user for approval first — say in one short sentence what you are about to do. When a
requirement is genuinely ambiguous — or a decision is the user's to make — use ask_user
with ONE focused question instead of guessing; never ask about anything you can verify
yourself with the other tools.`

// every slash command, for TAB completion and the /help screen alike —
// ordered by what a session reaches for first, not alphabetically
const SLASH = [
  '/help',
  '/settings',
  '/model',
  '/theme',
  '/mode',
  '/thinking',
  '/auto',
  '/todos',
  '/diff',
  '/undo',
  '/clear',
  '/compact',
  '/search',
  '/scout',
  '/resume',
  '/export',
  '/root',
  '/tools',
  '/mcp',
  '/usage',
  '/exit',
  '/quit'
]

// one line each — shared by the live palette, TAB and /help
const SLASH_HELP = {
  '/auto': 'run gated tools without asking',
  '/clear': 'forget the conversation chain',
  '/compact': 'summarize older messages',
  '/diff': 'newest approved change vs the disk',
  '/exit': 'quit',
  '/export': 'save the conversation to markdown',
  '/help': 'every command',
  '/mcp': 'MCP servers and their tools',
  '/mode': 'chat · agent · plan · auto',
  '/model': 'show or switch the model',
  '/quit': 'quit',
  '/resume': 'list or restore saved sessions',
  '/root': 'show or set the workspace root',
  '/scout': 'read-only research run',
  '/search': 'web search — no model needed',
  '/settings': 'change any setting, live',
  '/theme': 'palette · graphite / paper / contrast',
  '/thinking': 'long mode: reason-first replies',
  '/todos': 'the current checklist',
  '/tools': 'every tool the agent can call',
  '/undo': 'put the newest change back',
  '/usage': 'tokens used in this session'
}

const completer = (line) => {
  const hits = SLASH.filter((k) => k.startsWith(line))
  if (hits.length === 1) return [[hits[0]], line]
  const prefix = hits.length ? hits.reduce((a, b) => {
    while (!b.startsWith(a)) a = a.slice(0, -1)
    return a
  }) : ''
  return [prefix && prefix !== line ? [prefix] : [], line]
}

// -- the live `/` palette ------------------------------------------------------
// The list sits ABOVE the input box: it never covers the text you are
// typing. Only command names are candidates — once a space lands, the line is
// an argument and the list steps out of the way.
//
// The arrows walk the LIST while it is open: ↑ and ↓ move the pointer, and
// Enter runs the command under it. That is the whole point of a list — you
// pick with the arrow keys, not by typing the name out.
let paletteN = 0
// the row the arrows have landed on, or -1 for none
let paletteSel = -1
// the line before the arrows touched it — the arrows must not walk the
// input's own history while the list is open
let paletteLine = ''
// the line the pointer belongs to — typing a new one starts the walk over
let paletteSelLine = null

const paletteHits = (line) => {
  const q = String(line)
  if (!q.startsWith('/') || q.includes(' ')) return []
  return SLASH.filter((k) => k.startsWith(q))
}

function paletteRows(line) {
  const hits = paletteHits(line).map((cmd) => ({ cmd, desc: SLASH_HELP[cmd] || '' }))
  return commandPalette(P, hits, { sel: paletteSel })
}

/**
 * Move the pointer through the list. Returns true when the list was open and
 * the arrow belongs to the list, not to the input's history.
 */
function paletteMove(dir) {
  // readline walks its own history BEFORE this listener runs — so the line
  // may already hold an old command. Put it back first, then ask the LIST
  // (not the history) what the arrow means.
  const line = paletteLine
  if (rl) {
    rl.line = line
    rl.cursor = line.length
  }
  const hits = paletteHits(line)
  if (!hits.length) return false
  if (paletteSel < 0) {
    // the first press lands on the first row (or the last, going up)
    paletteSel = dir > 0 ? 0 : hits.length - 1
  } else {
    paletteSel = (paletteSel + dir + hits.length) % hits.length
  }
  paletteDraw(paletteRows(line))
  return true
}

/** The command the pointer is on, if any. */
function paletteChoice() {
  // the line the list was built from — readline has already cleared rl.line
  // by the time a submitted line reaches the handler
  const hits = paletteHits(paletteLine)
  if (paletteSel < 0 || paletteSel >= hits.length) return null
  return hits[paletteSel]
}

/** Erase the palette; the cursor stays on the input line. */
function paletteClear() {
  if (!paletteN) return
  paletteN = 0
  paletteSel = -1
  screen.setSuggestions([])
}

/** Erase the palette and every line it used, then park the cursor on the
 *  prompt line. Used when the screen is replaced by output (a command ran). */
function paletteClearAll() {
  paletteClear()
}

/** Erase the palette after readline has accepted the line: the cursor is on
 *  its first row, which is exactly where output should start. */
function paletteClearAfterLine() {
  paletteClear()
}

function paletteDraw(rows) {
  // the list lives ABOVE the box — the app redraws both together
  paletteN = rows.length
  screen.setSuggestions(rows)
  // the line the pointer belongs to — typing a new one starts the walk over
  const line = rl?.line ?? ''
  if (line !== paletteSelLine) {
    paletteSelLine = line
    paletteSel = -1
  }
  paletteLine = line
}


/** The prompt carries the mode: `› agent `, with `*` while thinking is on. */
const promptText = () => promptFor(P, MODE, THINKING)

// -- the screen ------------------------------------------------------------------
// The app owns the terminal. The home screen (the wordmark and the input box
// in the middle) and every menu live on the ALTERNATE screen; the
// conversation lives on the main one, so scrolling up shows the conversation
// and never a half-drawn menu.
//
// readline keeps editing the text; it writes to a sink, so nothing it does
// can tear a frame apart.

/** The wordmark rows for the home screen. */
const homeWordmark = (w) => wordmark(P, w)

/**
 * The runtime facts under the home screen's wordmark.
 *
 * The facts take the width they are given — a narrow terminal gets a shorter
 * line, never one that runs off the edge.
 */
const homeFacts = (w) => {
  const ctx = /^\d+$/.test(String(CTX)) ? Number(CTX).toLocaleString('en-US') : String(CTX)
  // an empty piece must not leave a dangling separator behind it
  const bits = [
    MODEL ? P.text(MODEL) : '',
    P.mid(PROVIDER ? PROVIDER.name || PROVIDER.id : 'ollama'),
    P.mid(`${ctx} ctx`),
    P.mid(`${TOOLS.length + (mcpCache?.total || 0)} tools`),
    THINKING ? P.warn('thinking on') : P.low('thinking off'),
    P.signal(MODE),
    P.low(`v${getVersion()}`)
  ].filter(Boolean)
  const room = Math.max(20, w - 4)
  const line = clipVisible(bits.join(P.low(' · ')), room)
  const root = roots.length ? path.basename(roots[0]) : ''
  return [line, root ? P.low(clipVisible(root, room)) : ''].filter(Boolean)
}

const screen = createScreen({
  paint: { p: P, placeholder: 'ask anything · / for commands' },
  wordmark: homeWordmark,
  facts: homeFacts,
  hint: P.low('↑ ↓ history · tab completes · / for commands'),
  completer,
  prompt: () => promptMarker(P, MODE, THINKING)
})

/** The readline interface — the text lives here, the app draws around it. */
const rl = PRINT && !process.stdin.isTTY ? null : screen.rl

// Every line the app prints goes ABOVE the box: the box steps aside, the
// text lands, and the box comes back. That keeps the transcript a real
// scrollback — scrolling up shows the conversation, never a torn frame.
//
// A pipe never owns the screen: there the text goes straight out, so a
// script's stdout holds the answer and nothing else.
const rawLog = console.log.bind(console)
console.log = (...args) => {
  const text = args
    .map((a) => (typeof a === 'string' ? a : String(a)))
    .join(' ')
  if (!rl || !interactive() || !screen.live) return rawLog(text)
  screen.say(text)
}

/** Erase the box, print, and draw it again. */
function above(text) {
  screen.say(text)
}

function question(q) {
  return new Promise((resolve) => (rl ? rl.question(q, resolve) : resolve('')))
}

// -- approval gate (the injected TUI half) ----------------------------------------

let awaitingApproval = false // the y/N question owns the next line of input
const always = new Set() // "a" at the prompt — trust this tool for the session

// -- /diff + /undo: a small in-memory safety net --------------------------------
// The snapshot is taken AFTER approval and BEFORE the tool runs, so a denied
// action never stacks an entry. Only write_file/edit_file are covered: running
// a command has no single file to put back.
const undoStack = []
const MAX_UNDO = 25

/** Root-relative label for a workspace file (absolute when outside a root). */
function displayPath(target) {
  for (const root of roots) {
    const rel = path.relative(root, target)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/')
  }
  return target
}

function snapshotFile(name, args) {
  if (name !== 'write_file' && name !== 'edit_file') return
  const rel = String(args.path ?? '').trim()
  if (!rel) return
  // same resolution the harness itself uses: relative paths live under the
  // workspace roots, not necessarily process.cwd() (--root / /root)
  let target
  try {
    target = resolveInRoots(roots, rel)
  } catch {
    return
  }
  try {
    if (fs.existsSync(target) && fs.statSync(target).size > 2_000_000) return
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
    undoStack.push({ path: target, before, tool: name, at: Date.now() })
    if (undoStack.length > MAX_UNDO) undoStack.shift()
  } catch {
    // unreadable (permissions, vanished) — /undo simply has nothing for it
  }
}

/** Compact line diff of the newest snapshot vs the file on disk right now. */
function showLastDiff() {
  const item = undoStack[undoStack.length - 1]
  if (!item) {
    console.log(dim('no change to diff yet — /diff covers approved write_file / edit_file steps in this session'))
    return
  }
  let after
  try {
    after = fs.existsSync(item.path) ? fs.readFileSync(item.path, 'utf8') : null
  } catch (e) {
    console.log(red(`cannot read ${item.path}: ${e?.message ?? e}`))
    return
  }
  const a = item.before == null ? [] : item.before.split(/\r?\n/)
  const b = after == null ? [] : after.split(/\r?\n/)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let ea = a.length - 1
  let eb = b.length - 1
  while (ea >= start && eb >= start && a[ea] === b[eb]) {
    ea--
    eb--
  }
  const rel = displayPath(item.path)
  console.log(bold(`last change · ${rel}`))
  console.log(dim(`${item.tool} · ${new Date(item.at).toLocaleTimeString()} · ${a.length}→${b.length} lines`))
  if (start > ea && start > eb) {
    console.log(dim('the file on disk matches the snapshot again — nothing to show'))
    return
  }
  const rows = []
  for (let i = Math.max(0, start - 2); i < start; i++) rows.push(`  ${dim(String(i + 1).padStart(4))}  ${a[i]}`)
  for (let i = start; i <= ea; i++) rows.push(`${red('-')} ${dim(String(i + 1).padStart(4))}  ${red(a[i])}`)
  for (let j = start; j <= eb; j++) rows.push(`${green('+')} ${dim(String(j + 1).padStart(4))}  ${green(b[j])}`)
  for (let j = eb + 1; j <= Math.min(b.length - 1, eb + 2); j++)
    rows.push(`  ${dim(String(j + 1).padStart(4))}  ${b[j]}`)
  const CAP = 80
  console.log(rows.slice(0, CAP).join('\n'))
  if (rows.length > CAP) console.log(dim(`… ${rows.length - CAP} more line(s) — open the file for the rest`))
}

function undoLastChange() {
  const item = undoStack.pop()
  if (!item) {
    console.log(dim('nothing to undo — /undo covers approved write_file / edit_file steps in this session'))
    return
  }
  const rel = displayPath(item.path)
  try {
    if (item.before == null) {
      if (fs.existsSync(item.path)) fs.unlinkSync(item.path)
      console.log(`${green('✓')} removed ${rel} — it did not exist before the change`)
    } else {
      fs.writeFileSync(item.path, item.before, 'utf8')
      console.log(`${green('✓')} restored ${rel} (${item.before.split(/\r?\n/).length} lines)`)
    }
  } catch (e) {
    undoStack.push(item) // keep it available after a failed attempt
    console.log(red(`undo failed: ${e?.message ?? e}`))
  }
}

/** `?` at the approval prompt: the full content/command, not a 2-line preview. */
function approvalDetails(name, args) {
  console.log(rule(P, 'details', process.stdout.columns || 80))
  if (name === 'write_file') {
    const body = String(args.content ?? '')
    const lines = body.split('\n')
    console.log(dim(`path: ${args.path} · ${lines.length} lines`))
    lines.slice(0, 200).forEach((l, i) => console.log(`${dim(String(i + 1).padStart(4))}  ${l}`))
    if (lines.length > 200) console.log(dim(`… ${lines.length - 200} more line(s)`))
  } else if (name === 'edit_file') {
    const oldLines = String(args.old ?? '').split('\n')
    const newLines = String(args.new ?? '').split('\n')
    console.log(dim(`path: ${args.path}${args.replace_all ? ' · every match' : ''}`))
    console.log(red('--- old'))
    oldLines.slice(0, 100).forEach((l) => console.log(red(l)))
    if (oldLines.length > 100) console.log(dim(`… ${oldLines.length - 100} more line(s)`))
    console.log(green('+++ new'))
    newLines.slice(0, 100).forEach((l) => console.log(green(l)))
    if (newLines.length > 100) console.log(dim(`… ${newLines.length - 100} more line(s)`))
  } else if (name === 'run_command') {
    console.log(dim('command:'))
    console.log(String(args.command ?? ''))
  } else {
    console.log(JSON.stringify(args, null, 2))
  }
  console.log(dim('the action still has NOT run — answer y, N, or a'))
}


/** What the approval prompt shows: a one-line description plus a tiny preview
 *  (first rows of a new file, a −/+ mini-diff for an edit) so the human
 *  approves a CHANGE, not a tool name. Piped runs never reach this. */
function approvalView(name, args) {
  const lines = []
  let what
  if (name === 'write_file') {
    const body = String(args.content ?? '')
    what = `write ${args.path} (${body.split('\n').length} lines)`
    for (const l of body.split('\n').slice(0, 2)) if (l.trim()) lines.push(dim(l.slice(0, 100)))
  } else if (name === 'edit_file') {
    const o = String(args.old ?? '')
    const nw = String(args.new ?? '')
    what = `edit ${args.path} (${o.split('\n').length}→${nw.split('\n').length} lines${args.replace_all ? ' · all matches' : ''})`
    // compact diff preview: up to 2 removed + 2 added rows, never more
    lines.push(...o.split('\n').slice(0, 2).map((l) => `${red('−')} ${dim(l.slice(0, 100))}`))
    lines.push(...nw.split('\n').slice(0, 2).map((l) => `${green('+')} ${dim(l.slice(0, 100))}`))
  } else if (name === 'run_command') {
    what = String(args.command ?? '').replace(/\s*\n\s*/g, ' ⏎ ').slice(0, 160)
  } else {
    what = name
  }
  return { what, lines }
}

async function approve(name, args) {
  if (auto || always.has(name)) {
    snapshotFile(name, args)
    return true
  }
  if (!process.stdin.isTTY) return false // pipes: deny unless --auto
  spinClear() // erase the spinner before the question takes the line
  const { what, lines } = approvalView(name, args)
  awaitingApproval = true
  try {
    // one permission dialog: the action, the actual change, then the keys.
    // The prompt below carries the decision so it can never scroll out of view.
    const rows = [what.slice(0, 110)]
    if (lines.length) {
      rows.push(null)
      rows.push(...lines)
    }
    rows.push(null)
    rows.push(
      `${green('y')} ${dim('once')}   ${green('a')} ${dim('always')}   ${red('n')} ${dim('no')}   ${dim('? details')}`
    )
    console.log(`\n${card(P, `approve · ${name}`, rows, { maxWidth: 64 })}\n`)
    let a = ''
    for (;;) {
      a = (
        await question(
          `${yellow('?')} allow ${name}? ${dim('[y/N · a=always · ?=details]')} `
        )
      ).trim()
      if (a === '?') {
        approvalDetails(name, args)
        continue
      }
      break
    }
    if (/^a$/i.test(a)) {
      always.add(name)
      snapshotFile(name, args)
      console.log(`  ${green('✓')} ${mid('approved for the rest of this session')}`)
      return true
    }
    const ok = /^(y|yes)$/i.test(a)
    if (ok) snapshotFile(name, args)
    console.log(ok ? `  ${green('✓')} ${mid('approved')}` : `  ${yellow('·')} ${dim('denied — nothing ran')}`)
    return ok
  } finally {
    awaitingApproval = false
    if (rl) {
      rl.setPrompt(promptText())
      // mid-run there is no prompt: the spinner keeps holding the line
      if (process.stdin.isTTY && !busy) screen.render()
    }
  }
}

// -- tool activity (the injected onEvent half) -------------------------------------

/** the human-readable argument for the activity line / live spinner label */
function eventArg(ev) {
  return ev.name === 'run_command'
    ? String(ev.args?.command ?? '')
    : ev.name === 'read_file' || ev.name === 'write_file' || ev.name === 'list_dir'
      ? String(ev.args?.path ?? '.')
      : ev.name === 'grep_search'
        ? `/${ev.args?.pattern}/`
        : ev.name === 'web_fetch'
          ? String(ev.args?.url ?? '')
          : String(ev.args?.query ?? '')
}

function onEvent(ev) {
  if (ev.type === 'model') {
    // the model is thinking about the next action — live in the spinner
    spinSet('thinking')
    return
  }
  if (ev.type === 'tool_start') {
    // what is EXECUTING right now — a slow run_command must never look frozen
    spinSet(`${toolLabel(ev.name)} ${eventArg(ev)}`.slice(0, 70))
    return
  }
  if (ev.type === 'nudge') {
    spinClear()
    console.log(`  ${dim('↩')} ${dim('checklist still open — pushing the model back into the loop')}`)
    return
  }
  if (ev.type === 'retry') {
    // transient model-call hiccup — say it out loud instead of a silent pause
    if (PRINT && FMT === 'stream-json') {
      console.log(JSON.stringify({ type: 'retry', attempt: ev.attempt, max: ev.max, error: String(ev.error ?? '').slice(0, 200) }))
      return
    }
    const write = PRINT ? console.error : console.log
    write(`  ${dim('↻')} ${dim(`model call failed (${String(ev.error ?? '').slice(0, 60)}) — retry ${ev.attempt}/${ev.max}`)}`)
    return
  }
  if (ev.type !== 'tool') return
  spinClear() // the ⎿ line starts on a clean line, spinner redraws below it
  const argStr = eventArg(ev)
  // structured output in print mode: stdout stays machine-readable
  if (PRINT && FMT === 'json') {
    toolEvents.push({ name: ev.name, arg: argStr.slice(0, 120), ok: ev.outcome === 'ok' })
    return
  }
  if (PRINT && FMT === 'stream-json') {
    console.log(
      JSON.stringify({ type: 'tool', iteration: ev.iteration, name: ev.name, arg: argStr.slice(0, 120), ok: ev.outcome === 'ok' })
    )
    return
  }
  // activity is telemetry: stderr in print mode so stdout stays just the reply.
  // One quiet line per tool call: a padded verb column, the argument, then the
  // outcome and the wall time — the run reads as a ledger and the columns line
  // up down the screen.
  const write = PRINT ? console.error : console.log
  write(activityLine(ev, argStr))
}

/** One activity line — verb, argument, outcome, wall time. */
function activityLine(ev, argStr = eventArg(ev)) {
  const summary = ev.outcome === 'ok' ? stepSummary(ev.name, ev.result) : ev.outcome
  return activity(
    P,
    {
      iteration: ev.iteration,
      name: ev.name,
      arg: String(argStr ?? '').slice(0, 64),
      summary,
      ms: ev.ms,
      outcome: ev.outcome
    },
    process.stdout.columns || 80
  )
}

/** One short human phrase for the ⎿ line after a successful tool step. */
function stepSummary(name, res) {
  const t = String(res ?? '')
  if (!t) return ''
  const lines = t.split('\n').length
  if (name === 'read_file') return t.endsWith('…[truncated]') ? `${lines}+ lines` : `${lines} lines`
  if (name === 'write_file') return t // "wrote 123 bytes to x"
  if (name === 'list_dir') return t === '(empty folder)' ? 'empty' : `${lines} entries`
  if (name === 'grep_search') return t.startsWith('no matches') ? 'no matches' : `${lines} matches`
  if (name === 'todo_write') return t.split('\n')[0] // "saved 3 todos (1 done)"
  if (name === 'web_search') return `${t.split('\n\n').length} results`
  if (name === 'web_fetch') return t.startsWith('fetch failed') ? t.slice(0, 60) : `${lines} lines`
  if (name === 'run_command') return (t.split('\n').find((l) => l.trim()) ?? '').slice(0, 60)
  return t.slice(0, 60)
}

// -- the model call, shared by REPL turns and one-shot print --------------------

function call({ messages: msgs, tools, signal, model: modelOverride }) {
  // dual-model: callers pass `model` to route a CHEAP task (compaction
  // summary, scout run) to the fast model; the default is always MAIN.
  const useModel = modelOverride || MODEL
  if (PROVIDER) {
    // cloud provider (settings.activeProvider) — OpenAI-compatible chat API
    return openaiCall({
      baseUrl: PROVIDER.baseUrl,
      apiKey: PROVIDER.apiKey,
      model: useModel,
      messages: msgs,
      tools,
      signal,
      temperature: 0.6
    })
  }
  if (URL_OPENAI) {
    // --url …/v1 — the OpenAI wire format (Nebius, LM Studio, Ollama's /v1…)
    return openaiCall({ baseUrl: URL, model: useModel, messages: msgs, tools, signal, temperature: 0.6 })
  }
  return ollamaCall({ baseUrl: URL, model: useModel, messages: msgs, tools, signal, numCtx: CTX, temperature: 0.6 })
}

// -- one turn ------------------------------------------------------------------------

// Registry is cached per workspace: todo_write state (and any future per-run
// state) then survives across turns instead of resetting every prompt.
let regCache = null
function getRegistry() {
  const key = roots.join('\n')
  if (!regCache || regCache.key !== key) regCache = { key, registry: makeRegistry({ roots }) }
  return regCache.registry
}

// MCP servers (v3.1) — grafted onto the registry as mcp__<server>__<tool>,
// exactly like the desktop app. One connect per config for the session; a bad
// server prints a line and the chat goes on.
let mcpCache = null
async function getMcp() {
  const servers = (settings.mcpServers ?? []).filter((s) => s && s.name && s.command && s.enabled !== false)
  if (!servers.length) return null
  const key = JSON.stringify(servers)
  if (!mcpCache || mcpCache.key !== key) {
    mcpCache = { key, ...(await mcpRegistryTools(servers)) }
    for (const f of mcpCache.failures) console.log(red(`mcp: ${f.server} — ${f.error}`))
  }
  return mcpCache
}

async function turn(prompt) {
  let registry
  try {
    registry = getRegistry()
  } catch (e) {
    console.log(red(`error: ${e.message}`))
    return
  }

  // v3.1 MCP: server tools join the registry + schema for this turn
  let mcp = null
  try {
    mcp = await getMcp()
  } catch (e) {
    console.log(red(`mcp: ${e?.message ?? e}`))
  }
  if (mcp?.total) Object.assign(registry, mcp.entries)

  // long chains collapse on their own (manual: /compact) — before the window
  // bloats, not after the model starts losing the plot
  if (history.length > 60 && !compacting) {
    try {
      await compactHistory(false)
    } catch (e) {
      console.log(dim(`auto-compact skipped: ${e?.message ?? e}`))
    }
  }

  const turnT0 = Date.now() // wall time rides the end-of-turn stat line
  const messages = [
    { role: 'system', content: (MODE === 'chat' ? `${THINKING ? `${SYSTEM}\n\n${THINKING_MODE}` : SYSTEM}\n\nYou are in chat mode: answer directly; do not call tools.` : MODE === 'plan' ? `${THINKING ? `${SYSTEM}\n\n${THINKING_MODE}` : SYSTEM}\n\nYou are in plan mode: research only, never edit or run commands.` : (THINKING ? `${SYSTEM}\n\n${THINKING_MODE}` : SYSTEM)) },
    ...history,
    { role: 'user', content: prompt }
  ]

  interrupted = false // fresh turn: ctrl+c interrupts THIS chain instead of quitting
  const ctl = new AbortController()
  abortCtl = ctl
  try {
    let result
    try {
      spinStart('thinking')
      result = await runAgent({
        messages,
        registry,
        tools:
          MODE === 'chat'
            ? []
            : MODE === 'plan'
              ? TOOLS.filter((t) => RO_TOOLS.has(t.function.name))
              : mcp?.schemas?.length
                ? [...TOOLS, ...mcp.schemas]
                : TOOLS,
        allowDelegate: MODE === 'agent' || MODE === 'auto',
        approve,
        onEvent,
        callModel: call,
        // thinking mode gets a deeper step budget — hard problems take more
        // tool rounds. Agent mode gets 20 for longer coding sessions, thinking
        // mode gets 32. The finish guard keeps it honest either way.
        maxIter: THINKING ? 32 : (MODE === 'agent' || MODE === 'auto' ? 20 : 8),
        // questioning: the model asks the human instead of guessing — the
        // chain literally parks until the next typed line resolves it
        askUser: askRealUser,
        // honesty gate for long sessions: a checklist item still marked
        // in_progress when the model tries to wrap up → one push back into
        // the loop (twice max per turn, never a nag-loop)
        finishGuard: () => {
          const todos = registry?.todo_write?.state?.todos ?? []
          const open = todos.filter((t) => t && t.status === 'in_progress')
          if (!open.length) return null
          return (
            `checklist: ${open.length} item(s) still in_progress — ` +
            `${open.slice(0, 5).map((t) => String(t.title ?? t.text ?? '(untitled)')).join('; ')}. ` +
            `Finish them (or update the list with todo_write) before wrapping up.`
          )
        },
        hooks: loadHooks(roots),
        signal: ctl.signal
      })
    } finally {
      spinStop() // output takes over from here
      abortCtl = null
    }

    history = result.messages // keep the chain: stateful across turns
    addUsage(result.usage)
    autosave() // every finished (or stopped) chain lands on disk immediately
    updateStatusBar() // refresh the status bar with new token counts

    if (result.status === 'limit') {
      console.log(red(`stopped after ${result.iterations} tool calls (iteration cap)`))
    }
    if (result.status === 'stopped') {
      console.log(dim(`⏹ stopped — ${result.iterations} tool call(s) kept, chain saved`))
    }
    if (result.text) {
      const w = Math.max(24, Math.min(process.stdout.columns || 80, 100) - 4)
      console.log('')
      console.log(assistantBlock(P, renderMd(result.text, w, COLOR === 'none')))
      console.log('')
    } else if (result.status !== 'limit' && result.status !== 'stopped') {
      console.log(assistantBlock(P, dim('(no reply text)')))
    }
    // what the run actually cost — steps, tokens, wall time. One quiet line so
    // a long task's shape is visible without /usage.
    const tok = (result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0)
    const secs = Math.round((Date.now() - turnT0) / 1000)
    console.log(statLine(P, { steps: result.iterations, tokens: tok, secs, thinking: THINKING }))
  } catch (e) {
    if (e?.name === 'AbortError' || ctl.signal.aborted) {
      console.log(dim('⏹ stopped'))
      autosave() // keep whatever the chain already did
      return
    }
    console.log(notice(P, 'error', e?.message ?? String(e)))
    if (String(e?.message ?? '').includes('ECONNREFUSED')) {
      console.log(dim(`is Ollama running? try: ollama serve  (${URL})`))
    }
  }
}

// -- one-shot print mode (claude -p / codex exec shape) -------------------------

async function oneShot(prompt) {
  let registry
  try {
    registry = makeRegistry({ roots })
  } catch (e) {
    console.error(`codezy: ${e.message}`)
    return 1
  }
  // v3.1 MCP: same graft as the REPL turn
  let mcp = null
  try {
    mcp = await getMcp()
  } catch (e) {
    console.error(`codezy: mcp: ${e?.message ?? e}`)
  }
  if (mcp?.total) Object.assign(registry, mcp.entries)
  try {
    const result = await runAgent({
      messages: [
        { role: 'system', content: THINKING ? `${SYSTEM}\n\n${THINKING_MODE}` : SYSTEM },
        ...history,
        { role: 'user', content: prompt }
      ],
      registry,
      tools: mcp?.schemas?.length ? [...TOOLS, ...mcp.schemas] : undefined,
      approve,
      onEvent,
      callModel: call,
      maxIter: THINKING ? 16 : 8,
      // headless: the tool still exists, it just answers instantly instead
      // of parking the chain on a human who isn't there
      askUser: askNoOne,
      hooks: loadHooks(roots)
    })
    if (result.status === 'limit') console.error(`codezy: stopped after ${result.iterations} tool calls (iteration cap)`)
    if (!result.text) {
      console.error('codezy: empty reply from the model')
      return 1
    }
    if (PRINT && FMT === 'json') {
      console.log(
        JSON.stringify({
          status: result.status,
          iterations: result.iterations,
          tool_events: toolEvents,
          reply: result.text
        })
      )
      return 0
    }
    if (PRINT && FMT === 'stream-json') {
      console.log(
        JSON.stringify({ type: 'result', status: result.status, iterations: result.iterations, reply: result.text })
      )
      return 0
    }
    process.stdout.write(result.text.endsWith('\n') ? result.text : `${result.text}\n`)
    return 0
  } catch (e) {
    console.error(`codezy: ${e?.message ?? e}`)
    if (String(e?.message ?? '').includes('ECONNREFUSED')) {
      console.error(`is Ollama running? try: ollama serve  (${URL})`)
    }
    return 1
  }
}

// -- commands + line loop ----------------------------------------------------------------

/** The four accent dots, painted in their own colours, with the live one marked.
 *  Shared by `/theme` and `/settings` so the picker always looks the same. */
function accentSwatches() {
  return Object.entries(ACCENTS)
    .map(([id, def]) => {
      const ap = paintFor(P.theme, P.mode, id)
      const active = id === P.accentName
      return `${active ? P.signal('▸') : ' '}${ap.signal('●')} ${
        active ? P.text(def.label.toLowerCase()) : P.low(def.label.toLowerCase())
      }`
    })
    .join('   ')
}

// -- the modal screens ---------------------------------------------------------
// `/settings`, `/model` and `/mode` are MODALS: they take the terminal over
// on the ALTERNATE screen. The conversation below is never disturbed — scroll
// up and you see the chat, not a stale card — and every frame is a full
// redraw, so nothing is left behind.
//
//   ↑ ↓        move the pointer
//   ← →        change the value of the pointed row
//   enter      swap the value of the pointed row to the next one
//   space      the same
//   esc        close
//
// A picker (/model, /mode) filters as you type — the prompt line under the
// card IS the filter — and enter takes the highlighted entry.

/** The live settings screen. null = closed. */
let settingsMode = null
/** The live picker. null = closed. */
let pickerMode = null

/**
 * The modes, in one place. The picker, the settings row and the docs all read
 * this list, so `/mode` can never disagree with the screen.
 */
const MODE_LIST = [
  { id: 'chat', label: 'chat', note: 'answer only — no tools, no edits' },
  { id: 'agent', label: 'agent', note: 'edit files and run commands' },
  { id: 'plan', label: 'plan', note: 'research only — reads and reports' },
  { id: 'auto', label: 'auto', note: 'agent, gated tools pre-approved' }
]

/**
 * The models the endpoint can serve. Ollama reports size, quantization and
 * family; an OpenAI-compatible provider reports names only. The list is
 * fetched once and cached — the endpoint does not change under us.
 */
let modelChoiceCache = null

async function fetchModelChoices() {
  const items = []
  for (const m of await listOllamaModels(URL)) {
    const note = [fmtSize(m.size), m.quant, m.parameter].filter(Boolean).join(' · ')
    items.push({ id: m.id, label: m.id, note })
  }
  for (const p of settings.providers ?? []) {
    for (const id of await listOpenAIModels(p)) {
      if (items.some((i) => i.id === id)) continue
      items.push({ id, label: id, note: p.name || p.id })
    }
  }
  modelChoiceCache = items
  return items
}

/** The cached list, fetched on first use. */
async function loadModelChoices() {
  if (modelChoiceCache) return modelChoiceCache
  return fetchModelChoices()
}

// -- the menus ------------------------------------------------------------------
// A menu is a full independent screen that opens ON TOP of whatever is
// happening. It lives on the alternate screen, so the conversation underneath
// is never touched — closing the menu puts it back exactly as it was.

/** Wipe readline's line buffer — a menu never inherits a half-typed line. */
function modalClearLine() {
  try {
    rl?.write(null, { ctrl: true, name: 'u' })
  } catch {
    /* the buffer is already empty */
  }
}

/**
 * Run a command with its output captured instead of printed. The menu shows
 * the result on its own status line, so the card is never torn apart by a
 * notice scrolling through it.
 */
async function runQuiet(cmd) {
  const lines = []
  const real = console.log
  console.log = (...a) => lines.push(a.map(String).join(' '))
  try {
    await command(cmd)
  } finally {
    console.log = real
  }
  return lines.filter((l) => l.trim()).join('\n')
}

/** The last line of a command's output — the notice it printed. */
function lastLine(text) {
  return String(text).split('\n').filter((l) => l.trim()).pop() || ''
}

// -- the settings screen -------------------------------------------------------
// ONE list. Every row shows the values it can take, so nothing hides behind a
// menu of its own. The screen never writes a value itself: it runs the very
// same slash command the row advertises, which is why the screen can never
// lie about what a value is.

const SETTINGS_SECTIONS = [
  {
    label: 'appearance',
    rows: [
      {
        key: 'theme',
        label: 'theme',
        options: () => THEME_NAMES.map((t) => ({ id: t, label: t })),
        current: () => P.theme,
        apply: (v) => `/theme ${v}`
      },
      {
        key: 'accent',
        label: 'accent',
        options: () =>
          Object.entries(ACCENTS).map(([id, d]) => ({ id, label: d.label.toLowerCase() })),
        current: () => P.accentName,
        apply: (v) => `/theme ${v}`
      },
      {
        key: 'thinking',
        label: 'thinking',
        options: () => [
          { id: 'on', label: 'on' },
          { id: 'off', label: 'off' }
        ],
        current: () => (THINKING ? 'on' : 'off'),
        apply: (v) => `/thinking ${v}`
      }
    ]
  },
  {
    label: 'model',
    rows: [
      {
        key: 'main',
        label: 'model',
        free: true,
        current: () => MODEL,
        note: () => '· /model lists them',
        apply: (v) => `/model ${v}`
      },
      {
        key: 'fast',
        label: 'fast model',
        free: true,
        current: () => FAST,
        note: () => '· /model fast',
        apply: (v) => `/model fast ${v}`
      }
    ]
  },
  {
    label: 'session',
    rows: [
      {
        key: 'mode',
        label: 'mode',
        options: () => MODE_LIST.map((m) => ({ id: m.id, label: m.id })),
        current: () => MODE,
        apply: (v) => `/mode ${v}`
      },
      {
        key: 'approvals',
        label: 'approvals',
        options: () => [
          { id: 'ask', label: 'ask' },
          { id: 'auto', label: 'auto' }
        ],
        current: () => (auto ? 'auto' : 'ask'),
        apply: (v) => `/auto ${v === 'auto' ? 'on' : 'off'}`
      }
    ]
  },
  {
    label: 'workspace',
    rows: [
      {
        key: 'root',
        label: 'root',
        free: true,
        current: () => roots[0] || '',
        apply: (v) => `/root ${v}`
      }
    ]
  }
]

/** Every row, flattened — the order the numbers follow. */
const SETTINGS_ROWS = SETTINGS_SECTIONS.flatMap((s) => s.rows)

/** The name a row shows on screen — `model`, not the internal key. */
function settingsLabel(key) {
  return SETTINGS_ROWS.find((r) => r.key === key)?.label ?? key
}

/** The data behind the settings panel — one builder for the screen and the
 *  preview so the two can never drift. */
function settingsData() {
  const short = (p) => (p.startsWith(os.homedir()) ? `~${p.slice(os.homedir().length)}` : p)
  return {
    version: getVersion(),
    theme: P.theme,
    otherTheme: THEME_NAMES.filter((t) => t !== P.theme).join(' | '),
    accent: ACCENTS[P.accentName].label.toLowerCase(),
    accentRow: accentSwatches(),
    thinking: THINKING,
    model: MODEL,
    fast: FAST,
    provider: PROVIDER ? PROVIDER.name || PROVIDER.id : 'ollama',
    url: URL,
    mode: MODE,
    auto,
    ctx: CTX.toLocaleString('en-US'),
    tools: TOOLS.length + (mcpCache?.total || 0),
    workspace: roots.map(short).join(' · '),
    settingsFile: short(path.join(settings.dataDir || HOME, 'settings.json'))
  }
}

/** Draw the settings screen. `editable` turns the rows into a menu. */
function printSettings(editable = SETTINGS_ROWS.map((r) => r.key)) {
  console.log(
    settingsPanel(P, settingsData(), {
      editable,
      interactive: editable.length > 0
    })
  )
}

/** The prompt while the settings screen is open — it says where you are. */
const settingsPrompt = () => `${P.mid('settings')} ${P.signal('❯')} `

/** The prompt while a picker is open — the line you type is the filter. */
const pickerPrompt = () => `${P.mid(pickerMode?.title ?? 'pick')} ${P.signal('❯')} `

/** Put the prompt back in sync with whatever screen is open. */
function refreshPrompt() {
  if (!rl) return
  if (pickerMode) rl.setPrompt(pickerPrompt())
  else if (settingsMode) rl.setPrompt(settingsMode.input ? `${P.mid(settingsLabel(settingsMode.input))} ` : settingsPrompt())
  else rl.setPrompt(promptText())
}

/** The live value of a row, as the screen shows it. */
function settingsValue(row) {
  if (settingsMode?.input === row.key) return rl?.line ?? ''
  switch (row.key) {
    case 'theme':
      return P.theme
    case 'accent':
      return ACCENTS[P.accentName].label.toLowerCase()
    case 'thinking':
      return THINKING ? 'on' : 'off'
    case 'main':
      return MODEL
    case 'fast':
      return FAST || '—'
    case 'mode':
      return MODE
    case 'approvals':
      return auto ? 'auto' : 'ask'
    case 'root':
      return roots[0] || '—'
    default:
      return ''
  }
}

/** The card of the settings screen. */
function settingsCard() {
  const st = settingsMode
  const items = []
  for (const section of SETTINGS_SECTIONS) {
    items.push({ kind: 'section', label: section.label })
    for (const row of section.rows) {
      const opts = row.options ? row.options() : null
      items.push({
        kind: 'row',
        label: row.label,
        value: settingsValue(row),
        chips: opts
          ? opts.map((o) => ({ label: o.label, current: o.id === row.current() }))
          : null,
        note: row.note ? row.note() : '',
        selected: st.row === row.key
      })
    }
  }
  const card = settingsScreen(P, {
    title: 'settings',
    items,
    status: st.status,
    // the card is sized to the terminal — a narrow one gets a narrow card
    width: Math.min(screen.width, 74),
    term: screen.width,
    footer: st.input
      ? `type the new ${settingsLabel(st.input)} · enter applies · esc cancels`
      : '↑ ↓ row · ← → change · enter swaps to the next · esc closes'
  })
  // a row that is waiting for a value shows what you type, on its own line
  if (st.input) {
    const rows = card.split('\n')
    rows.push('', `  ${P.signal('❯')} ${P.text(rl?.line ?? '')}`)
    return rows.join('\n')
  }
  return card
}

/** Repaint the settings screen. */
function paintSettings() {
  if (!settingsMode) return
  refreshPrompt()
  screen.openOverlay({ rows: () => settingsCard().split('\n') })
}

/**
 * Open the settings screen. On a real terminal it is a live GUI; in a pipe it
 * stays the map it always was, because a script's next line is data, not a
 * menu answer. CODEZY_TTY=1 forces the live path (the same escape hatch the
 * chat shell uses) so the screen can be driven by a test.
 */
function openSettings() {
  if (!rl || !interactive()) {
    printSettings([])
    return
  }
  settingsMode = { row: SETTINGS_ROWS[0].key, input: null, status: '' }
  // the menu takes the terminal FIRST: clearing the line repaints the prompt,
  // and that repaint must land on the menu, not on the transcript
  modalClearLine()
  paintSettings()
}

/** Leave the settings screen and give the normal prompt back. */
function closeSettings(note = '') {
  settingsMode = null
  // anything typed on the screen must not leak into the next prompt
  modalClearLine()
  screen.closeOverlay()
  refreshPrompt()
  if (note) screen.notice(dim(note))
}
/**
 * Apply a value to a row through the very same slash command the row
 * advertises. The command's own notice becomes the screen's status line.
 */
async function applySetting(row, value) {
  const out = await runQuiet(row.apply(value))
  const line = out.split('\n').filter(Boolean).pop() || ''
  if (settingsMode) settingsMode.status = stripAnsi(line)
}

/** The options of the pointed row, and where the live value sits in them. */
function pointedOptions() {
  const row = SETTINGS_ROWS.find((r) => r.key === settingsMode?.row)
  if (!row?.options) return { row: null, list: [], at: -1 }
  const list = row.options()
  return { row, list, at: list.findIndex((o) => o.id === row.current()) }
}

/** Move the pointer to the next (or previous) value of the pointed row. */
async function stepSetting(dir) {
  const { row, list, at } = pointedOptions()
  if (!row || !list.length) return
  const next = list[(at + dir + list.length) % list.length]
  await applySetting(row, next.id)
  paintSettings()
}

/** Open the free-text row of the pointed setting — the value is typed on the
 *  prompt line under the card. */
function startInput(row) {
  settingsMode.input = row.key
  settingsMode.status = ''
  paintSettings()
}

/**
 * A keypress on the settings screen: ↑ ↓ walk the rows, ← → change the
 * value, space swaps to the next one, esc closes.
 */
function settingsKey(key) {
  const st = settingsMode
  if (!st) return
  const name = key?.name
  if (!name) return

  // while a value is being typed the keyboard belongs to readline
  if (st.input) {
    if (name === 'escape') {
      st.input = null
      modalClearLine()
      paintSettings()
    }
    return
  }

  if (name === 'up' || name === 'down') {
    const dir = name === 'up' ? -1 : 1
    const n = SETTINGS_ROWS.length
    const at = Math.max(0, SETTINGS_ROWS.findIndex((r) => r.key === st.row))
    st.row = SETTINGS_ROWS[(at + dir + n) % n].key
    st.status = ''
    // the arrows may have pulled a past command into the line — drop it
    modalClearLine()
    paintSettings()
    return
  }

  if (name === 'left' || name === 'right') {
    void stepSetting(name === 'left' ? -1 : 1)
    modalClearLine()
    return
  }

  if (name === 'space') {
    // space swaps the value right here — no menu, no second screen
    void stepSetting(1)
    modalClearLine()
    return
  }

  if (name === 'escape') {
    closeSettings('settings closed')
    return
  }
}

/**
 * One typed line of the settings screen. A number picks that value of the
 * pointed row — or, when the row has no list of values, jumps to that row.
 * An empty line is Enter: it swaps the pointed row's value.
 */
async function settingsInput(line) {
  const st = settingsMode
  if (!st) return true
  const t = line.trim()

  if (st.input) {
    const row = SETTINGS_ROWS.find((r) => r.key === st.input)
    st.input = null
    // "q" cancels the row — it must never become the value
    if (t === 'q' || t === 'quit') st.status = 'cancelled'
    else if (t) await applySetting(row, t)
    else st.status = 'unchanged'
    paintSettings()
    return true
  }

  if (t === 'q' || t === 'quit' || t === 'exit') {
    closeSettings('settings closed')
    return true
  }

  const n = Number.parseInt(t, 10)
  if (Number.isInteger(n) && n >= 1) {
    const { list } = pointedOptions()
    if (n <= list.length) {
      // a number picks that value of the pointed row
      const row = SETTINGS_ROWS.find((r) => r.key === st.row)
      await applySetting(row, list[n - 1].id)
    } else if (n <= SETTINGS_ROWS.length) {
      // the row has no list of values — the number jumps to that row
      st.row = SETTINGS_ROWS[n - 1].key
      st.status = ''
    }
    paintSettings()
    return true
  }

  // enter on the pointed row: a free row asks for its value, the rest swap
  const row = SETTINGS_ROWS.find((r) => r.key === st.row)
  if (row?.free) {
    startInput(row)
    return true
  }
  await stepSetting(1)
  return true
}

// -- the picker (/model, /mode) -----------------------------------------------
// One screen, one list. The prompt line under it is the live filter: type to
// narrow, ↑ ↓ to walk, enter or space to take, esc to close.

/** The options that survive the current filter. */
function pickerVisible() {
  const st = pickerMode
  if (!st) return []
  const q = (st.filter ?? '').trim().toLowerCase()
  if (!q) return st.options
  return st.options.filter((o) => o.label.toLowerCase().includes(q))
}

/** The option the pointer is on. */
function pickerCurrent() {
  const st = pickerMode
  if (!st) return null
  return st.options.find((o) => o.id === st.selId) ?? null
}

/** The card of the picker. */
function pickerCard() {
  const st = pickerMode
  const shown = pickerVisible()
  const current = pickerCurrent()
  const sel = current ? shown.findIndex((o) => o.id === current.id) : -1
  return pickerList(P, {
    title: st.title,
    subtitle: st.subtitle,
    options: shown.map((o) => ({ label: o.label, note: o.note, current: o.current })),
    sel,
    // the card is sized to the terminal — a narrow one gets a narrow card
    width: Math.min(screen.width, 74),
    term: screen.width,
    empty: st.filter ? `nothing matches “${st.filter}”` : 'nothing to pick here',
    footer: '↑ ↓ move · enter or space picks · type to filter · esc closes'
  })
}

/** Repaint the picker. */
function paintPicker() {
  if (!pickerMode) return
  refreshPrompt()
  // the filter is the line under the card — what you type
  const card = pickerCard().split('\n')
  card.push('', `  ${P.signal('❯')} ${P.text(pickerMode.filter || '')}`)
  screen.openOverlay({ rows: () => card })
}

/** Open a picker. `apply` runs the same slash command the user could type. */
function openPicker({ title, subtitle, options, apply }) {
  const cur = options.find((o) => o.current)
  pickerMode = {
    title,
    subtitle,
    options,
    selId: cur?.id ?? options[0]?.id ?? null,
    filter: '',
    apply,
    savedHistory: rl ? rl.history : null
  }
  // an arrow key must not drag a past command into the filter
  if (rl) rl.history = []
  // the menu takes the terminal FIRST: clearing the line repaints the prompt,
  // and that repaint must land on the menu, not on the transcript
  modalClearLine()
  paintPicker()
}

/** Close the picker and give the normal prompt back. */
function closePicker() {
  const saved = pickerMode?.savedHistory
  pickerMode = null
  if (rl && saved) rl.history = saved
  // the filter was a typed line — it must not leak into the next prompt
  modalClearLine()
  screen.closeOverlay()
  refreshPrompt()
}

/** A keypress on the picker: ↑ ↓ walk the list, space picks, esc closes. */
function pickerKey(key) {
  const st = pickerMode
  if (!st) return
  const name = key?.name
  if (!name) return

  if (name === 'up' || name === 'down') {
    const dir = name === 'up' ? -1 : 1
    const shown = pickerVisible()
    if (shown.length) {
      const ids = shown.map((o) => o.id)
      const cur = Math.max(0, ids.indexOf(st.selId))
      const next = (cur + dir + ids.length) % ids.length
      st.selId = ids[next]
    }
    paintPicker()
    return
  }

  if (name === 'space') {
    void pickerPick()
    return
  }

  if (name === 'escape') {
    closePicker()
    return
  }

  if (name === 'return' || name === 'enter') return // readline's line event has it

  // anything else is typing: the line readline holds IS the filter
  st.filter = rl?.line ?? ''
  paintPicker()
}

/** Apply the highlighted option — or the typed text when nothing matched. */
async function pickerPick(raw = '') {
  const st = pickerMode
  if (!st) return
  const picked = pickerCurrent()
  const apply = st.apply
  closePicker()
  const out = await runQuiet(apply(picked ? picked.id : (raw || st.filter || '').trim()))
  const notice = lastLine(out)
  if (notice) console.log(notice)
}

/** The typed line of a picker is Enter: take what is highlighted. */
async function pickerInput(line) {
  await pickerPick(line)
}

/**
 * `/model` with no id: the good list. Every model the endpoint can serve,
 * with its size and quantization, the live one marked. Picking one applies
 * it through the very same `/model` command the user could have typed.
 *
 * In a pipe there is nobody to walk a list, so the list is printed instead.
 */
async function openModelPicker(slot = 'main') {
  const isFast = slot === 'fast'
  const current = isFast ? FAST : MODEL
  const list = await loadModelChoices()
  const options = list.map((m) => ({ ...m, current: m.id === current }))
  // the model in use is always on the list, even if the endpoint forgot it
  if (current && !options.some((o) => o.id === current)) {
    options.unshift({ id: current, label: current, note: 'in use', current: true })
  }
  const where = isFast ? 'fast model' : 'model'
  const subtitle = `${where} · ${PROVIDER ? PROVIDER.name || PROVIDER.id : 'ollama'} at ${URL} · ctx ${CTX.toLocaleString('en-US')}`

  if (!rl || !interactive()) {
    // a pipe gets the list as plain text — no ANSI, no pointer
    console.log(dim(subtitle))
    if (!options.length) {
      console.log(dim('no models found — is the endpoint running? /model <id> still sets one'))
      return
    }
    const width = Math.max(...options.map((o) => o.label.length))
    for (const o of options) {
      const pad = o.label.padEnd(width)
      console.log(`  ${pad}${o.note ? dim('  ' + o.note) : ''}`)
    }
    return
  }

  openPicker({
    title: where,
    subtitle,
    options,
    apply: (id) => (isFast ? `/model fast ${id}` : `/model ${id}`)
  })
}

/**
 * `/mode` with no argument: the good list of modes, each with what it
 * actually lets the agent do. Picking one applies it through `/mode`.
 */
function openModePicker() {
  const options = MODE_LIST.map((m) => ({ ...m, current: m.id === MODE }))
  const subtitle = `mode · how the agent is allowed to work · ${MODE} is live`

  if (!rl || !interactive()) {
    console.log(dim(subtitle))
    const width = Math.max(...options.map((o) => o.label.length))
    for (const o of options) {
      const pad = o.label.padEnd(width)
      console.log(`  ${pad}${o.note ? dim('  ' + o.note) : ''}`)
    }
    return
  }

  openPicker({
    title: 'mode',
    subtitle,
    options,
    apply: (id) => `/mode ${id}`
  })
}
async function command(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/)
  const arg = rest.join(' ')
  switch (cmd) {
    case '/exit':
    case '/quit':
      closeSettings()
      finish()
      return true
    case '/clear':
      history = []
      console.log(dim('history cleared'))
      return true
    case '/root':
      if (arg) {
        const r = path.resolve(arg)
        if (fs.existsSync(r)) {
          roots = [r]
          console.log(dim(`workspace → ${r}`))
        } else console.log(red(`no such folder: ${r}`))
      } else console.log(dim(`workspace: ${roots.join(', ')}`))
      return true
    case '/search': {
      if (!arg) {
        console.log(dim('usage: /search <query>'))
        return true
      }
      try {
        // the full web path: search, read the pages behind the hits, dig
        // out the line that holds the answer
        const ctx = await buildWebContext(arg, { pages: 2 })
        const hits = ctx?.hits ?? (await webSearch(arg))
        if (!hits.length) {
          console.log(dim(`no results for "${arg}"`))
        } else {
          if (ctx?.keys?.length) {
            console.log('')
            console.log(rule(P, 'likely answer', process.stdout.columns || 80))
            for (const k of ctx.keys) {
              console.log(`  ${k.token ? bold(k.token) + '  ' : ''}${dim(k.line)}`)
            }
          }
          console.log('')
          hits.forEach((h, i) => {
            console.log(`${i + 1}. ${bold(h.title)}\n   ${cyan(h.url)}${h.snippet ? `\n   ${dim(h.snippet)}` : ''}`)
          })
          console.log('')
        }
      } catch (e) {
        console.log(red(`search failed: ${e?.message ?? e}`))
      }
      return true
    }
    case '/todos': {
      const todos = getRegistry().todo_write?.state?.todos ?? []
      if (!todos.length) {
        console.log(dim('no todos yet — the agent keeps its checklist with todo_write'))
      } else {
        const done = todos.filter((t) => t.status === 'done').length
        console.log(dim(`todos · ${done}/${todos.length} done`))
        for (const t of todos) {
          const mark = t.status === 'done' ? green('✓') : t.status === 'in_progress' ? cyan('›') : dim('·')
          console.log(`  ${mark} ${t.text}`)
        }
      }
      return true
    }
    case '/compact':
      await compactHistory(true)
      return true
    case '/diff':
      showLastDiff()
      return true
    case '/undo':
      undoLastChange()
      return true
    case '/resume': {
      const saves = listAgentSaves()
      if (!arg) {
        if (!saves.length) {
          console.log(dim(`no saved agent sessions in ${AGENT_DIR}`))
        } else {
          console.log(dim('agent sessions · newest first · /resume <n> restores'))
          saves.slice(0, 8).forEach((s, i) => {
            const d = new Date(s.savedAt ?? 0)
            const when =
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
              `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
            console.log(`  ${bold(String(i + 1))} ${s.title ?? 'untitled'} ${dim(`· ${(s.history ?? []).length} msgs · ${when} · ${s.id}`)}`)
          })
        }
        return true
      }
      const pick = arg.trim()
      const s = saves.find((x) => x.id === pick) ?? (/^\d+$/.test(pick) ? saves[Number(pick) - 1] : null)
      if (!s) {
        console.log(red(`no saved session matching "${pick}"`))
        return true
      }
      resumeSave(s)
      console.log(dim(`resumed "${saveTitle}" — ${history.length} messages · workspace ${roots.join(', ')}`))
      return true
    }
    case '/usage':
      console.log(
        dim(
          `usage · ${sessionUsage.promptTokens} prompt + ${sessionUsage.completionTokens} completion tokens · ` +
            `${sessionUsage.calls} model call(s) · ctx ${CTX}${auto ? ' · auto-approve on' : ''}`
        )
      )
      return true
    case '/mcp': {
      const all = (settings.mcpServers ?? []).filter((s) => s && s.name && s.command)
      if (!all.length) {
        console.log(dim('no MCP servers configured — add them in the desktop app: Settings ▸ MCP servers'))
        return true
      }
      console.log(dim('mcp servers:'))
      let connected = 0
      let live = 0
      for (const s of all) {
        if (s.enabled === false) {
          console.log(`  ${dim('○')} ${bold(s.name)} ${dim('disabled')}`)
          continue
        }
        live++
        try {
          const conn = await mcpGetSession(s.name, s)
          connected++
          const line = [s.command, ...(s.args ?? [])].join(' ')
          console.log(
            `  ${green('●')} ${bold(s.name)} ${dim(`${line} — ${conn.tools.length} tool${conn.tools.length === 1 ? '' : 's'}`)}`
          )
          if (conn.tools.length) console.log(dim(`      ${conn.tools.map((t) => t.name).join(', ')}`))
        } catch (e) {
          console.log(`  ${red('●')} ${bold(s.name)} ${red(String(e?.message ?? e))}`)
        }
      }
      console.log(dim(`${connected}/${live} enabled server(s) connected`))
      return true
    }
    case '/scout': {
      if (!arg) {
        console.log(dim('usage: /scout <question> — a read-only research run (fresh context, fast model when set)'))
        return true
      }
      // read-only research run: fresh context so a broad question never
      // bloats the main chain; the registry is filtered to read-only tools
      // (writes/commands are structurally impossible), and the fast model
      // does the digging when one is set. The digest is filed into history.
      const RO = new Set(['list_dir', 'read_file', 'grep_search', 'glob', 'web_search', 'web_fetch'])
      let subReg
      try {
        subReg = Object.fromEntries(Object.entries(getRegistry()).filter(([k]) => RO_TOOLS.has(k)))
      } catch (e) {
        console.log(red(`error: ${e.message}`))
        return true
      }
      const subTools = TOOLS.filter((t) => RO_TOOLS.has(t.function.name))
      const ctl = new AbortController()
      abortCtl = ctl
      spinStart('scouting')
      let res
      try {
        res = await runAgent({
          messages: [
            {
              role: 'system',
              content:
                'You are a READ-ONLY research scout for a coding workspace. Gather facts with your tools ' +
                '(list, read, grep, glob, web) and return a compact digest: the files that matter, the key ' +
                'code with paths and line numbers, and the answer to the question. No advice, no writes — ' +
                'only what you found.'
            },
            { role: 'user', content: arg }
          ],
          registry: subReg,
          tools: subTools.length ? subTools : undefined,
          callModel: (p) => call({ ...p, model: FAST || undefined }),
          maxIter: 5,
          retries: 1,
          allowDelegate: false,
          onEvent,
          signal: ctl.signal
        })
      } finally {
        spinStop()
        abortCtl = null
      }
      addUsage(res.usage)
      const digest = res.text || `(scout ${res.status} — no digest)`
      history.push(
        { role: 'user', content: `[scout report: ${arg}]\n${digest}` },
        { role: 'assistant', content: 'Understood — using the scout report above when it helps.' }
      )
      autosave()
      console.log(`\n${renderMd(digest, process.stdout.columns || 80, COLOR === 'none')}\n`)
      console.log(dim(`scout done (${res.status}, ${res.iterations} tool calls) · report filed into context`))
      return true
    }
    case '/model': {
      const parts = (arg || '').trim().split(/\s+/).filter(Boolean)
      // /model fast [id|off] — the cheap-work model (compaction + /scout)
      if (parts[0] === 'fast') {
        if (!parts[1]) {
          // no id → show inline info about fast model
          console.log('')
          console.log(`${P.signal('▎')} ${P.bold('model info')}`)
          console.log(`  main  ${P.text(MODEL)}  ${dim(capabilityLabel())}`)
          if (FAST) console.log(`  fast  ${P.text(FAST)}  ${dim('(compaction + /scout)')}`)
          else console.log(`  fast  ${dim('off — everything runs on the main model')}`)
          console.log(`  provider  ${dim(PROVIDER ? (PROVIDER.name || PROVIDER.id) : 'ollama')}`)
          console.log(`  endpoint  ${dim(URL)}`)
          console.log(`  context   ${dim(CTX.toLocaleString('en-US'))}`)
          console.log('')
          console.log(dim('  /model <name>        switch main model'))
          console.log(dim('  /model fast <name>   set fast model'))
          console.log(dim('  /model list          show available models'))
          return true
        }
        if (parts[1] === 'off' || parts[1] === 'clear') {
          FAST = ''
          console.log(dim('fast model off — everything runs on the main model'))
          return true
        }
        FAST = parts[1]
        console.log(dim(`fast model → ${FAST} (compaction + /scout; session only — set fastModel in settings to persist)`))
        return true
      }
      if (!arg) {
        // no id → the good list: every model the endpoint can serve, the live
        // one marked, filterable with ↑ ↓ and enter — the same list /mode opens
        await openModelPicker('main')
        return true
      }
      if (parts[0] === 'list') {
        // /model list → show available models inline
        const list = await loadModelChoices()
        if (!list.length) {
          console.log(dim('no models found — is the endpoint running? /model <id> still sets one'))
          return true
        }
        console.log('')
        console.log(`${P.signal('▎')} ${P.bold('available models')}`)
        for (const m of list) {
          const mark = m.id === MODEL ? P.signal('▸') : m.id === FAST ? P.signal('·') : ' '
          const tag = m.id === MODEL ? P.low('  main') : m.id === FAST ? P.low('  fast') : ''
          console.log(`  ${mark} ${P.text(m.id)}${m.note ? ' ' + dim(m.note) : ''}${tag}`)
        }
        console.log('')
        return true
      }
      MODEL = parts[0]
      CAPS = PROVIDER ? null : await modelCapabilities(URL, MODEL)
      console.log(
        dim(
          `model → ${MODEL} · ${capabilityLabel()} (this session only — set activeModel in settings to persist)`
        )
      )
      return true
    }
    case '/thinking': {
      const a = (arg || '').trim().toLowerCase()
      if (a === 'on' || a === 'off') {
        THINKING = a === 'on'
        // thinkingMode is the field the desktop app's Thinking button writes —
        // the CLI already reads it on boot, so it writes it too
        persistSettings({ thinkingMode: THINKING })
        console.log(
          dim(`thinking ${a} — ${a === 'on' ? 'reason-first replies, double the step budget' : 'normal speed'} (saved as thinkingMode)`)
        )
        refreshPrompt() // the prompt carries the mode
        return true
      }
      if (a) {
        console.log(dim('usage: /thinking [on|off]'))
        return true
      }
      console.log(
        dim(
          `thinking ${THINKING ? 'on — reason-first replies, double the step budget' : 'off — normal speed'} · /thinking on|off (persist: thinkingMode in settings)`
        )
      )
      return true
    }
    case '/tools': {
      console.log(dim(`tools · ${TOOLS.length} built in · gated: ${[...DANGEROUS_TOOLS].join(', ')}`))
      console.log(dim(' + ask_user — merged into every run: the model can pause mid-task to ask you one question'))
      for (const t of TOOLS) {
        const name = t.function.name
        const first = String(t.function.description ?? '').split('.')[0]
        console.log(`  ${DANGEROUS_TOOLS.has(name) ? yellow('⚠') : green('·')} ${bold(name)} ${dim(first)}`)
      }
      const mcpNames = mcpCache?.total ? Object.keys(mcpCache.entries ?? {}) : []
      if (mcpNames.length) {
        console.log(dim(`mcp · ${mcpNames.length} more from connected servers`))
        for (const n of mcpNames) console.log(`  ${green('·')} ${bold(n)}`)
      } else {
        console.log(dim('mcp · none connected — see /mcp'))
      }
      return true
    }
    case '/auto':
      if (arg === 'on' || arg === 'off') auto = arg === 'on'
      else if (arg) {
        console.log(dim('usage: /auto [on|off]'))
        return true
      }
      console.log(
        `auto-approve ${auto ? green('on') : dim('off')}${auto ? yellow(' — gated tools run without asking') : ''}`
      )
      return true
    case '/export': {
      const file = path.resolve(arg || `codezy-session-${new Date().toISOString().replace(/[:.]/g, '-')}.md`)
      try {
        const out = [
          '# CODEZY session',
          `date: ${new Date().toISOString()}`,
          `model: ${MODEL} · workspace: ${roots.join(', ')}`,
          ''
        ]
        for (const m of history) {
          const text = typeof m.content === 'string' ? m.content.trim() : ''
          if (!text || m.role === 'tool' || m.role === 'system') continue
          if (m.role === 'user') out.push('## You', '', text, '')
          else if (m.role === 'assistant') out.push('## CODEZY', '', text, '')
        }
        fs.writeFileSync(file, out.join('\n'))
        console.log(dim(`exported ${history.length} message(s) → ${file}`))
      } catch (e) {
        console.log(red(`export failed: ${e?.message ?? e}`))
      }
      return true
    }
    case '/mode': {
      const next = (arg || '').trim().toLowerCase()
      if (!next) {
        // no mode → the good list: every mode with what it lets the agent do
        openModePicker()
        return true
      }
      if (!['chat', 'agent', 'plan', 'auto'].includes(next)) {
        console.log(`${yellow('usage')} /mode <chat|agent|plan|auto>`)
        return true
      }
      MODE = next
      auto = MODE === 'auto'
      refreshPrompt()
      console.log(notice(P, 'ok', `mode ${MODE}${auto ? ' · auto-approve' : ''}`))
      return true
    }
    case '/theme': {
      const parts = (arg || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
      const names = THEME_NAMES.join(' · ')
      // User-facing labels are friendlier than ids: accept both `blue` and
      // `cobalt` (the desktop swatch name) everywhere an accent is typed.
      const accentFor = (value) =>
        Object.keys(ACCENTS).find(
          (id) => id === value || ACCENTS[id].label.toLowerCase() === value
        ) || null
      if (!parts.length) {
        console.log(
          `${P.signal('▎')} ${bold('appearance')}  ${P.text(P.theme)} ${dim('·')} ${mid(
            `${ACCENTS[P.accentName].label.toLowerCase()} accent`
          )}`
        )
        console.log(`  ${dim('themes'.padEnd(9))}${dim(names)}`)
        console.log(`  ${dim('accents'.padEnd(9))}${accentSwatches()}`)
        console.log(`  ${dim('usage'.padEnd(9))}${dim('/theme [theme] [accent] · /settings changes them live')}`)
        return true
      }
      let nextTheme = P.theme
      let nextAccent = P.accentName
      const [first, second] = parts
      const firstAccent = accentFor(first)
      if (firstAccent) nextAccent = firstAccent
      else if (THEME_NAMES.includes(first) || TOKENS.legacyThemes[first]) nextTheme = resolveTheme(first)
      else {
        console.log(`${yellow('usage')} /theme [${THEME_NAMES.join('|')}] [${Object.keys(ACCENTS).join('|')}]`)
        return true
      }
      if (second) {
        const secondAccent = accentFor(second)
        if (secondAccent) nextAccent = secondAccent
        else if (THEME_NAMES.includes(second) || TOKENS.legacyThemes[second]) nextTheme = resolveTheme(second)
      }
      P = paintFor(nextTheme, COLOR, nextAccent)
      setMdPalette(P)
      persistSettings({ theme: nextTheme, accent: TOKENS.accents[nextAccent].dark })
      refreshPrompt()
      console.log(notice(P, 'ok', `theme ${nextTheme} · ${ACCENTS[nextAccent].label.toLowerCase()}`))
      return true
    }
    case '/settings': {
      // the live screen: the panel numbers what it can change, and the number
      // you type is the row that changes
      openSettings()
      return true
    }
    case '/help': {
      const groups = [
        [
          'session',
          [
            ['/help', 'this screen'],
            ['/clear', 'forget the conversation chain'],
            ['/resume [n]', 'list or restore saved agent sessions'],
            ['/export [f]', 'save the conversation to markdown'],
            ['/exit', 'quit']
          ]
        ],
        [
          'model & mode',
          [
            ['/model [id]', 'show or switch the model'],
            ['/model fast <id>', 'cheap model for summaries and /scout'],
            ['/mode <m>', 'chat · agent · plan · auto'],
            ['/thinking [on|off]', 'long mode: reason-first replies'],
            ['/auto [on|off]', 'auto-approve gated tools'],
            ['/theme [t] [a]', 'graphite · paper · contrast + accents'],
            ['/settings', 'change any setting, live']
          ]
        ],
        [
          'workspace',
          [
            ['/root [dir]', 'show or set the workspace root'],
            ['/todos', 'the current checklist'],
            ['/diff', 'newest approved change vs the disk'],
            ['/undo', 'put the newest change back'],
            ['/tools', 'every tool the agent can call'],
            ['/mcp', 'MCP servers and their tools']
          ]
        ],
        [
          'research & context',
          [
            ['/search <q>', 'web search — no model needed'],
            ['/scout <q>', 'read-only research run filed into context'],
            ['/compact', 'summarize older messages'],
            ['/usage', 'tokens used in this session']
          ]
        ],
        [
          'keys',
          [
            ['TAB', 'complete commands'],
            ['↑ / ↓', 'walk history'],
            ['Esc', 'stop a running turn'],
            ['Ctrl+C', 'stop, then quit']
          ]
        ]
      ]
      const all = groups.flatMap(([, rows]) => rows)
      const w = Math.min(30, Math.max(...all.map(([c]) => c.length)) + 2)
      const short = (p) => (p.startsWith(os.homedir()) ? `~${p.slice(os.homedir().length)}` : p)
      const helpRows = [{ blank: true }]
      for (const [title, cmds] of groups) {
        helpRows.push(section(P, title))
        for (const [c, d] of cmds) {
          helpRows.push(`  ${P.signal(c)}${' '.repeat(Math.max(0, w - c.length))} ${P.low(d)}`)
        }
        helpRows.push({ blank: true })
      }
      helpRows.push(
        `${P.signal(MODE)} ${P.low('·')} ${P.mid(MODEL)}${FAST ? P.low(` · fast ${FAST}`) : ''} ${P.low(
          '·'
        )} ${P.low(URL)}`
      )
      helpRows.push(`${P.low('root')}  ${P.mid(roots.map(short).join(' · '))}`)
      console.log(panel(P, 'commands', helpRows, { maxWidth: 86 }))
      return true
    }
    default:
      return false
  }
}

let busy = false
let closed = false
const queue = []
/** Messages queued while the agent is busy — shown to the user so they know
 *  their follow-ups are waiting. Cleared when drain() picks them up. */
const queuedMessages = []

function finish() {
  mcpDisconnectAll() // server children must never outlive the TUI
  try {
    rl.close()
  } catch {
    /* already closed */
  }
  process.exit(0)
}

async function drain() {
  if (busy) return
  busy = true
  // clear the queued display — drain is about to process them
  queuedMessages.length = 0
  while (queue.length) {
    const line = queue.shift()
    if (!line.trim()) continue
    await turn(line)
    if (closed) break
  }
  busy = false
  if (closed) return finish()
  // the prompt comes BACK once the output has landed — never above it
  if (rl && process.stdin.isTTY) screen.render()
}

let cmdChain = Promise.resolve() // commands run serially even when async (/search)

// REPL wiring — print mode never attaches (its stdin carries the prompt)
const wire = !PRINT && rl ? rl : null

// The `/` palette rides one line below the prompt. readline has already
// updated rl.line by the time this listener runs, so the list always matches
// what is on screen.
if (wire) {
  // A mouse sequence arrives as a burst of keypresses — the first one carries
  // the `ESC [ <` prefix, the rest are the raw digits. They must never be
  // drawn in the prompt, so the burst is swallowed here and cleaned out of
  // the line by the raw reader below.
  let mouseBurst = false
  process.stdin.on('keypress', (str, key) => {
    if (closed) return
    // the start of an SGR mouse report
    if (key?.sequence === '\x1b[<') {
      mouseBurst = true
      return
    }
    // the rest of the burst — swallowed, and the line is cleaned below
    if (mouseBurst) {
      if (str === 'M' || str === 'm') mouseBurst = false
      return
    }
    // the settings screen is a GUI: ↑ ↓ walk it, enter/space pick it, esc
    // goes back. It swallows the key so readline never sees an arrow.
    if (settingsMode) return settingsKey(key)
    // the picker (/model, /mode) is the same idea: ↑ ↓ walk the list, type
    // to filter, enter or space picks, esc closes
    if (pickerMode) return pickerKey(key)
    // the `/` palette is a list too: ↑ ↓ move the pointer through it and
    // Enter runs the command under it. The arrow belongs to the LIST, not to
    // the input's history.
    if (key?.name === 'up' || key?.name === 'down') {
      if (paletteN && paletteMove(key.name === 'up' ? -1 : 1)) return
    }
    // every keystroke repaints the box — the text lives inside it
    screen.render()
    if (key?.name === 'return' || key?.name === 'enter') return
    if (busy || pendingAsk || awaitingApproval) return paletteClear()
    paletteDraw(paletteRows(rl.line))
  })
}

// The terminal changed size. The frame is laid out again from scratch, and
// the `/` list is drawn again too — it is sized to the width as well.
//
// This lives outside the REPL wiring: the screen is live whenever the app
// owns the terminal, and a resize must be answered whenever it happens.
const onResize = () => {
  screen.resize()
  if (paletteN) paletteDraw(paletteRows(rl.line))
}
process.stdout.on('resize', onResize)
// the stdout 'resize' event only fires on a real terminal — the signal is
// the other path in, and some terminals send only one of the two
process.on('SIGWINCH', onResize)

// The terminal reporting its size — CSI 8 ; rows ; cols t — and the mouse
// wheel. readline splits an escape sequence into single keypresses, so both
// are read from the raw stream instead.
if (wire) {
  let pending = ''
  process.stdin.on('data', (chunk) => {
    pending += chunk.toString()
    // only the tail can hold a whole report
    if (pending.length > 64) pending = pending.slice(-64)

    // Every mouse report — the wheel AND the clicks. SGR: ESC [ < b ; x ; y M
    // (or `m` for the release).
    const reports = [...pending.matchAll(/\x1b\[<\d+;\d+;\d+[Mm]/g)]
    if (reports.length) {
      pending = pending.replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, '')
      // readline took the digits of the report as typed text — take them back
      // out, so a click never leaves a mark in the prompt
      const typed = reports.map((r) => r[0].slice(3)).join('')
      if (rl && typed) {
        const at = rl.cursor - typed.length
        if (at >= 0 && rl.line.slice(at, at + typed.length) === typed) {
          rl.line = rl.line.slice(0, at) + rl.line.slice(at + typed.length)
          rl.cursor = at
        }
      }
      for (const r of reports) {
        const button = Number(r[0].slice(3).split(';')[0])
        // 64 = wheel up, 65 = wheel down
        if (button === 64) screen.scrollBy(-3)
        else if (button === 65) screen.scrollBy(3)
      }
      screen.render()
      return
    }

    const report = /\x1b\[8;(\d+);(\d+)t/.exec(pending)
    if (!report) return
    pending = pending.slice(report.index + report[0].length)
    screen.reportSize(Number(report[1]), Number(report[2]))
  })
}
wire?.on('line', (line) => {
  // the command under the palette's pointer — captured before the list is
  // cleared, because Enter runs the command the arrows chose
  const choice = paletteChoice()
  paletteClearAfterLine() // the menu never reaches the transcript
  if (awaitingApproval) return // the approval question consumed this line
  if (pendingAsk) {
    // an ask_user question is parked mid-chain — this line IS the answer
    spinClear()
    const p = pendingAsk
    pendingAsk = null
    p.resolve(line)
    if (rl) rl.setPrompt(promptText())
    return
  }
  spinClear() // a typed line lands on a clean line
  const t = line.trim()
  // the picker owns the line while it is open: Enter picks the highlighted
  // option, whatever was typed is just the filter
  if (pickerMode) {
    cmdChain = cmdChain
      .then(async () => {
        await pickerInput(t)
        if (!busy && interactive() && !pickerMode) screen.render()
      })
      .catch((e) => console.log(red(`command failed: ${e?.message ?? e}`)))
    return
  }
  // the settings screen owns the line while it is open
  if (settingsMode) {
    cmdChain = cmdChain
      .then(async () => {
        if (t.startsWith('/')) {
          // a slash command still works from the settings screen
          const cmdLine = t === '/' ? '/help' : line
          if (!(await command(cmdLine.trim()))) {
            console.log(dim('not a command — ↑↓ moves, enter picks, q closes the screen'))
          }
          if (settingsMode) paintSettings()
        } else {
          // a number, a value, or an empty line — the shortcuts for the keys
          await settingsInput(t)
        }
        if (!busy && interactive() && !settingsMode) screen.render()
      })
      .catch((e) => console.log(red(`command failed: ${e?.message ?? e}`)))
    return
  }
  // commands run right away — even while the model is still writing a reply
  if (t.startsWith('/')) {
    // the palette may have a command under the pointer — Enter runs THAT one
    const cmdLine = choice ? choice : t === '/' ? '/help' : line
    cmdChain = cmdChain
      .then(async () => {
        if (await command(cmdLine.trim())) {
          // a command may have opened a menu — it owns the screen now
          if (!busy && process.stdin.isTTY && !settingsMode && !pickerMode) screen.render()
          return
        }
        queue.push(line)
        if (busy) {
          queuedMessages.push(line)
          const count = queuedMessages.length
          const preview = line.trim().slice(0, 60)
          screen.setStatus(`${P.low(`⏳ queued (${count})`)} ${P.mid(preview)}${line.trim().length > 60 ? '…' : ''}`)
        }
        void drain()
        if (!busy && process.stdin.isTTY) screen.render()
      })
      .catch((e) => console.log(red(`command failed: ${e?.message ?? e}`)))
    return
  }
  // the line the human typed belongs in the transcript — readline writes to
  // a sink, so the app echoes it above the prompt. This is the moment the
  // home screen gives way to the conversation.
  screen.beginChat()
  if (t) {
    screen.say(`${P.signal('❯')} ${line}`)
  }
  queue.push(line)
  // if the agent is busy, track the queued message so the user sees it
  if (busy) {
    queuedMessages.push(line)
    const count = queuedMessages.length
    const preview = line.trim().slice(0, 60)
    screen.setStatus(`${P.low(`⏳ queued (${count})`)} ${P.mid(preview)}${line.trim().length > 60 ? '…' : ''}`)
  }
  void drain()
  if (!busy && process.stdin.isTTY) screen.render() // busy → the spinner holds the line
})

wire?.on('close', () => {
  closed = true
  // wait for a still-running command (e.g. /search) before exiting
  cmdChain.then(() => {
    if (!busy) finish()
  })
})

// -- ctrl+c: interrupt the chain, don't lose it ---------------------------------
// Once DURING a run → abort the model call: every completed tool result stays
// in history and the save lands (runAgent returns status "stopped"). A second
// press while it unwinds → quit. During an approval question → quit (that
// question owns the line, same as it always did). Idle → clean exit with the
// MCP server children disconnected.
let abortCtl = null
let interrupted = false
wire?.on('SIGINT', () => {
  paletteClear()
  if (awaitingApproval) return finish()
  if (pendingAsk) {
    // an ask_user question is waiting — ctrl+c skips it (the chain unwinds
    // with "you decide" instead of hanging on a human who stepped away)
    const p = pendingAsk
    pendingAsk = null
    p.resolve('(the user skipped the question — proceed with your best judgement)')
    if (rl) rl.setPrompt(promptText())
    return
  }
  // the settings screen is a screen, not the app — ctrl+c leaves it
  if (settingsMode) {
    closeSettings()
    console.log(dim('settings closed'))
    if (rl && process.stdin.isTTY) screen.render()
    return
  }
  if (abortCtl && !interrupted) {
    interrupted = true
    spinClear()
    abortCtl.abort()
    console.log(dim('⏹ stopping — ctrl+c again quits'))
    return
  }
  if (abortCtl) return finish()
  console.log(dim('bye'))
  finish()
})

// -- one-shot print entry (claude -p / codex exec shape) -------------------------

if (PRINT) {
  let prompt = String(A.values.print ?? A.values.p ?? A.positionals.join(' ')).trim()
  if (!prompt && !process.stdin.isTTY) prompt = (await readStdin()).trim()
  if (!prompt) {
    console.error('usage: codezy exec "prompt"   (or: codezy --agent -p "prompt")\nrun: codezy --help')
    process.exit(2)
  }
  const code = await oneShot(prompt)
  mcpDisconnectAll() // server children must never outlive the run
  if (rl) {
    try {
      rl.close()
    } catch {
      /* already closed */
    }
  }
  process.exit(code)
}

// -- banner ------------------------------------------------------------------------------

/** The header card + the hint lines — one string, shared by the live
 *  banner and the --preview design sheet. */
function bannerText() {
  const home = os.homedir()
  const short = (p) => (p.startsWith(home) ? `~${p.slice(home.length)}` : p)
  return banner(P, {
    version: getVersion(),
    mode: MODE,
    model: MODEL,
    provider: PROVIDER ? PROVIDER.name || PROVIDER.id : 'ollama',
    workspace: roots.map(short).join('  ·  '),
    ctx: `${CTX}`,
    tools: TOOLS.length + (mcpCache?.total || 0),
    fast: FAST,
    thinking: THINKING,
    auto,
    note:
      CAPS && !CAPS.includes('tools')
        ? `${MODEL} advertises no tool calling — edit-block fallback`
        : ''
  })
}

// The live session opens on the home screen: the wordmark with the input box
// in the middle. The banner card is the design sheet (--preview) and the
// piped form; the live screen is the wordmark plus the box.
//
// The screen goes LIVE only when the app owns the terminal: a real TTY, or
// CODEZY_TTY=1 — the escape hatch a test drives the GUI through. A pipe
// gets plain text and nothing else, so a script's stdout stays clean.
if (!PREVIEW && rl && (!!process.stdout.isTTY || process.env.CODEZY_TTY === '1')) {
  screen.enter()
}

/** --preview: the terminal chrome as a design sheet — the header card, a
 *  run's activity lines, the question card and the closing stat line.
 *  No model, no TTY, no side effects: it exists so the look can be
 *  reviewed (and screenshotted) without a live session.
 *  CODEZY_FORCE_COLOR=1 keeps the colours when the output is a pipe. */
if (PREVIEW) {
  const w = Math.max(24, Math.min(process.stdout.columns || 80, 100) - 4)
  console.log(bannerText())
  console.log(userLine(P, 'add a health check endpoint'))
  console.log('')
  console.log(`${P.signal('⠙')} ${P.mid('Thinking')}${P.low('… · 12s')}`)
  console.log('')
  console.log(assistantBlock(P, renderMd("I'll add `/health` and a test for it.", w, COLOR === 'none')))
  console.log('')
  for (const ev of [
    { name: 'list_dir', args: { path: '.' }, outcome: 'ok', result: 'a.ts\nb.ts\nc.ts', ms: 42 },
    { name: 'read_file', args: { path: 'src/main/index.ts' }, outcome: 'ok', result: 'x\n'.repeat(142), ms: 118 },
    { name: 'run_command', args: { command: 'npm test' }, outcome: 'ok', result: '41 passing', ms: 14320 }
  ]) {
    console.log(activityLine(ev))
  }
  console.log('')
  console.log(assistantBlock(P, renderMd('`/health` is live and the suite passes.', w, COLOR === 'none')))
  console.log('')
  console.log(statLine(P, { tokens: 12041, secs: 43, steps: 3 }))
  console.log('')
  console.log(hint(P, '  example · ask_user'))
  console.log(
    card(
      P,
      'question',
      [
        'Which port should the server bind?',
        null,
        `${P.signal('1')}  ${P.mid('3000')}`,
        `${P.signal('2')}  ${P.mid('8080')}`,
        null,
        P.low('type your answer — an empty line = the model decides')
      ],
      { maxWidth: 64 }
    )
  )
  console.log('')
  console.log(`${P.mid('answer')} ${P.signal('❯')} `)
  console.log(hint(P, '  preview · design sheet only, no model was called'))
  process.exit(0)
}
if (rl) screen.render()

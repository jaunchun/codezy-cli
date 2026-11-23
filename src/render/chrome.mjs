// ---------------------------------------------------------------------------
// chrome.mjs — terminal chrome shared by the live shell and the preview.
//
// Everything here takes a paint kit from theme.mjs. That keeps colour decisions
// in one place and lets the tests render the exact same layout with
// `color: 'none'`. Every row is measured after ANSI is stripped, so a coloured
// value can never push a border or a column out of line.
// ---------------------------------------------------------------------------

import { visibleWidth, stripAnsi } from '../theme.mjs'

const MIN = 44
const MAX = 120
const PANEL_MAX = 96

export const termWidth = (fallback = 80) => Math.max(MIN, Math.min(Number(fallback) || 80, MAX))

/** The visible left edge of a block of lines — how far it is indented. */
export const blockIndent = (text) => {
  let indent = Infinity
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue
    const n = line.length - line.trimStart().length
    if (n < indent) indent = n
  }
  return Number.isFinite(indent) ? indent : 0
}

/** Center a group of lines as one block inside `width`. */
export const centerBlock = (lines, width) => {
  const w = Math.max(...lines.map((l) => visibleWidth(l)), 0)
  const pad = Math.max(0, Math.floor((width - w) / 2))
  return lines.map(
    (l) => ' '.repeat(pad) + l + ' '.repeat(Math.max(0, width - pad - visibleWidth(l)))
  )
}

/** nanospinner braille frames, pinned. Its Windows heuristic can fall back to
 *  `- \ | /`; those slashes are not the look — the dots are. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export const padVisible = (s, n) => {
  const text = String(s ?? '')
  return text + ' '.repeat(Math.max(0, n - visibleWidth(text)))
}

export const clipVisible = (s, n) => {
  const text = String(s ?? '')
  if (visibleWidth(text) <= n) return text
  const plain = stripAnsi(text)
  if (n <= 1) return '…'
  return `${plain.slice(0, n - 1)}…`
}

const fit = (left, right, width, gap = 2) => {
  if (!right) return padVisible(clipVisible(left, width), width)
  const room = width - visibleWidth(right) - gap
  if (room <= 0) return padVisible(clipVisible(right, width), width)
  return padVisible(clipVisible(left, room), room) + ' '.repeat(gap) + right
}

const centerVisible = (s, width) => {
  const text = String(s ?? '')
  const pad = Math.max(0, Math.floor((width - visibleWidth(text)) / 2))
  return ' '.repeat(pad) + text + ' '.repeat(Math.max(0, width - pad - visibleWidth(text)))
}

/** A compact three-row wordmark. The original six-row block logo consumed too
 *  much vertical space on the home screen — the input box was pushed below the
 *  fold on 24-row terminals. The compact version keeps the brand gesture while
 *  giving the user more room to work. */
const LOGO = [
  ' ██████╗ ██████╗ ██████╗ ██████╗',
  ' ██╔═══╝ ██╔══██╗██╔═══╝ ██╔══╝',
  ' ██████╗ ██████╔╝██║     ██████╗',
  ' ╚═════╝ ╚═════╝ ╚═╝     ╚═════╝'
]
const LOGO_W = Math.max(...LOGO.map((line) => line.length))

const tonePaint = (p, tone, fallback = 'text') => {
  if (typeof tone === 'function') return tone
  if (tone && typeof p[tone] === 'function') return p[tone]
  if (tone && p[tone]) return p[tone]
  return p[fallback] || ((s) => String(s))
}

/** Human labels for the transcript. The internal tool names stay untouched —
 *  this is only what the line says. Each label now carries an icon for faster
 *  visual scanning of the activity log. */
const TOOL_LABELS = {
  read_file: '📄 Read',
  write_file: '📝 Write',
  edit_file: '✏️ Edit',
  list_dir: '📁 List',
  grep_search: '🔍 Grep',
  run_command: '⚡ Run',
  web_search: '🌐 Search',
  web_fetch: '🔗 Fetch',
  todo_write: '📋 Plan',
  ask_user: '💬 Ask'
}

export const toolLabel = (name) => {
  const id = String(name ?? 'tool')
  if (TOOL_LABELS[id]) return TOOL_LABELS[id]
  const words = id.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Rounded panel. One frame, two columns of breathing room, and no width drift:
 * every row is measured after ANSI is stripped. `rows` accepts a string,
 * `{ text }`, `{ label, value }` or `{ blank: true }`.
 */
export function panel(p, title, rows, opts = {}) {
  const term = termWidth(opts.width ?? process.stdout.columns)
  const cap = Math.min(PANEL_MAX, opts.maxWidth ?? PANEL_MAX)
  const width = Math.min(term, cap)
  const inner = Math.max(1, width - 6)
  const titleText = title ? clipVisible(title, Math.max(1, width - 7)) : ''
  const top = titleText
    ? `${p.line('+-')} ${p.signal(titleText)} ${p.line(
        `${'-'.repeat(Math.max(1, width - visibleWidth(titleText) - 5))}+`
      )}`
    : p.line(`+${'-'.repeat(Math.max(1, width - 2))}+`)

  const rowLine = (body) =>
    `${p.line('|')}  ${padVisible(clipVisible(body, inner), inner)}  ${p.line('|')}`

  const out = [top]
  for (const row of rows) {
    if (row == null || row?.blank) {
      out.push(rowLine(''))
      continue
    }
    let body
    let wash = false
    if (row?.label !== undefined) {
      const label = clipVisible(row.label, Math.max(1, Math.min(16, inner - 2)))
      const room = Math.max(1, inner - visibleWidth(label) - 2)
      const paint = tonePaint(p, row.tone, 'text')
      body = `${p.low(label)}  ${paint(clipVisible(row.value ?? '', room))}`
    } else {
      const raw = typeof row === 'string' ? row : String(row?.text ?? row?.value ?? '')
      const paint = row && typeof row === 'object' && row.tone ? tonePaint(p, row.tone, 'text') : null
      body = paint ? paint(raw) : raw
      wash = !!(row && typeof row === 'object' && row.wash)
    }
    if (wash) {
      // a washed row is a full-bleed band inside the frame: the surface
      // covers the whole inner width, so it reads as a panel, not as text
      const fit2 = padVisible(clipVisible(body, inner), inner)
      out.push(`${p.line('|')}${p.raised(fit2)}${p.line('|')}`)
      continue
    }
    out.push(rowLine(body))
  }
  out.push(p.line(`+${'-'.repeat(Math.max(1, width - 2))}+`))

  // the card sits in the middle of the terminal — a left-aligned box on a
  // wide screen reads as a broken layout, not as a design
  const indent = Math.max(0, Math.floor((term - width) / 2))
  if (!indent) return out.join('\n')
  const pad = ' '.repeat(indent)
  return out.map((l) => pad + l).join('\n')
}

/** Backwards-compatible name used by the REPL wiring. */
export function card(p, title, rows, opts = {}) {
  return panel(p, title, rows, opts)
}

/** A section heading: `▎ session` — no rule, no uppercase label. */
export function section(p, label) {
  return `${p.signal('▎')} ${p.bold(String(label ?? ''))}`
}

/** A section rule, kept for command output that really wants a separator. */
export function rule(p, label, width = process.stdout.columns || 80) {
  const w = termWidth(width)
  const text = clipVisible(String(label ?? ''), Math.max(1, w - 4))
  const line = Math.max(2, w - visibleWidth(text) - 1)
  return `${p.signal(text)} ${p.line('-'.repeat(line))}`
}

/** One key/value row with a dim label column. */
export function fact(p, label, value, width = 21) {
  return `${p.low(padVisible(label, width))} ${value}`
}

/** The right rail on a wide home screen: the facts that would otherwise be a
 *  flat line under the wordmark, stacked like a runtime card. */
const RAIL_W = 19

/**
 * The home screen shows the PROJECT, not the path that leads to it. A folder
 * called "Projekt domyślny" or "Meine Dokumente" under the wordmark reads like
 * a bug in the logo, so only the last segment is printed — the full path is
 * still one `/root` away.
 */
const workspaceName = (ws) => {
  const parts = String(ws || '')
    .split(/[\\/]/)
    .filter(Boolean)
  return parts.length ? parts[parts.length - 1] : String(ws || '')
}

const railRows = (p, model, ctxText) => [
  p.bold('runtime'),
  p.mid(model.provider || 'ollama'),
  p.text(model.model || 'no model'),
  p.mid(`${ctxText} ctx`),
  p.mid(`${model.tools ?? 0} tools`),
  model.thinking ? p.warn('thinking on') : p.low('thinking off'),
  `${p.signal(String(model.mode || 'agent'))} ${p.low(`v${model.version || ''}`)}`
]

/**
 * The wordmark on its own — the hero of the home screen, centred, with the
 * gradient fade. The card around it is the CLI's other screens; this is the
 * one moment that is pure brand.
 */
export function wordmark(p, width = 80) {
  const inner = Math.max(1, width - 6)
  if (inner < LOGO_W) {
    // too narrow for the block wordmark — the small mark instead
    return [
      centerVisible(`${p.signal('◆')} ${p.bold('CODEZY')}`, inner),
      centerVisible(p.mid('a coding agent in your terminal'), inner)
    ]
  }
  const rows = []
  for (const [i, line] of LOGO.entries()) {
    const t = LOGO.length === 1 ? 0 : i / (LOGO.length - 1)
    rows.push(centerVisible(p.fade(t)(line), inner))
  }
  return rows
}

/**
 * The boot panel — the CLI's home screen. Redesigned for compactness:
 * the wordmark is smaller (4 rows instead of 6), the tagline is integrated,
 * and the layout uses a two-column grid for quick-start actions. The runtime
 * facts move to a single condensed line so the screen feels less crowded.
 */
export function banner(p, model) {
  const width = Math.min(termWidth(process.stdout.columns), PANEL_MAX)
  const inner = Math.max(1, width - 6)
  const version = p.low(`v${model.version || ''}`)
  const mode = p.signal(String(model.mode || 'agent'))
  const ctxText = /^\d+$/.test(String(model.ctx ?? ''))
    ? Number(model.ctx).toLocaleString('en-US')
    : String(model.ctx || '—')
  const provider = model.provider || 'ollama'
  const rows = []

  // --- the hero: compact wordmark with integrated tagline --------------------
  const hero = []
  for (const [i, line] of LOGO.entries()) {
    const t = LOGO.length === 1 ? 0 : i / (LOGO.length - 1)
    hero.push(p.fade(t)(line))
  }
  rows.push(...centerBlock(hero, inner))
  rows.push(centerVisible(p.mid('coding agent in your terminal'), inner))

  // --- the runtime facts: one condensed line ---------------------------------
  const facts = [
    p.text(model.model || 'no model'),
    p.mid(provider),
    p.mid(`${ctxText} ctx`),
    mode,
    version
  ].join(p.low(' · '))
  rows.push('')
  rows.push(centerVisible(facts, inner))

  // --- workspace name -------------------------------------------------------
  const ws = workspaceName(model.workspace || process.cwd())
  if (ws) rows.push(centerVisible(p.low(`📂 ${ws}`), inner))

  // --- quick start: two-column grid with icons -------------------------------
  rows.push('')
  rows.push(centerVisible(`${p.signal('▎')} ${p.bold('quick start')}`, inner))
  const prompts = [
    [`${p.signal('💡')} ${p.text('explain this codebase')}`, `${p.signal('🐛')} ${p.text('fix failing tests')}`],
    [`${p.signal('✨')} ${p.text('add a feature')}`, `${p.signal('🔎')} ${p.text('review my diff')}`]
  ]
  if (inner >= 56) {
    const col = Math.floor((inner - 2) / 2)
    for (const [left, right] of prompts) {
      rows.push(
        `${padVisible(clipVisible(left, col), col)}  ${clipVisible(right, inner - col - 2)}`
      )
    }
  } else {
    for (const [left, right] of prompts) {
      rows.push(clipVisible(left, inner))
      rows.push(clipVisible(right, inner))
    }
  }

  // --- footer: commands with icons -------------------------------------------
  rows.push('')
  const links = [
    [`${p.signal('❓')} /help`, 'commands'],
    [`${p.signal('🔄')} /model`, 'switch'],
    [`${p.signal('🎨')} /theme`, 'palette'],
    [`${p.signal('🚪')} /exit`, 'quit']
  ]
  const withLabels = links.map(([cmd, label]) => `${cmd} ${p.mid(label)}`).join('   ')
  const bare = links.map(([cmd]) => cmd).join('   ')
  const footer = visibleWidth(withLabels) <= inner ? withLabels : bare
  rows.push(centerVisible(footer, inner))

  if (model.note) rows.push(centerVisible(p.warn(`⚠ ${clipVisible(model.note, inner - 4)}`), inner))
  return `\n${panel(p, '', rows, { width })}\n`
}

/**
 * The settings screen: section bars, a numbered gutter for the rows you can
 * change, live values, and the command behind each one. It is a map AND a
 * control panel — the numbers are what you type.
 *
 * `opts.editable` is the ordered list of row keys that can be changed; the
 * number on screen is that key's position in the list, so the panel and the
 * REPL can never disagree about what "3" means.
 */
export function settingsPanel(p, data, opts = {}) {
  const VALUE_W = 26
  const inner = Math.max(34, Math.min(termWidth(process.stdout.columns), 80) - 6)
  const showHints = inner >= 68 // below this the command column only truncates
  const editable = Array.isArray(opts.editable) ? opts.editable : []
  const numbered = editable.length > 0
  const NUM_W = 2
  const LABEL_W = 12
  const lead = numbered ? NUM_W + 1 + LABEL_W + 1 : LABEL_W + 1
  const numberOf = (key) => {
    const i = editable.indexOf(key)
    return i < 0 ? 0 : i + 1
  }
  // editable rows get a number, read-only rows a quiet dot — both in the same
  // gutter, so every label stays in one column
  const prefix = (key) => {
    if (!numbered) return ''
    const n = numberOf(key)
    return n ? `${p.signal(String(n).padStart(NUM_W))} ` : `${p.low('·'.padStart(NUM_W))} `
  }
  const row = (key, name, value, hint = '', valueW = VALUE_W, alt = null) => {
    const tip = showHints ? hint : ''
    const room = Math.max(10, Math.min(valueW, inner - lead - (tip ? tip.length + 1 : 0)))
    // a value that does not fit keeps its plain fallback rather than losing
    // its colour to the clip
    const text = alt && visibleWidth(value) > room ? alt : value
    const body = `${prefix(key)}${p.mid(padVisible(name, LABEL_W))} ${padVisible(
      clipVisible(text, room),
      room
    )}`
    return tip ? `${body} ${p.low(tip)}` : body
  }
  const rows = [
    '',
    section(p, '🎨 appearance'),
    row('theme', 'theme', p.text(data.theme), `/theme ${data.otherTheme}`),
    row('accent', 'accent', data.accentRow, '', 44, data.accent),
    row('thinking', 'thinking', data.thinking ? p.warn('on') : p.low('off'), '/thinking on|off'),
    '',
    section(p, '🧠 model'),
    row('main', 'main', p.text(data.model), '/model <id>'),
    row('fast', 'fast', data.fast ? p.text(data.fast) : p.low('—'), '/model fast <id>'),
    row('provider', 'provider', p.mid(data.provider), ''),
    row('endpoint', 'endpoint', p.low(data.url), ''),
    '',
    section(p, '⚙️ session'),
    row('mode', 'mode', p.signal(data.mode), '/mode chat|agent|plan|auto'),
    row('approvals', 'approvals', data.auto ? p.warn('auto') : p.mid('ask'), '/auto on|off'),
    row('context', 'context', p.mid(data.ctx), '/model'),
    row('tools', 'tools', p.mid(String(data.tools)), '/tools'),
    '',
    section(p, '📂 workspace'),
    row('root', 'root', p.mid(data.workspace), '', inner, data.workspace),
    row('settings', 'settings', p.low(data.settingsFile), '', inner, data.settingsFile),
    '',
    p.low(`  v${data.version} · ${data.theme} · ${data.accent} accent`),
    numbered
      ? p.low(
          opts.interactive
            ? '  pick a number to change it · b goes back · q closes'
            : '  pick a number to change it · every value is also a slash command'
        )
      : p.low('  every value is also a slash command · all changes apply live'),
    showHints
      ? p.low('  theme · accent · thinking are saved · the rest live for this session')
      : ''
  ]
  return `\n${panel(p, 'settings', rows, { maxWidth: 80, ...opts })}\n`
}

/**
 * The choices behind one settings row: a small card with the live value
 * marked and the highlighted choice pointed at, so the picker never leaves
 * you guessing what "on" means right now.
 */
export function settingsChoices(p, { title, choices, current, sel = -1 }) {
  const rows = ['']
  choices.forEach((c, i) => {
    const on = c.id === current
    const hi = i === sel
    const mark = hi ? p.signal('▸') : ' '
    const label = hi ? p.text(c.label) : on ? p.text(c.label) : p.mid(c.label)
    const tag = on ? p.low('  ▸ current') : ''
    rows.push(`  ${mark} ${p.signal(String(i + 1))}  ${label}${tag}`)
  })
  rows.push('')
  rows.push(p.low('↑ ↓ move · enter or space picks · b back · q closes'))
  return `\n${panel(p, title, rows, { maxWidth: 64 })}\n`
}

/**
 * A picker: one list of options, the pointer on the highlighted one, the
 * live value marked with a dot. Used by `/model` and `/mode` — a list you
 * walk with ↑↓ and pick with enter.
 *
 * `options` is `[{ label, note, current }]`. The label column is measured so
 * the notes line up, and every line is clipped to the panel.
 */
export function pickerList(
  p,
  { title, subtitle, options, sel = 0, footer, empty, width = 74, term = 0 }
) {
  const labelW = Math.max(...options.map((o) => o.label.length), 1)
  const rows = ['']
  if (subtitle) rows.push(p.low(subtitle))
  if (!options.length) {
    rows.push(`  ${p.low(empty || 'nothing to pick')}`)
  }
  options.forEach((o, i) => {
    const on = i === sel
    const mark = on ? p.signal('▸') : ' '
    const label = padVisible(o.label, labelW)
    // the pointed row is bright, the live value is the accent one
    const labelPaint = on ? p.text(label) : o.current ? p.signal(label) : p.mid(label)
    const note = o.note ? (on ? p.text(o.note) : p.low(o.note)) : ''
    const live = o.current ? p.low('· current') : ''
    const tail = [note, live].filter(Boolean).join('  ')
    const line = `  ${mark} ${labelPaint}${tail ? '  ' + tail : ''}`
    rows.push({ text: line, wash: on })
  })
  rows.push('')
  rows.push(p.low(footer))
  return `\n${panel(p, title, rows, { maxWidth: width, width: term || undefined })}\n`
}

/**
 * The settings screen — ONE screen, ONE list. Every row shows the values it
 * can take, with the live one marked, so nothing is hidden behind a menu of
 * its own: enter applies the next value of the pointed row, in place.
 *
 * `items` is a flat list of
 *   { kind: 'section', label }
 *   { kind: 'row',    label, value, chips, note, selected }
 * A row with `chips` renders its values side by side — the live one marked;
 * a row without one renders its plain `value` plus an optional `note`.
 */
export function settingsScreen(p, { title, items, footer, status, width = 74, term = 0 }) {
  const rows = items.filter((i) => i.kind === 'row')
  const labelW = Math.min(13, Math.max(...rows.map((r) => r.label.length), 1))
  const inner = Math.max(24, Math.min(term || termWidth(process.stdout.columns), width) - 6)
  const out = ['']
  // icon map for common section names so the screen reads as a control panel
  const sectionIcons = { appearance: '🎨', model: '🧠', session: '⚙️', workspace: '📂' }
  for (const it of items) {
    if (it.kind === 'section') {
      const icon = sectionIcons[it.label.toLowerCase()] || '▎'
      out.push(`${p.signal(icon)} ${p.bold(it.label)}`)
      continue
    }
    const sel = !!it.selected
    const mark = sel ? p.signal('▸') : ' '
    const label = padVisible(it.label, labelW)
    const labelPaint = sel ? p.text(label) : p.mid(label)
    let body
    if (it.chips?.length) {
      // every value, side by side — the live one is the accent-coloured one
      body = it.chips
        .map((c) => (c.current ? p.signal(c.label) : p.low(c.label)))
        .join(p.low(' · '))
    } else {
      const room = Math.max(4, inner - labelW - 4)
      const value = clipVisible(it.value ?? '', room)
      const note = it.note ? p.low(clipVisible(it.note, Math.max(0, room - visibleWidth(value) - 2))) : ''
      body = sel ? p.text(value) : p.mid(value)
      if (note) body += '  ' + note
    }
    const line = `  ${mark} ${labelPaint}  ${body}`.trimEnd()
    // the pointed row sits on a raised surface — the wash is what makes the
    // screen read as a control panel instead of a list of words
    out.push({ text: line, wash: sel })
  }
  out.push('')
  if (status) out.push(`  ${p.text(status)}`)
  out.push(p.low(footer))
  return `\n${panel(p, title, out, { maxWidth: width, width: term || undefined })}\n`
}

/**
 * The live `/` menu. One command per line — a two-column layout has to clip
 * each half independently, and the descriptions stop lining up. The command
 * sits in a fixed column and the description starts at the same place on every
 * row, so the list reads as a table.
 *
 * `opts.sel` is the row the arrows have landed on — it is marked, so the user
 * can see which command Enter would run.
 *
 * It is drawn ABOVE the input box by the REPL; this function only decides
 * what the rows say.
 */
export function commandPalette(p, hits, opts = {}) {
  if (!hits?.length) return []
  const width = Math.max(40, opts.width ?? (process.stdout.columns || 80) - 2)
  const cmdW = Math.max(...hits.map((h) => h.cmd.length)) + 2
  const cap = opts.rows ?? 10
  const shown = hits.slice(0, cap)
  const sel = opts.sel ?? -1
  const rows = []
  for (const [i, hit] of shown.entries()) {
    // the command keeps its column; the description starts right after it
    const on = i === sel
    const cmd = on ? p.text(hit.cmd) : p.signal(hit.cmd)
    const gap = ' '.repeat(Math.max(1, cmdW - hit.cmd.length))
    const desc = on ? p.text(hit.desc || '') : p.mid(hit.desc || '')
    // the pointed row wears the arrow and a raised surface — the wash is what
    // makes the list read as a control panel and not a wall of text
    const mark = on ? p.text('❯') : p.signal('❯')
    const line = `  ${mark} ${cmd}${gap}${desc}`
    rows.push(on ? { text: line + ' '.repeat(Math.max(0, width - visibleWidth(line))), wash: true } : line)
  }
  if (hits.length > shown.length) {
    rows.push(p.low(`  … ${hits.length - shown.length} more · keep typing`))
  }
  rows.push(
    p.low(
      `  ${hits.length} ${hits.length === 1 ? 'command' : 'commands'} · ↑ ↓ picks · Tab completes · ↵ runs`
    )
  )
  return rows
}

/** Readline prompt: `agent ❯ `, with the mode still visible in the line. */
export function promptText(p, mode = 'agent') {
  return `${p.mid(String(mode))} ${p.signal('❯')} `
}

/** The prompt's marker without the trailing space — `agent ❯`. The screen
 *  uses it to align the wrapped lines of a long prompt. */
export function promptMarker(p, mode = 'agent', thinking = false) {
  const star = thinking ? p.warn('*') : ''
  return `${star}${p.mid(String(mode))} ${p.signal('❯')}`
}

/**
 * Split plain text into the rows it needs inside a box `room` wide, and say
 * where the caret ends up. The split happens on word boundaries, so a word is
 * never broken in half unless it is longer than the whole row.
 *
 * Returns `{ rows, caretRow, caretCol }` — the caret's row is 0-based inside
 * the rows, its column is 0-based inside that row.
 */
export function wrapText(text, room, caret = 0) {
  const shown = String(text ?? '')
  const width = Math.max(1, room)
  const rows = []
  let rest = shown
  let caretRow = 0
  let caretCol = caret
  let used = 0

  while (true) {
    if (rest.length <= width) {
      rows.push(rest)
      if (caret > used) {
        caretRow = rows.length - 1
        caretCol = Math.min(caret - used, width)
      }
      break
    }
    // cut on the last space that fits, so words stay whole
    let cut = rest.lastIndexOf(' ', width + 1)
    if (cut <= 0) cut = width // a single long word: cut it hard
    const piece = rest.slice(0, cut)
    rows.push(piece)
    if (caret > used && caret <= used + cut) {
      caretRow = rows.length - 1
      caretCol = caret - used
    }
    used += cut
    // skip the space the word was cut at
    rest = rest.slice(cut).replace(/^\s+/, '')
    used += 1
    if (caret > used) caretRow = rows.length
  }

  return { rows, caretRow, caretCol }
}

/**
 * Keep only the rows that fit, and scroll the rest away.
 *
 * The box grows up to `max` rows. Past that it stops growing and the text
 * scrolls inside it — always keeping the caret's row on screen, exactly the
 * way a real textarea behaves.
 *
 * Returns the visible rows and where the caret sits inside them.
 */
export function scrollRows(rows, caretRow, max) {
  const limit = Math.max(1, max)
  if (rows.length <= limit) return { rows, caretRow, scroll: 0 }
  // the window slides so the caret stays visible, near the bottom of it
  let first = Math.min(Math.max(0, caretRow - limit + 1), rows.length - limit)
  if (caretRow < first) first = caretRow
  return {
    rows: rows.slice(first, first + limit),
    caretRow: caretRow - first,
    scroll: first
  }
}

/**
 * The input box — the CLI's prompt, drawn as a real box with a gray background
 * surface. `text` is what the user has typed; `caret` is the column the caret
 * sits at, so the app can paint the line itself and keep the cursor honest.
 *
 * The box AUTO-ADJUSTS, the way opencode's does:
 *   · the text wraps inside the box, on word boundaries
 *   · the box grows TALLER as the text needs more rows
 *   · the caret lands on the row and the column it really sits at
 *
 * The box is `width` wide and centred; the caret lands right after the `❯`
 * marker, exactly where the text begins. Simple ASCII borders replace the
 * Unicode box-drawing characters so the box renders correctly in every terminal.
 */
export function inputBox(p, { text = '', caret = 0, width = 60, placeholder = '', maxRows = 0 }) {
  const inner = Math.max(20, width - 4)
  // the room the text has: the box's inner width, minus the ` ❯ ` marker
  const room = Math.max(8, inner - 4)
  const shown = text || placeholder
  const dim = !text

  const wrapped = wrapText(shown, room, caret)
  // the box grows to `maxRows` and then the text scrolls inside it
  const cap = maxRows > 0 ? maxRows : wrapped.rows.length
  const { rows, caretRow } = scrollRows(wrapped.rows, wrapped.caretRow, cap)
  const caretCol = wrapped.caretCol

  // -- draw the rows --------------------------------------------------------
  const body = rows.map((r, i) => {
    // only the first row carries the `❯` marker; the rest line up under the
    // text, so the column the caret sits at is the same on every row
    const lead = i === 0 ? ` ${p.signal('❯')} ` : '   '
    const fill = Math.max(0, inner - visibleWidth(lead) - visibleWidth(r))
    const text = dim ? p.low(r) : p.text(r)
    // each body row wears a gray background so the input area reads as a
    // raised surface, not as text on the terminal's default background
    const innerText = ` ${lead}${text}${' '.repeat(fill)} `
    return p.raised(innerText)
  })

  return {
    top: `${p.line('+')}${p.line('-'.repeat(inner))}${p.line('+')}`,
    body,
    bottom: `${p.line('+')}${p.line('-'.repeat(inner))}${p.line('+')}`,
    // 0-based row of the caret inside the box body
    caretRow,
    // 0-based column of the caret inside the raised body row.
    // The visible layout is: space(0) + lead(1-3: " ❯ ") + text starts at 4.
    // The raised() ANSI wrapper adds no visible characters.
    caretCol: 4 + caretCol,
    // how many rows the body takes
    rows: body.length,
    inner
  }
}

/** A user line, for the preview and for transcript replays. */
export function userLine(p, text, width = process.stdout.columns || 80) {
  const w = termWidth(width)
  return `${p.signal('❯')} ${p.text(clipVisible(text, w - 2))}`
}

/** Assistant text: one bullet, then a two-space gutter for the rest of the
 *  rendered block. `rendered` is already wrapped by renderMd. Uses a spark
 *  icon for the assistant's voice. */
export function assistantBlock(p, rendered) {
  const body = String(rendered ?? '').replace(/\n+$/, '')
  if (!body) return ''
  return body
    .split('\n')
    .map((line, i) => (i === 0 ? `  ${p.signal('✦')} ${line}` : `    ${line}`))
    .join('\n')
}

/** One completed tool step, Claude-Code shape: a bullet with the tool and its
 *  argument, then a quiet result line under it. Uses checkmark/cross icons
 *  for faster visual scanning of outcomes. */
export function activity(p, ev, width = process.stdout.columns || 80) {
  const w = termWidth(width)
  const ok = ev.outcome === 'ok' || ev.outcome === undefined
  const verb = toolLabel(ev.name)
  const arg = String(ev.arg ?? '')
  const summary = ev.summary ? String(ev.summary) : ''
  const ms = typeof ev.ms === 'number' ? (ev.ms < 1000 ? `${ev.ms}ms` : `${(ev.ms / 1000).toFixed(1)}s`) : ''
  const bullet = ok ? p.ok('✓') : p.danger('✕')
  const head = `  ${bullet} ${p.bold(verb)}${arg ? p.text(`(${arg})`) : ''}`
  const meta = [summary.slice(0, 60), ms].filter(Boolean).join(' · ')
  if (!meta) return clipVisible(head, w)
  const result = ok ? p.low(meta) : p.danger(meta)
  return `${clipVisible(head, w)}\n    ${p.line('⎿')}  ${clipVisible(result, Math.max(4, w - 7))}`
}

/** Closing stat line: the shape of the turn in one quiet row. Shows time,
 *  tokens, steps and thinking mode with icons for quick scanning. */
export function statLine(p, stats, width = process.stdout.columns || 80) {
  const parts = [
    `⏱ ${stats.secs ?? 0}s`,
    `📊 ${Number(stats.tokens ?? 0).toLocaleString('en-US')} tokens`
  ]
  if (stats.steps != null) parts.push(`🔄 ${stats.steps} steps`)
  if (stats.thinking) parts.push('🧠 thinking')
  return clipVisible(`  ${p.ok('✓')} ${p.low(parts.join(' · '))}`, termWidth(width))
}

/** Small inline notice used by commands: `✓ saved`, `! failed`, `· info`. */
export function notice(p, kind, text) {
  const mark = kind === 'ok' ? p.ok('✓') : kind === 'error' ? p.danger('✕') : p.signal('·')
  const body = kind === 'error' ? p.danger(text) : kind === 'ok' ? p.mid(text) : p.low(text)
  return `${mark} ${body}`
}

/** `?` help line, dim and clipped to the terminal. */
export function hint(p, text, width = process.stdout.columns || 80) {
  return p.low(clipVisible(text, termWidth(width)))
}

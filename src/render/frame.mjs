// ---------------------------------------------------------------------------
// frame.mjs — the 3.2.0 terminal frame, rendered as plain text.
//
// A frame is a pure function of (model, options): no cursor addressing, no
// timers, no process access. That makes it:
//   - trivially testable against golden files,
//   - previewable with `node src/preview.mjs`,
//   - reusable by the real REPL in Phase 1 (it diffs the string and redraws).
//
// Every row is measured with ANSI stripped, so a colored value can never push
// a box edge out of line.
// ---------------------------------------------------------------------------

import { paintFor, visibleWidth, DEFAULT_THEME, DEFAULT_ACCENT } from '../theme.mjs'

const WIDTH_MIN = 60
const WIDTH_MAX = 120

// ASCII in both modes: Unicode box-drawing renders as garbage on terminals
// without the block (VISUAL-CHANGES.md §10), colour or no colour.
const lineChar = () => '-'
const box = (plain) => ({
  tl: '+',
  tr: '+',
  bl: '+',
  br: '+',
  h: lineChar(plain),
  v: '|'
})

const glyphs = (plain) => ({
  user: plain ? '>' : '›',
  assistant: plain ? '#' : '◆',
  tool: plain ? '*' : '⚙',
  edit: plain ? '~' : '±',
  caret: plain ? '^' : '▍',
  time: plain ? '' : '⏱ ',
  tag: plain ? '' : '▸ '
})

/** Longest visible prefix of `s` that fits `n` columns, ellipsis included. */
export function clip(s, n) {
  const text = String(s ?? '')
  if (n <= 0) return ''
  if (text.length <= n) return text
  if (n === 1) return '…'
  return `${text.slice(0, n - 1)}…`
}

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - visibleWidth(s)))

/** Word-wrap plain text; long words are hard-split. */
export function wrapText(text, width) {
  const out = []
  for (const rawLine of String(text ?? '').split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = ''
    for (let word of words) {
      while (word.length > width) {
        if (line) {
          out.push(line)
          line = ''
        }
        out.push(word.slice(0, width))
        word = word.slice(width)
      }
      if (!line) line = word
      else if (line.length + 1 + word.length <= width) line += ` ${word}`
      else {
        out.push(line)
        line = word
      }
    }
    if (line) out.push(line)
  }
  return out
}

/** left + gap + right, right-aligned, left clipped by the caller. */
function fit(left, right, width, gap = 2) {
  if (!right) return pad(left, width)
  const room = width - visibleWidth(right) - gap
  if (room <= 0) return pad(right, width)
  return pad(left, room) + ' '.repeat(gap) + right
}

// -- sections -----------------------------------------------------------------

function topBar(model, p, width) {
  const brand = `${p.signal('◆')} ${p.bold('codezy')} ${p.dim(model.version)}`
  const mode = p.signal(model.mode)
  const parts = [brand, mode]
  if (model.model) parts.push(p.mid(model.model))
  if (model.workspace) parts.push(p.mid(model.workspace))
  if (model.branch) parts.push(p.mid(model.branch))
  const right = p.low(`ctx ${model.ctx}`)
  // drop the least important segments until the row fits
  while (parts.length > 2 && visibleWidth(parts.join('   ')) + 2 + visibleWidth(right) > width) parts.pop()
  return fit(parts.join('   '), right, width)
}

function userRow(item, p, width, plain) {
  const g = glyphs(plain)
  const lines = wrapText(item.text, width - 2)
  const out = [`${p.mid(g.user)} ${p.text(lines[0] ?? '')}`]
  for (const line of lines.slice(1)) out.push(`  ${p.text(line)}`)
  if (item.time) out.push(`  ${p.low(`${g.time}${item.time}`)}`)
  return out
}

function assistantRow(item, p, width, plain) {
  const g = glyphs(plain)
  const lines = wrapText(item.text, width - 2)
  return lines.map((line, i) => (i === 0 ? `${p.signal(g.assistant)} ${p.text(line)}` : `  ${p.text(line)}`))
}

function toolRow(item, p, width, plain) {
  const g = glyphs(plain)
  const meta = item.meta ? p.low(item.meta) : ''
  const leftRoom = width - visibleWidth(meta) - (meta ? 2 : 0)
  const name = String(item.name || 'tool').padEnd(5)
  const prefix = `  ${p.low(g.tool)} ${p.mid(name)}`
  const detailRoom = Math.max(4, leftRoom - visibleWidth(prefix) - 1)
  const detail = p.text(clip(item.detail, detailRoom))
  return [fit(`${prefix} ${detail}`, meta, width)]
}

function editBlock(item, p, width, plain) {
  const g = glyphs(plain)
  const b = box(plain)
  const indent = 4
  const outer = width - indent
  const path = clip(item.path, Math.max(8, outer - 10))
  const counts = `${p.ok(`+${item.added}`)} ${item.removed ? p.danger(`-${item.removed}`) : p.low('-0')}`
  const actions = `${p.signal('[a]pply')} ${p.mid('[d]ecline')}`
  const header = `  ${p.low(g.edit)} ${p.bold('edit')} ${p.text(path)} ${counts} ${actions}`
  const out = [header]

  const dashes = Math.max(1, outer - path.length - 5)
  out.push(`${' '.repeat(indent)}${p.line(`${b.tl}${b.h} ${path} `)}${p.line(b.h.repeat(dashes))}${p.line(b.tr)}`)

  const contentWidth = outer - 4
  const last = item.lines.length - 1
  item.lines.forEach((line, i) => {
    const caret = Boolean(item.streaming) && i === last
    const marker = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
    const paint = line.type === 'add' ? p.ok : line.type === 'del' ? p.danger : p.low
    const caretW = caret ? 2 : 0 // space + caret
    const text = clip(line.text, contentWidth - 2 - caretW)
    const visible = 2 + text.length + caretW
    const tail = caret ? ` ${p.signal(g.caret)}` : ''
    out.push(
      `${' '.repeat(indent)}${b.v} ${paint(marker)} ${paint(text)}${tail}${' '.repeat(
        Math.max(0, contentWidth - visible)
      )} ${b.v}`
    )
  })
  out.push(`${' '.repeat(indent)}${p.line(b.bl + b.h.repeat(Math.max(1, outer - 2)) + b.br)}`)
  return out
}

function composer(model, p, width, plain) {
  const b = box(plain)
  const leftPlain = `${b.tl}${b.h} you `
  const rightPlain = ` agent ${b.h}${b.tr}`
  const left = `${p.line(`${b.tl}${b.h}`)} ${p.bold('you')} `
  const right = ` ${p.mid('agent')} ${p.line(`${b.h}${b.tr}`)}`
  const dashes = Math.max(1, width - visibleWidth(leftPlain) - visibleWidth(rightPlain))
  const head = left + p.line(b.h.repeat(dashes)) + right

  const inner = width - 4
  const hint = `${glyphs(plain).tag}ask, / for commands, @ for files`
  const body = `${b.v} ${p.mid(clip(hint, inner))}${' '.repeat(Math.max(0, inner - visibleWidth(clip(hint, inner))))} ${b.v}`
  const foot = `${p.line(b.bl + b.h.repeat(Math.max(1, width - 2)) + b.br)}`
  return [head, body, foot]
}

function footer(model, p, width, plain) {
  const left = plain
    ? 'Enter send · Shift+Enter newline · Esc stop · ^R history · ? help'
    : '⏎ send · ⇧⏎ newline · Esc stop · ^R history · ? help'
  const right = `${model.ctx} ctx · ${model.tokens}`
  return fit(p.low(clip(left, width - visibleWidth(right) - 2)), p.low(right), width)
}

// -- public -------------------------------------------------------------------

/** The demo conversation the preview and golden frames render. */
export const DEMO = {
  version: '3.2.0',
  mode: 'agent',
  model: 'qwen2.5-coder:7b',
  workspace: '~/acme/api',
  branch: 'main*',
  ctx: '18%',
  tokens: '1.2k tok',
  transcript: [
    { kind: 'user', text: 'add rate limiting to the API', time: '12:04' },
    { kind: 'assistant', text: "I'll look at the middleware first, then add a token bucket." },
    { kind: 'tool', name: 'read', detail: 'src/middleware/auth.ts', meta: '42 ms' },
    { kind: 'tool', name: 'grep', detail: '"rateLimit"', meta: '3 hits' },
    {
      kind: 'edit',
      path: 'src/middleware/rate.ts',
      added: 18,
      removed: 0,
      streaming: true,
      lines: [
        { type: 'add', text: 'export function rateLimit(limit: number, windowMs: number) {' },
        { type: 'add', text: '  const hits = new Map<string, number[]>()' },
        { type: 'add', text: '  return (req, res, next) => {' },
        { type: 'add', text: '    const now = Date.now()' },
        { type: 'add', text: '    const recent = (hits.get(req.ip) ?? []).filter(t => now - t < windowMs)' },
        { type: 'add', text: '    if (recent.length >= limit) return res.status(429).end()' }
      ]
    }
  ]
}

/**
 * Render one full frame.
 *   renderFrame(DEMO, { width: 100, theme: 'graphite', color: 'truecolor' })
 * Options: width, theme, color ('truecolor'|'256'|'16'|'none'), accent, plain.
 */
export function renderFrame(model, opts = {}) {
  const width = Math.max(WIDTH_MIN, Math.min(Number(opts.width) || 100, WIDTH_MAX))
  const plain = opts.plain === true || opts.color === 'none'
  const mode = plain ? 'none' : opts.color || 'truecolor'
  const p = paintFor(opts.theme || DEFAULT_THEME, mode, opts.accent || DEFAULT_ACCENT)

  const lines = [topBar(model, p, width), p.line(lineChar(plain).repeat(width))]
  model.transcript.forEach((item, i) => {
    if (item.kind === 'user') {
      lines.push(...userRow(item, p, width, plain), '')
    } else if (item.kind === 'assistant') {
      lines.push(...assistantRow(item, p, width, plain), '')
    } else if (item.kind === 'tool') {
      lines.push(...toolRow(item, p, width, plain))
      if (model.transcript[i + 1]?.kind === 'edit') lines.push('')
    } else if (item.kind === 'edit') {
      lines.push(...editBlock(item, p, width, plain), '')
    }
  })
  lines.push(...composer(model, p, width, plain))
  lines.push('')
  lines.push(footer(model, p, width, plain))
  return lines.join('\n')
}

export { WIDTH_MIN, WIDTH_MAX }

// ui.mjs — the terminal chrome the agent REPL draws with.
//
// The colours are INJECTED (`setPaint`), so the shell keeps owning its
// palette and the tests can render a card without a TTY. The card is the
// one contract that matters here: every row — and the top and bottom
// borders — must be exactly the same width, or the box edge drifts and
// the whole thing reads as broken.

/** No-op paint — the default, so a card renders as plain text until the
 *  shell hands over its palette. */
const PLAIN = { dim: (s) => String(s), bold: (s) => String(s), pre: () => '' }
let PAINT = PLAIN

/** Hand the module the shell's colour helpers. Called once at boot. */
export function setPaint(p) {
  PAINT = { ...PLAIN, ...(p || {}) }
}

/** Usable width — clamped so a card never wraps on a narrow terminal. */
export const cols = (width = process.stdout.columns) => Math.max(46, Math.min(width || 80, 100))

/**
 * Bordered card, opencode-style.
 *
 *  card('title', rows, paint)
 *
 * rows are either
 *   { text, color }            — a free line
 *   { label, value, color }    — a fact row (label dim, value coloured)
 *
 * The text is measured and padded BEFORE it is coloured, so a value that
 * carries its own colour can never push the right border out of line.
 */
export function card(title, rows, paint = PAINT) {
  const inner = cols() - 2
  const width = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '').length
  const dashes = Math.max(inner - width(title) - 5, 3)
  const out = [`${paint.dim('+-')} ${paint.bold(title)} ${paint.dim('-'.repeat(dashes) + '+')}`]
  for (const row of rows) {
    if (row.label !== undefined) {
      const l = String(row.label)
      const v = String(row.value ?? '')
      const room = Math.max(1, inner - 4 - width(l) - 1)
      // a value may carry its own colour: measure what is VISIBLE, pad by
      // that, and clip a too-long value (colour and all) to the column
      const vw = width(v)
      const t = vw > room ? v.replace(/\x1b\[[0-9;]*m/g, '').slice(0, room) : v + ' '.repeat(room - vw)
      out.push(`${paint.dim('|')} ${paint.dim(l)} ${row.color ?? ''}${t} ${paint.dim('|')}`)
    } else {
      const t = String(row.text ?? '').slice(0, inner - 4).padEnd(inner - 4)
      out.push(`${paint.dim('|')} ${row.color ?? ''}${t} ${paint.dim('|')}`)
    }
  }
  out.push(`${paint.dim(`+${'-'.repeat(Math.max(inner - 2, 3))}+`)}`)
  return out.join('\n')
}

/** A section rule: `commands ------------------` */
export function rule(label, paint = PAINT, width = cols() - 4) {
  const l = String(label)
  const plain = l.replace(/\x1b\[[0-9;]*m/g, '')
  return paint.dim(`${l} ${'-'.repeat(Math.max(4, width - plain.length - 1))}`)
}

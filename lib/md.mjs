// ---------------------------------------------------------------------------
// md.mjs — terminal markdown renderer for model replies.
// wrapPlain measures against plain text (ANSI-safe); renderMd turns markdown
// into colored terminal lines: headings, bold/italic, inline code, links,
// lists, quotes, rules, and fenced code blocks with a language tag and a
// tiny syntax highlighter — the terminal twin of the app's code cards.
// ---------------------------------------------------------------------------

const A = '\x1b[38;2;61;155;255m' // accent #3d9bff
const D = '\x1b[2m' // dim
const BOLD = '\x1b[1m'
const ITAL = '\x1b[3m'
const CODE_FG = '\x1b[38;2;120;220;160m' // green inline/code text
const STR_FG = '\x1b[38;2;255;200;60m' // amber strings
const NUM_FG = '\x1b[38;2;130;200;255m' // cyan numbers
const COM_FG = '\x1b[38;2;110;125;145m' // gray comments
const OFF = '\x1b[0m'

/**
 * The palette the reply is coloured with.
 *
 * The reply's highlights must sit in the same palette as the rest of the
 * screen — the accent and the syntax colours come from the THEME, and the
 * accent is the DIMMED variant, so a link is a shade quieter than the
 * prompt's marker. A link that shouts is a link you cannot read.
 */
let PAL = {
  accent: A,
  key: CODE_FG,
  str: STR_FG,
  num: NUM_FG,
  com: COM_FG
}

/** The hex of a paint helper's colour — it returns the ESCAPED text. */
function hexOf(fn, fallback) {
  try {
    const m = /\x1b\[38;2;(\d+);(\d+);(\d+)m/.exec(String(fn('x')))
    if (!m) return fallback
    return [Number(m[1]), Number(m[2]), Number(m[3])]
  } catch {
    return null
  }
}

/** A colour a shade darker than the given one — for text on a light ground. */
function darker([r, g, b], amount = 0.78) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * amount)))
  return `\x1b[38;2;${c(r)};${c(g)};${c(b)}m`
}

/** Set the reply's palette from a theme paint kit. */
export function setMdPalette(paint) {
  if (!paint) return
  const signal = hexOf((s) => paint.signal(s), null)
  const code = hexOf((s) => paint.code(s), null)
  const low = hexOf((s) => paint.low(s), null)
  PAL = {
    // the accent, a shade quieter than the prompt's marker
    accent: signal ? darker(signal) : A,
    key: code ? darker(code, 0.9) : CODE_FG,
    str: code ? darker(code, 0.9) : STR_FG,
    num: code ? darker(code, 0.9) : NUM_FG,
    com: low ? darker(low, 0.95) : COM_FG
  }
}

export const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

/**
 * Word-wrap that preserves leading indentation (bands/meta depend on it)
 * and measures ANSI-colored text by its visible length.
 */
export function wrapPlain(text, w) {
  const out = []
  for (const para of String(text).split('\n')) {
    const indent = (para.match(/^[ \t]*/) || [''])[0]
    const body = para.slice(indent.length)
    const lim = Math.max(w - 1 - indent.length, 8)
    let cur = ''
    const push = () => {
      out.push(indent + cur)
      cur = ''
    }
    for (const word of body.split(' ')) {
      const cand = cur === '' ? word : `${cur} ${word}`
      if (plain(cand).length <= lim) {
        cur = cand
        continue
      }
      if (cur !== '') push()
      if (plain(word).length <= lim) cur = word
      else {
        let rest = word
        while (plain(rest).length > lim) {
          out.push(indent + rest.slice(0, lim))
          rest = rest.slice(lim)
        }
        cur = rest
      }
    }
    push()
  }
  return out
}

// -- syntax highlighting -----------------------------------------------------
// One pass, alternation order matters: strings first (so "http://x" inside a
// string doesn't look like a comment), then comments, numbers, keywords.

// Comments: `//` anywhere (the dominant fence languages), `#`/`--`/`;` only
// when they START the line — mid-line they're ordinary characters (`#fff`,
// `i--`, `x = 1; y = 2`), and a comment regex that eats to EOL also kills the
// trailing keyword highlighting. `#` gets a hex-color exception so CSS colors
// stay colors while `# comment` and `#include` still highlight.
const HL_RE =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/[^\n]*|#(?![0-9a-fA-F]{3,8}\b)[^\n]*$|^[ \t]*--[^\n]*$|^[ \t]*;[^\n]*$)|(\b\d+(?:\.\d+)?\b)|\b(const|let|var|function|return|if|else|for|while|class|new|import|from|export|await|async|def|elif|lambda|True|False|None|null|undefined|true|false|self|this|fn|pub|use|type|interface|struct|impl|match|case|switch|break|continue|try|catch|except|raise|print|require|module|package|static|public|private|void|int|string|bool|float)\b/g

/** Colors one line of code. Input must be plain (no ANSI). */
function hl(line) {
  return line.replace(HL_RE, (m, str, com, num, kw) => {
    if (str) return PAL.str + m + PAL.key
    if (com) return PAL.com + m
    if (num) return PAL.num + m
    if (kw) return BOLD + m + '\x1b[22m' + PAL.key
    return m
  })
}

// -- inline markdown ---------------------------------------------------------

/** bold / italic / inline code / links — single non-overlapping pass. */
function inline(s) {
  return s.replace(
    /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|(?<![\w])_([^_]+)_(?![\w])|\[([^\]]+)\]\(([^)]+)\)/g,
    (m, code, b1, b2, i1, i2, ltext, lhref) => {
      if (code) return PAL.key + code + '\x1b[39m'
      if (b1 || b2) return BOLD + (b1 ?? b2) + '\x1b[22m'
      if (i1 || i2) return ITAL + (i1 ?? i2) + '\x1b[23m'
      if (ltext) return PAL.accent + ltext + '\x1b[39m' + ' ' + D + '(' + lhref + ')' + OFF
      return m
    }
  )
}

// -- fenced code blocks ------------------------------------------------------

/** Draws ```lang ... ``` as a bordered block that fits `w` columns. */
function codeBlock(lang, codeLines, w) {
  const inner = Math.max(w - 6, 16)
  const label = lang || 'code'
  const topDash = Math.max(inner - label.length - 1, 3)
  // ASCII frame in the accent blue: Unicode corners garble on terminals
  // without the block (VISUAL-CHANGES.md §10) and a blue frame keeps code
  // blocks the one coloured object in a reply. Rails stay dim so the code
  // inside is what the eye lands on.
  const out = [`${PAL.accent}+- ${label} ${'-'.repeat(topDash)}+${RESET_L}`]
  for (const raw of codeLines) {
    // hard-wrap long code lines by visible length, highlight after slicing
    const pieces = []
    let rest = raw
    if (rest === '') pieces.push('')
    else
      while (rest.length > inner) {
        pieces.push(rest.slice(0, inner))
        rest = rest.slice(inner)
      }
    pieces.push(rest)
    for (const p of pieces) out.push(`${D}|${RESET_L} ${PAL.key}${hl(p)}${RESET_L} ${D}|${RESET_L}`)
  }
  out.push(`${PAL.accent}+${'-'.repeat(inner + 2)}+${RESET_L}`)
  return out
}
const RESET_L = OFF

// -- main renderer -----------------------------------------------------------

const LIST_RE = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/

/**
 * Renders markdown text into an array of terminal lines, each ≤ w columns
 * (visible). Unclosed constructs while streaming are handled gracefully.
 */
export function renderMd(text, w, mono = false) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // fenced code block
    const fence = line.match(/^\s*```(\S*)\s*$/)
    if (fence) {
      const lang = fence[1] || ''
      const code = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip closing fence (if present — streaming)
      out.push(...codeBlock(lang, code, w))
      continue
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const style = level === 1 ? BOLD + PAL.accent : level === 2 ? PAL.accent : BOLD
      for (const t of wrapPlain(h[2], w - 2)) out.push(`${style}${inline(t)}${OFF}`)
      i++
      continue
    }

    // horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(D + '-'.repeat(Math.min(w, 60)) + OFF)
      i++
      continue
    }

    // blockquote
    const q = line.match(/^\s*>\s?(.*)$/)
    if (q) {
      const wrapped = wrapPlain(q[1], w - 3)
      wrapped.forEach((t, idx) =>
        out.push(`${D}${idx === 0 ? '▌' : ' '}${' '}${OFF}${D}${t}${OFF}`)
      )
      i++
      continue
    }

    // list item
    const li = line.match(LIST_RE)
    if (li) {
      const marker = li[1] ? `${PAL.accent}▪${OFF}` : `${PAL.accent}${li[2]}.${OFF}`
      const indent = (line.match(/^\s*/) || [''])[0]
      const wrapped = wrapPlain(li[3], w - indent.length - 3)
      wrapped.forEach((t, idx) => {
        const pad = ' '.repeat(indent.length)
        out.push(idx === 0 ? `${pad}${marker} ${inline(t)}` : `${pad}  ${inline(t)}`)
      })
      i++
      continue
    }

    // plain paragraph
    for (const t of wrapPlain(line, w)) out.push(inline(t))
    i++
  }
  return mono ? out.map(plain) : out
}

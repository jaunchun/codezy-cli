// ---------------------------------------------------------------------------
// theme.mjs — palette, capability detection and ANSI paint for the new shell.
//
// Data comes from tokens.mjs (generated from design/tokens.json). This file
// owns the decisions: which theme a name resolves to, how much color the
// terminal can take, and how a semantic token becomes an escape sequence.
//
// Contract: paint helpers NEVER throw and NEVER emit escape codes when color
// is off. The frame renderer measures ANSI-stripped text, so every helper must
// be balanced (open + reset in one call).
// ---------------------------------------------------------------------------

import { TOKENS, THEMES, LEGACY_THEMES, DEFAULT_THEME, DEFAULT_ACCENT } from './tokens.mjs'

export { DEFAULT_THEME, DEFAULT_ACCENT }

const HEX = /^#[0-9a-f]{6}$/i

/** Resolve a user-supplied theme name; unknown/legacy names fall back. */
export function resolveTheme(name) {
  const id = String(name || '').trim().toLowerCase()
  if (THEMES.includes(id)) return id
  return LEGACY_THEMES[id] || DEFAULT_THEME
}

/** Resolve an accent name, hex value or unknown legacy value. */
export function resolveAccent(value) {
  const id = String(value || '').trim().toLowerCase()
  if (TOKENS.accents[id]) return id
  if (HEX.test(id)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(id.slice(i, i + 2), 16))
    let best = DEFAULT_ACCENT
    let bestD = Infinity
    for (const [key, def] of Object.entries(TOKENS.accents)) {
      const hex = def.dark
      const d = [1, 3, 5].reduce((sum, i) => sum + (parseInt(hex.slice(i, i + 2), 16) - [r, g, b][(i - 1) / 2]) ** 2, 0)
      if (d < bestD) {
        bestD = d
        best = key
      }
    }
    return best
  }
  return DEFAULT_ACCENT
}

/** The resolved palette object for a theme name. */
export function themeColors(name) {
  return TOKENS.themes[resolveTheme(name)]
}

/**
 * How much color can this stream take?
 * Priority: NO_COLOR → CODEZY_COLOR → FORCE_COLOR → TERM/COLORTERM → TTY.
 * Returns 'truecolor' | '256' | '16' | 'none'.
 */
export function detectColor(env = process.env, stream = process.stdout) {
  if (env.NO_COLOR && env.NO_COLOR !== '0') return 'none'
  const named = String(env.CODEZY_COLOR || '').toLowerCase()
  if (named === 'none' || named === 'plain' || named === '0') return 'none'
  if (named === 'truecolor' || named === '24bit') return 'truecolor'
  if (named === '256') return '256'
  if (named === '16' || named === 'ansi') return '16'

  const force = env.FORCE_COLOR
  if (force === '0') return 'none'
  if (force === '3') return 'truecolor'
  if (force === '2') return '256'
  if (force === '1') return '16'

  const term = String(env.TERM || '')
  if (term === 'dumb') return 'none'
  if (!stream || !stream.isTTY) {
    // Piped output stays clean. Scripts that want colour opt in with
    // CODEZY_COLOR or FORCE_COLOR above; TERM alone must never leak SGR
    // into a redirected file.
    return 'none'
  }
  if (
    env.COLORTERM === 'truecolor' ||
    env.COLORTERM === '24bit' ||
    env.WT_SESSION ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERM_PROGRAM === 'iTerm.app' ||
    term.includes('256color')
  ) {
    return 'truecolor'
  }
  return '16'
}

// -- color math ---------------------------------------------------------------

const rgbOf = (hex) => {
  if (!HEX.test(hex)) return [255, 255, 255]
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** Blend two hex colours; used by the welcome wordmark's vertical fade. */
const mixHex = (a, b, t) => {
  const A = rgbOf(a)
  const B = rgbOf(b)
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * clamp01(t)))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Nearest xterm-256 index for an RGB triple. */
export function to256([r, g, b]) {
  const cube = [0, 95, 135, 175, 215, 255]
  const near = (v) => cube.reduce((best, c, i) => (Math.abs(c - v) < Math.abs(cube[best] - v) ? i : best), 0)
  const ci = 16 + 36 * near(r) + 6 * near(g) + near(b)
  const grey = Math.round((r + g + b) / 3)
  const gi = 232 + Math.max(0, Math.min(23, Math.round((grey - 8) / 10)))
  const c = [cube[near(r)], cube[near(g)], cube[near(b)]]
  const gv = 8 + (gi - 232) * 10
  const dist = (a) => (a[0] - r) ** 2 + (a[1] - g) ** 2 + (a[2] - b) ** 2
  return dist(c) <= dist([gv, gv, gv]) ? ci : gi
}

/** Standard 16-color palette, used to pick the closest basic foreground. */
const ANSI16 = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255]
]

/** Nearest basic color code (30–37 / 90–97) for an RGB triple. */
export function to16([r, g, b]) {
  let best = 0
  let bestD = Infinity
  ANSI16.forEach((c, i) => {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best < 8 ? 30 + best : 90 + (best - 8)
}

// -- paint --------------------------------------------------------------------

const RESET = '\x1b[0m'

/**
 * Build the paint kit for one frame.
 *   paintFor('graphite', 'truecolor', 'blue')
 * Every helper is (text) => styled text, and is a no-op when mode === 'none'.
 */
export function paintFor(name = DEFAULT_THEME, mode = 'truecolor', accent = DEFAULT_ACCENT) {
  const theme = themeColors(name)
  const resolved = resolveTheme(name)
  const accentKey = resolveAccent(accent)
  const accentDef = TOKENS.accents[accentKey]
  const signal = resolved === 'paper' ? accentDef.light : accentDef.dark
  const ansi = theme.ansi

  const wrap = (open, text) => (mode === 'none' || open == null ? String(text) : `\x1b[${open}m${text}${RESET}`)
  const fg = (hex, fallback256) => {
    if (mode === 'none') return (s) => String(s)
    if (mode === 'truecolor') {
      const [r, g, b] = rgbOf(hex)
      return (s) => wrap(`38;2;${r};${g};${b}`, s)
    }
    if (mode === '256') return (s) => wrap(`38;5;${fallback256}`, s)
    return (s) => wrap(to16(rgbOf(hex)), s)
  }

  /**
   * A background wash — the one thing that separates a real TUI from a wall
   * of text. The selected row gets a raised surface behind it, exactly like
   * a native menu.
   */
  const bg = (hex, fallback256) => {
    if (mode === 'none') return (s) => String(s)
    if (mode === 'truecolor') {
      const [r, g, b] = rgbOf(hex)
      return (s) => wrap(`48;2;${r};${g};${b}`, s)
    }
    if (mode === '256') return (s) => wrap(`48;5;${fallback256}`, s)
    return (s) => wrap(to16(rgbOf(hex)), s)
  }

  return {
    mode,
    theme: resolved,
    accentName: accentKey,
    colors: theme,
    bold: (s) => wrap(1, s),
    dim: (s) => wrap(2, s),
    signal: fg(signal, to256(rgbOf(signal))),
    /**
     * A vertical fade for the wordmark.
     *
     * It fades from the live accent into a DIMMED version of the same accent
     * — never into the theme's text colour. The text colour is near-black on
     * a light theme, and the wordmark's lower rows would then disappear into
     * a black smear. The shadow stays a shadow of the accent.
     */
    fade: (t) => {
      const dimmed = mixHex(signal, theme.bg.base, 0.55)
      const hex = mixHex(signal, dimmed, t)
      return fg(hex, to256(rgbOf(hex)))
    },
    accent: fg(accentDef.dark, ansi.signal),
    text: fg(theme.text.hi, ansi.text ?? 255),
    mid: fg(theme.text.mid, ansi.textMid ?? 250),
    low: fg(theme.text.low, ansi.dim),
    line: fg(theme.line.base, ansi.line),
    lineStrong: fg(theme.line.strong, ansi.line + 1),
    ok: fg(theme.ok, ansi.ok),
    warn: fg(theme.warn, ansi.warn),
    danger: fg(theme.danger, ansi.danger),
    code: fg(theme.code, ansi.code ?? 253),
    // the wash behind a selected row
    raised: bg(theme.bg.elevated, 236),
    overlay: bg(theme.bg.overlay, 236),
    // visible width helper (ANSI-stripped)
    width: visibleWidth
  }
}

const ANSI_RE = /\x1b\[[0-9;]*m/g

/** Strip ANSI SGR sequences. */
export function stripAnsi(s) {
  return String(s).replace(ANSI_RE, '')
}

/** Terminal display width of a string with ANSI sequences. */
export function visibleWidth(s) {
  return stripAnsi(s).length
}

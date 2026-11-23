// ---------------------------------------------------------------------------
// screen.mjs — the CLI's screen.
//
// The app owns the terminal, and it owns it in three layers:
//
//   HOME   the wordmark with the input BOX in the middle of the screen
//   CHAT   the conversation — the prompt pinned to the LAST row, the
//          transcript above it, exactly like a chat terminal
//   MENU   a full independent screen that opens ON TOP of either
//
// The app paints every row itself, so nothing scrolls behind its back and
// the screen never shows a half-drawn frame. The main screen is left alone:
// scrolling up shows the conversation, never a menu.
//
// readline keeps editing the text; it writes to a sink, so nothing it does
// can tear a frame apart.
// ---------------------------------------------------------------------------

import readline from 'node:readline'
import { inputBox, wrapText, scrollRows } from '../render/chrome.mjs'
import { visibleWidth } from '../theme.mjs'

/** A writable that throws everything away — readline's half of the deal. */
export function makeSink() {
  return {
    write: () => true,
    get columns() {
      return process.stdout.columns || 80
    },
    get rows() {
      return process.stdout.rows || 24
    },
    on() {
      return this
    },
    once() {
      return this
    },
    off() {
      return this
    },
    removeListener() {
      return this
    },
    emit() {
      return false
    }
  }
}

/**
 * Wrap a line that carries ANSI to `width` columns. The colours survive the
 * break: each new line starts with the escape that was active at the break.
 */
export function wrapAnsi(text, width) {
  const src = String(text ?? '')
  if (!src) return ['']
  if (visibleWidth(src) <= width) return [src]

  const out = []
  let line = '' // the visible text of the current line
  let shown = 0 // its visible width
  let active = '' // the SGR in force right now
  let pending = '' // escapes seen since the last character

  let i = 0
  while (i < src.length) {
    const esc = /^\x1b\[[0-9;]*m/.exec(src.slice(i))
    if (esc) {
      active = esc[0]
      pending += esc[0]
      i += esc[0].length
      continue
    }
    // the next word, or the next character when there is no space
    const space = src.indexOf(' ', i)
    const word = space === -1 ? src.slice(i) : src.slice(i, space)
    const w = visibleWidth(word)
    if (shown + w > width && shown > 0) {
      // break on the last space we saw, so words stay whole
      const cut = line.lastIndexOf(' ')
      if (cut > 0) {
        out.push(active + line.slice(0, cut))
        line = pending + line.slice(cut + 1)
        pending = ''
      } else {
        out.push(active + line)
        line = pending
        pending = ''
      }
      shown = visibleWidth(line) - visibleWidth(active)
    }
    line += word
    shown += w
    i += word.length
    if (src[i] === ' ') {
      line += ' '
      shown += 1
      i++
    }
  }
  if (line || pending) out.push(active + line)
  return out.length ? out : ['']
}

/**
 * Clip a line to `width` columns, keeping its colours.
 *
 * A row that is wider than the terminal wraps, and a wrapped row breaks the
 * frame — the border lands on the wrong line. So every painted row is cut to
 * the terminal's width, with the escape codes left in place.
 */
export function clipAnsi(text, width) {
  const src = String(text ?? '')
  if (visibleWidth(src) <= width) return src
  if (width <= 1) return '…'

  let out = ''
  let shown = 0
  let i = 0
  while (i < src.length && shown < width - 1) {
    const esc = /^\x1b\[[0-9;]*m/.exec(src.slice(i))
    if (esc) {
      out += esc[0]
      i += esc[0].length
      continue
    }
    out += src[i]
    shown++
    i++
  }
  return `${out}…`
}

/**
 * The screen.
 *
 * `paint` is the theme kit, `wordmark` the home rows, `facts` the runtime
 * line under the wordmark. A status bar sits on the last row of the chat
 * screen, showing mode, model, workspace and token usage at a glance.
 */
export function createScreen({
  paint,
  wordmark,
  facts,
  hint,
  completer,
  history = [],
  prompt,
  size,
  input,
  output
}) {
  // 'home' | 'chat'
  let mode = 'home'
  // the menu that is open on top, if any
  let overlay = null
  // the conversation
  const lines = []
  // the `/` suggestion list, shown above the prompt
  let suggestions = []
  // a transient line while a turn runs
  let status = ''
  // a quiet note on the home screen
  let note = ''
  // how many rows the last frame used — so the next one can wipe them
  let used = 0
  // has the app taken the terminal over? A pipe never does — there the
  // commands print their own plain text, and nothing else may reach stdout.
  let active = false
  // the size the terminal REPORTED — a terminal tells the app its size with
  // a size report, and that is the truth even when the stream's own count
  // lags behind a resize
  let reported = null
  // how far the conversation is scrolled back, in lines from the bottom.
  // The mouse wheel moves it; the arrow keys never touch it.
  let scrollBack = 0
  // status bar data — set by the shell to show live stats
  let statusBar = null

  const rl = readline.createInterface({
    input: input || process.stdin,
    output: makeSink(),
    prompt: '',
    completer,
    terminal: true
  })
  rl.history = history

  // where the screen paints — the real terminal, or a test's recorder
  const target = output || process.stdout
  const write = (s) => target.write(s)

  // the terminal's size — the size REPORT it sent is the truth; otherwise
  // COLUMNS/LINES when the stream has no size of its own (a pipe), so the
  // layout can be driven at any size
  const terminalSize = () =>
    reported ||
    (size ? size() : {
      columns: process.stdout.columns || Number(process.env.COLUMNS) || 80,
      rows: process.stdout.rows || Number(process.env.LINES) || 24
    })
  // the width the frame is laid out for — the REAL terminal width, so the
  // frame is centred in the window and nothing is cut off. The input box has
  // a cap of its own, so a very wide terminal gets a wide frame around a
  // comfortable box.
  const termWidth = () => Math.max(24, terminalSize().columns)
  const termRows = () => Math.max(10, terminalSize().rows)
  /**
   * How tall the input box may grow. opencode caps the prompt at a third of
   * the screen — past that the text scrolls inside the box instead of the box
   * eating the screen.
   */
  const maxBoxRows = () => Math.max(3, Math.floor(termRows() / 3))

  /**
   * The input box — the home screen's frame.
   *
   * The box has a comfortable width of its own — a prompt stretched across a
   * 200-column window is unreadable — but it is always CENTRED in the real
   * terminal, never left where it was.
   */
  const box = () =>
    inputBox(paint.p, {
      text: rl.line,
      caret: rl.cursor,
      width: Math.min(termWidth() - 4, 84),
      placeholder: paint.placeholder ?? '',
      maxRows: maxBoxRows()
    })

  /**
   * Paint a frame: the rows go where they belong, and every row the LAST
   * frame used but this one does not is wiped. Nothing is left behind.
   *
   * The frame never reaches past the edge of the terminal — when the terminal
   * shrinks, the rows are clipped and the ones that no longer fit are dropped
   * rather than wrapped onto a line of their own.
   */
  const paintRows = (rows, at = 1) => {
    // a pipe never gets the painted screen — its stdout belongs to the data
    if (!active) return
    const h = termRows()
    const w = terminalSize().columns
    // the rows that fit on the screen — the rest are cut off
    const fitting = rows.slice(0, Math.max(0, h - at + 1))
    let out = '\x1b[H'
    const last = Math.max(used, fitting.length)
    for (let i = 0; i < last; i++) {
      // a row that reaches the last column can still wrap, because the cursor
      // is left pending at the edge — so a row never fills the whole width
      const raw = i < fitting.length ? fitting[i] : ''
      // a row may be an object — `{ text, wash }` — so the pointed row can
      // wear a raised surface
      const body = raw && typeof raw === 'object' ? String(raw.text ?? '') : String(raw ?? '')
      const row = raw && typeof raw === 'object' && raw.wash ? paint.p.raised(body) : clipAnsi(body, w - 1)
      out += `\x1b[${at + i};1H\x1b[2K${row}`
    }
    write(out)
    used = fitting.length
  }

  // -- the home screen --------------------------------------------------------

  /** Paint the home screen: the wordmark, then the box in the middle. */
  const paintHome = () => {
    const w = termWidth()
    const h = termRows()
    const b = box()
    const pad = ' '.repeat(Math.max(0, Math.floor((w - b.inner) / 2)))
    const mark = wordmark(w)
    const fact = facts ? facts(w) : []

    // what the commands have said so far — it sits above the box, so a
    // command that prints something shows its answer
    const spoken = []
    for (const l of lines) for (const w2 of wrapAnsi(l, w)) spoken.push(w2)

    // the suggestion list sits just above the box, so it never covers it
    const sugg = suggestions.length ? ['', ...suggestions] : []

    // -- the composition ------------------------------------------------------
    // The box is the anchor: it grows with the text, and everything else
    // gives way to keep it whole. What goes first is the wordmark (it is only
    // a header), then the hint, then the runtime facts — the box is the last
    // thing to go, because it is the thing you are typing into.
    const factsRows = fact.length
      ? ['', ...fact.map((f) => ' '.repeat(pad.length) + f)]
      : []
    const hintRows = hint ? ['', ' '.repeat(pad.length) + hint] : []
    const noteRows = note ? ['', ' '.repeat(pad.length) + note] : []

    // the blocks of the composition, in the order they are stacked. `drop` is
    // what it costs to lose the block — the cheapest goes first.
    const blocks = [
      { name: 'mark', rows: mark, drop: 1 },
      { name: 'facts', rows: factsRows, drop: 3 },
      { name: 'sugg', rows: sugg, drop: 2 },
      { name: 'box', rows: ['', pad + b.top, ...b.body.map((r) => pad + r), pad + b.bottom], drop: Infinity },
      { name: 'note', rows: noteRows, drop: 4 },
      { name: 'hint', rows: hintRows, drop: 5 }
    ]

    // give up the decoration until the composition fits the screen
    const kept = new Set(blocks.map((b) => b.name))
    const size = () =>
      blocks.reduce((n, b) => (kept.has(b.name) ? n + b.rows.length : n), 0)
    while (size() > h) {
      // the decoration that costs the least to lose goes first
      let victim = null
      for (const b of blocks) {
        if (!kept.has(b.name) || b.drop === Infinity) continue
        if (!victim || b.drop < victim.drop) victim = b
      }
      if (!victim) break
      kept.delete(victim.name)
    }

    // the block sits in the middle of the screen, a little above centre
    const block = []
    let headRows = 0
    for (const b of blocks) {
      if (!kept.has(b.name)) continue
      if (b.name === 'box') {
        // the box's own rows are [blank, topEdge, ...body, bottomEdge] — the
        // BODY is the THIRD row of that block
        headRows = block.length + 2
      }
      block.push(...b.rows)
    }

    // the block sits in the middle of the screen, a little above centre
    const top = Math.max(0, Math.floor((h - block.length) / 2) - 1)
    // whatever the commands said goes ABOVE the wordmark — it is the
    // conversation so far, and the wordmark is the header. Only the tail
    // fits above the header, so when there is more than that, the home
    // screen gives way to the plain chat layout — there is no other way to
    // show it all.
    if (spoken.length > top) {
      beginChat()
      return
    }
    const rows = []
    for (let i = 0; i < top; i++) rows.push('')
    rows.push(...block)
    if (spoken.length) {
      for (let i = 0; i < spoken.length; i++) rows[top - spoken.length + i] = spoken[i]
    }
    paintRows(rows)
    // the caret goes inside the box, on the row the text put it on.
    // `headRows` is the block index of the box BODY; the screen row is the
    // block's offset plus that — and the cursor-position escape counts
    // rows from ONE.
    const bodyRow = top + headRows + b.caretRow + 1
    if (active) write(`\x1b[${bodyRow};${pad.length + b.caretCol + 1}H`)
  }

  // -- the chat screen --------------------------------------------------------

  /**
   * Paint the chat: the transcript, then the prompt pinned to the LAST row of
   * the screen — the way a chat terminal does it. The transcript scrolls up
   * inside the screen, never past its top. A status bar on the very last row
   * shows mode, model, workspace, and token usage at a glance.
   */
  const paintChat = () => {
    const w = termWidth()
    const h = termRows()
    // the status bar reserves the last row when it has content
    const hasBar = statusBar && h >= 4
    const usable = hasBar ? h - 1 : h

    // the prompt marker — `agent ❯` — and the room the text has beside it
    const marker = prompt ? prompt() : `${paint.p.signal('❯')}`
    const lead = visibleWidth(marker)
    const room = Math.max(8, w - lead - 4)
    const wrapped = wrapText(rl.line, room, rl.cursor)
    // the prompt grows to a cap and then scrolls, like the box on the home
    const { rows: promptRows, caretRow } = scrollRows(
      wrapped.rows,
      wrapped.caretRow,
      maxBoxRows()
    )
    const caretCol = wrapped.caretCol

    // the status line and the suggestion list sit just above the prompt
    const below = []
    if (status) below.push(status)
    for (const l of suggestions) below.push(l)
    promptRows.forEach((r, i) => {
      // the first row carries the marker; the rest line up under the text
      const head = i === 0 ? `  ${marker} ` : ' '.repeat(2 + lead + 1)
      below.push(head + paint.p.text(r))
    })

    // wrap the transcript and keep the tail that fits
    const body = []
    for (const l of lines) {
      for (const w2 of wrapAnsi(l, w)) body.push(w2)
    }
    const room2 = Math.max(1, usable - below.length)
    // the mouse wheel scrolls the CONVERSATION back; the arrow keys never do.
    // `scrollBack` counts lines back from the bottom, so new content pushes
    // the view along and the history stays where it was.
    const maxBack = Math.max(0, body.length - room2)
    if (scrollBack > maxBack) scrollBack = maxBack
    const viewEnd = body.length - scrollBack
    const viewStart = Math.max(0, viewEnd - room2)
    const shown = body.slice(viewStart, viewEnd)

    const rows = []
    for (let i = 0; i < room2; i++) rows.push(shown[i] ?? '')
    // the prompt block ends on the last usable row of the screen
    const start = usable - below.length + 1
    below.forEach((l, i) => {
      rows[start - 1 + i] = l
    })

    // the status bar on the very last row — thin, dim, always there
    if (hasBar) {
      const bar = paint.p.low(statusBar || '')
      rows[usable] = bar
    }

    paintRows(rows)
    // the caret goes into the prompt line. The prompt row is
    // `  <marker> <text>`, so the text starts at 2 + marker + 1 — and the
    // cursor-position escape counts columns from ONE, not zero.
    if (active) {
      const col = 2 + lead + 1 + caretCol + 1
      write(`\x1b[${usable - promptRows.length + 1 + caretRow};${col}H`)
    }
  }

  /** Paint a menu: a full independent screen — it covers everything. */
  const paintOverlay = () => {
    const rows = overlay.rows(termWidth())
    paintRows(rows)
  }

  // -- the public surface ----------------------------------------------------

  /** Leave the home screen for good — the conversation starts here. */
  const beginChat = () => {
    if (mode === 'chat') return
    mode = 'chat'
    paintChat()
  }

  /** Redraw whatever is on top: the menu, the home screen, or the chat. */
  const render = () => {
    if (overlay) return paintOverlay()
    if (mode === 'home') return paintHome()
    paintChat()
  }

  return {
    rl,

    /** Say something — it joins the conversation. */
    say(text) {
      const s = String(text ?? '')
      for (const l of s.split('\n')) lines.push(l)
      if (lines.length > 2000) lines.splice(0, lines.length - 2000)
      if (!overlay) render()
    },

    /** Leave the home screen for good — the conversation starts here. */
    beginChat,

    /**
     * A quiet note. On the home screen it stays under the box; in the chat it
     * joins the transcript. A long note starts the conversation instead — it
     * has too much to say for one line.
     */
    notice(text) {
      const s = String(text ?? '')
      if (mode === 'home' && !s.includes('\n') && s.length < 120) {
        note = s
        paintHome()
        return
      }
      if (mode === 'home') beginChat()
      for (const l of s.split('\n')) lines.push(l)
      if (!overlay) render()
    },

    /** The spinner's line, while a turn runs. */
    setStatus(text) {
      status = String(text ?? '')
      if (!overlay && mode === 'chat') paintChat()
    },

    /**
     * The status bar on the last row of the chat screen. Pass a plain string
     * (e.g. "agent · qwen2.5-coder · codezy-cli · 12k tokens") or null to hide.
     */
    setStatusBar(text) {
      statusBar = text ? String(text) : null
      if (!overlay && mode === 'chat') paintChat()
    },

    /** Redraw — after a keypress, a resize, or a change. */
    render,

    /** The `/` suggestion list, shown above the prompt. */
    setSuggestions(rows) {
      suggestions = rows
      if (!overlay) render()
    },

    /** Which view is up. */
    get mode() {
      return mode
    },

    /** The width the frame is laid out for — the menus are sized to it. */
    get width() {
      return termWidth()
    },

    /** Open a menu on top of the screen. */
    openOverlay(o) {
      overlay = o
      paintOverlay()
    },

    /** Close the menu. */
    closeOverlay() {
      overlay = null
      render()
    },

    /** The menu that is open, if any. */
    get overlay() {
      return overlay
    },

    /** Is a menu open? */
    get inOverlay() {
      return !!overlay
    },

    /** Take the terminal over — the app paints every pixel from here on. */
    enter() {
      mode = 'home'
      active = true
      write('\x1b[?1049h\x1b[2J\x1b[H')
      // ask the terminal to report the mouse, so the WHEEL can scroll the
      // conversation. The arrow keys are untouched — they still walk the
      // history in the prompt.
      write('\x1b[?1000h\x1b[?1006h')
      used = 0
      paintHome()
    },

    /** Give the terminal back. */
    leave() {
      active = false
      // stop reporting the mouse — the user's terminal owns it again
      write('\x1b[?1006l\x1b[?1000l')
      write('\x1b[?1049l')
    },

    /** Has the app taken the terminal over? */
    get live() {
      return active
    },

    /**
     * The mouse wheel scrolled — `delta` is negative for up, positive for
     * down. The conversation scrolls back; the prompt stays where it is.
     */
    scrollBy(delta) {
      if (!active) return
      if (mode !== 'chat') return
      const next = Math.max(0, scrollBack - delta)
      if (next === scrollBack) return
      scrollBack = next
      paintChat()
    },

    /** How far the conversation is scrolled back, in lines. */
    get scrolled() {
      return scrollBack
    },

    /**
     * The terminal changed size. The frame is laid out again from scratch —
     * every row is re-measured against the new width, and the rows that no
     * longer fit are wiped.
     */
    resize() {
      if (!active) return
      // the old frame may be wider and taller than the new terminal — wipe it
      // all, then draw the new one
      write('\x1b[2J')
      used = 0
      render()
    },

    /**
     * The terminal told the app its size — a size report (CSI 8 ; rows ; cols
     * t). That is the truth about the window, so the frame is laid out for it.
     */
    reportSize(rows, columns) {
      if (!active) return
      if (!columns || !rows) return
      const changed = reported?.columns !== columns || reported?.rows !== rows
      reported = { columns, rows }
      if (changed) this.resize()
    }
  }
}

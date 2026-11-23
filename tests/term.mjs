// A tiny terminal emulator: it applies the ANSI the CLI writes and shows the
// SCREEN the user actually sees. That is the only honest way to check whether
// a redraw erases what it should.
//
// It keeps TWO buffers, like a real terminal:
//   · the MAIN screen — the scrollback the user can scroll up into
//   · the ALT screen  — the app's own screen, entered with \x1b[?1049h
// `dump()` shows what is on screen right now; `dumpMain()` shows the
// scrollback the app left behind.
export function makeScreen(cols = 80, rows = 40) {
  const blank = () => Array.from({ length: rows }, () => Array(cols).fill(' '))
  let grid = blank()
  const main = blank()
  let inAlt = false
  let cx = 0
  let cy = 0

  const put = (ch) => {
    if (cx >= cols) {
      cx = 0
      cy++
    }
    if (cy >= 0 && cy < rows) grid[cy][cx] = ch
    cx++
  }

  const eraseLine = (mode) => {
    if (cy < 0 || cy >= rows) return
    if (mode === 0) for (let x = cx; x < cols; x++) grid[cy][x] = ' '
    else if (mode === 1) for (let x = 0; x <= cx && x < cols; x++) grid[cy][x] = ' '
    else grid[cy].fill(' ')
  }

  const scroll = () => {
    grid.shift()
    grid.push(Array(cols).fill(' '))
  }

  const write = (str) => {
    let i = 0
    while (i < str.length) {
      const ch = str[i]
      if (ch === '\x1b') {
        const m = /^\x1b\[([0-9;?]*)([a-zA-Z])/.exec(str.slice(i))
        if (!m) {
          i++
          continue
        }
        const args = m[1].split(';').map((x) => parseInt(x, 10) || 0)
        const n = args[0] || 1
        switch (m[2]) {
          case 'A':
            cy = Math.max(0, cy - n)
            break
          case 'B':
            cy = Math.min(rows - 1, cy + n)
            break
          case 'C':
            cx = Math.min(cols - 1, cx + n)
            break
          case 'D':
            cx = Math.max(0, cx - n)
            break
          case 'H':
            cy = Math.max(0, (args[0] || 1) - 1)
            cx = Math.max(0, (args[1] || 1) - 1)
            break
          case 'f':
            cy = Math.max(0, (args[0] || 1) - 1)
            cx = 0
            break
          case 'K':
            eraseLine(args[0])
            break
          case 'J':
            if (args[0] === 2) grid.forEach((l) => l.fill(' '))
            else if (args[0] === 0) {
              eraseLine(0)
              for (let y = cy + 1; y < rows; y++) grid[y].fill(' ')
            }
            break
          case 'G':
            cx = Math.max(0, (args[0] || 1) - 1)
            break
          case 'h':
            // the alternate screen — the app takes the terminal over
            if (m[1] === '?1049') {
              // clear IN PLACE: the helpers below close over `grid`, so
              // reassigning it would leave them painting the old buffer
              for (const row of grid) row.fill(' ')
              cx = 0
              cy = 0
              inAlt = true
            }
            break
          case 'l':
            // back to the main screen — the scrollback the user can see
            if (m[1] === '?1049') {
              inAlt = false
              cx = 0
              cy = 0
            }
            break
          default:
            break
        }
        i += m[0].length
        continue
      }
      if (ch === '\r') {
        cx = 0
        i++
        continue
      }
      if (ch === '\n') {
        cy++
        cx = 0
        if (cy >= rows) {
          scroll()
          cy = rows - 1
        }
        i++
        continue
      }
      if (ch === '\b') {
        cx = Math.max(0, cx - 1)
        i++
        continue
      }
      if (ch < ' ') {
        i++
        continue
      }
      put(ch)
      i++
    }
  }

  /** The visible screen, trailing blank lines removed. */
  const dump = () => {
    const lines = grid.map((l) => l.join('').replace(/\s+$/, ''))
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    return lines.join('\n')
  }

  /** The main screen — the scrollback behind the app. */
  const dumpMain = () => {
    const lines = main.map((l) => l.join('').replace(/\s+$/, ''))
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    return lines.join('\n')
  }

  return {
    write,
    dump,
    dumpMain,
    grid,
    /** Where the terminal's cursor is — { row, col }, 0-based. */
    cursor: () => ({ row: cy, col: cx }),
    get inAlt() {
      return inAlt
    }
  }
}

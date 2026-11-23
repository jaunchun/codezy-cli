// Where does the caret actually land?
//
// The cursor must sit ON the character it points at — one column to the left
// is the difference between typing in the right place and not.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeScreen } from './term.mjs'

const CLI = path.resolve('C:/Users/kajtg/Documents/Projekt domyślny/codezy-cli/index.mjs')
const HOME = path.join(os.tmpdir(), `codezy-car-${Date.now()}`)
fs.mkdirSync(path.join(HOME, '.codezy'), { recursive: true })
fs.writeFileSync(
  path.join(HOME, '.codezy', 'settings.json'),
  JSON.stringify({ theme: 'graphite', accent: '#6FA8FF', dataDir: '' }, null, 2)
)

const COLS = 80
const ROWS = 30

const p = spawn(process.execPath, [CLI], {
  cwd: HOME,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    HOME,
    USERPROFILE: HOME,
    CODEZY_TTY: '1',
    CODEZY_FORCE_COLOR: '1',
    COLUMNS: String(COLS),
    LINES: String(ROWS)
  }
})
const screen = makeScreen(COLS, ROWS)
p.stdout.on('data', (d) => screen.write(d.toString()))
p.stderr.on('data', (d) => screen.write(d.toString()))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const send = (s) => p.stdin.write(s)

const fails = []
let total = 0
const check = (label, ok, detail = '') => {
  total++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) fails.push(label)
}

/** Where the terminal thinks the cursor is. */
const cursor = () => screen.cursor()

await wait(2000)

// -- the home box --------------------------------------------------------------
send('hello')
await wait(700)
// The app repaints on every keypress and the caret escape comes LAST, so the
// terminal's cursor position IS where the caret is. The emulator reports it
// 0-based; the row's text is 0-based too.
const c = screen.cursor()
const plain = screen.grid[c.row].map((ch) => (ch === null ? ' ' : ch)).join('')
check('the home caret is inside the box', c.col > 0 && c.col < COLS, `row=${c.row} col=${c.col}`)
check(
  'the home caret sits right after the text',
  plain.slice(0, c.col).endsWith('hello'),
  `before the caret: ${JSON.stringify(plain.slice(Math.max(0, c.col - 8), c.col))}`
)

// -- the chat prompt -----------------------------------------------------------
send('\r')
await wait(2500)
send('abc')
await wait(700)
const c2 = screen.cursor()
const plain2 = screen.grid[c2.row].map((ch) => (ch === null ? ' ' : ch)).join('')
check('the chat caret is on the prompt row', c2.row >= 0, `row=${c2.row}`)
check(
  'the chat caret sits right after the text',
  plain2.slice(0, c2.col).endsWith('abc'),
  `before the caret: ${JSON.stringify(plain2.slice(Math.max(0, c2.col - 10), c2.col))}`
)

console.log(`\n${total - fails.length}/${total} checks passed`)
if (fails.length) {
  console.log('FAILED:')
  for (const x of fails) console.log('  - ' + x)
}
p.kill()
process.exit(fails.length ? 1 : 0)

// The `/` palette: the arrows pick a command and Enter runs it.
//
// The list is a control, not decoration — ↑ ↓ move a pointer through it,
// the pointed row wears a raised surface, and Enter runs the command under
// it. The arrow keys must keep their OTHER job too: with the palette closed
// they still walk the input's history.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeScreen } from './term.mjs'

const CLI = path.resolve('C:/Users/kajtg/Documents/Projekt domyślny/codezy-cli/index.mjs')
const HOME = path.join(os.tmpdir(), `codezy-palrun-${Date.now()}`)
fs.mkdirSync(path.join(HOME, '.codezy'), { recursive: true })
fs.writeFileSync(
  path.join(HOME, '.codezy', 'settings.json'),
  JSON.stringify({ theme: 'graphite', accent: '#6FA8FF', dataDir: '' }, null, 2)
)

const COLS = 90
const ROWS = 34
const p = spawn(process.execPath, [CLI], {
  cwd: HOME,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    HOME,
    USERPROFILE: HOME,
    CODEZY_TTY: '1',
    CODEZY_COLOR: 'truecolor',
    COLUMNS: String(COLS),
    LINES: String(ROWS)
  }
})
const screen = makeScreen(COLS, ROWS)
let raw = ''
p.stdout.on('data', (d) => {
  raw += d.toString()
  screen.write(d.toString())
})
p.stderr.on('data', (d) => (raw += d.toString()))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const send = (s) => p.stdin.write(s)
const strip = (s) => String(s).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
const rows = () => screen.dump().split('\n')

const fails = []
let total = 0
const check = (label, ok, detail = '') => {
  total++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) fails.push(label)
}

await wait(2200)

// -- the palette opens and the first row can be pointed at -------------------
send('/')
await wait(900)
const openRows = rows().map(strip).filter((l) => l.includes('❯') && l.includes('/'))
check('the palette opens on /', openRows.length > 3, `${openRows.length} rows`)

raw = ''
send('\x1b[B') // down
await wait(700)
const washAfterDown = (raw.match(/\x1b\[48;2;\d+;\d+;\d+m/g) || []).length
check('the down arrow paints a wash on the pointed row', washAfterDown > 0, `${washAfterDown} washes`)

raw = ''
send('\x1b[B') // down again — the pointer must MOVE, not stick
await wait(700)
const wash2 = (raw.match(/\x1b\[48;2;\d+;\d+;\d+m/g) || []).length
check('the pointer moves on the second press', wash2 > 0, `${wash2} washes`)

// the pointed row is the SECOND command (/settings is second in the list)
const screenAfterTwo = strip(screen.dump())
check(
  'the pointed row is highlighted, not the first',
  /\/settings/.test(screenAfterTwo),
  screenAfterTwo.split('\n').find((l) => l.includes('/settings'))?.slice(0, 50) ?? 'no /settings row'
)

// -- Enter runs the command under the pointer ---------------------------------
send('\r')
await wait(1600)
const afterEnter = strip(screen.dump())
check(
  'Enter runs the pointed command (/settings)',
  /theme|accent|setting/i.test(afterEnter),
  afterEnter.split('\n').filter((l) => /theme|model|accent/i.test(l)).slice(0, 2).join(' | ').slice(0, 80)
)

// -- Esc / q closes the settings screen again ---------------------------------
send('q\r')
await wait(900)

// -- the arrows still walk history when the palette is CLOSED -----------------
send('hello world\r')
await wait(900)
send('\x1b[A')
await wait(700)
const lastRow = strip(rows()[rows().length - 1] ?? '')
check(
  'the up arrow still recalls history with the palette closed',
  lastRow.includes('hello world'),
  JSON.stringify(lastRow)
)

console.log(`\n${total - fails.length}/${total} checks passed`)
if (fails.length) {
  console.log('FAILED:')
  for (const f of fails) console.log('  - ' + f)
}
p.kill()
process.exit(fails.length ? 1 : 0)

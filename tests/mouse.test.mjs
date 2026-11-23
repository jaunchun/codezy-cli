// The mouse in the CLI.
//
// The wheel scrolls the conversation; the arrow keys keep doing what they
// always did. And a CLICK must never type anything into the prompt — the
// terminal reports clicks as escape sequences, and readline would take their
// digits for typed text.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeScreen } from './term.mjs'

const CLI = path.resolve('C:/Users/kajtg/Documents/Projekt domyślny/codezy-cli/index.mjs')
const HOME = path.join(os.tmpdir(), `codezy-mouse-${Date.now()}`)
fs.mkdirSync(path.join(HOME, '.codezy'), { recursive: true })
fs.writeFileSync(
  path.join(HOME, '.codezy', 'settings.json'),
  JSON.stringify({ theme: 'graphite', accent: '#6FA8FF', dataDir: '' }, null, 2)
)

const COLS = 80
const ROWS = 24

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
const strip = (s) => String(s).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
const rows = () => screen.dump().split('\n')

const fails = []
let total = 0
const check = (label, ok, detail = '') => {
  total++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) fails.push(label)
}

/** The prompt line — the last row of the screen. */
const promptLine = () => {
  const r = rows()
  return strip(r[r.length - 1] ?? '')
}

/** The conversation on screen, without the prompt. */
const transcript = () =>
  rows()
    .slice(0, -1)
    .map(strip)
    .filter((l) => l.trim())
    .join('\n')

await wait(2000)

// a long conversation, so there is something to scroll through
for (let i = 1; i <= 14; i++) {
  send('message number ' + i + '\r')
  await wait(450)
}
await wait(1500)

// -- a click types nothing ---------------------------------------------------------
const promptBefore = promptLine()
send('\x1b[<0;30;12M') // a left click
await wait(400)
send('\x1b[<0;30;12m') // its release
await wait(600)
check('a click types nothing', promptLine() === promptBefore, `prompt: ${JSON.stringify(promptLine())}`)

// -- the wheel scrolls the conversation ---------------------------------------------
const before = transcript()
const firstBefore = (rows()[0] ?? '').trim()
check('the conversation is on screen', before.includes('message number'), before.slice(0, 50))

send('\x1b[<64;30;12M') // wheel up
await wait(500)
send('\x1b[<64;30;12M') // and again
await wait(700)
const afterUp = transcript()
const firstAfter = (rows()[0] ?? '').trim()
check(
  'the wheel up scrolls the conversation back',
  firstAfter !== firstBefore,
  `the top of the view did not move (${JSON.stringify(firstAfter)})`
)
check('the wheel up left the prompt alone', promptLine() === promptBefore)

// scrolling back down returns to the live edge
send('\x1b[<65;30;12M') // wheel down
await wait(400)
send('\x1b[<65;30;12M') // and again
await wait(700)
const afterDown = transcript()
check(
  'the wheel down scrolls back to the live edge',
  (rows()[0] ?? '').trim() === firstBefore,
  'the view did not come back'
)

// -- the arrow keys are untouched ----------------------------------------------------
const textBefore = promptLine()
send('\x1b[A') // the up arrow — it walks the input's own history
await wait(600)
check(
  'the up arrow still reaches the prompt',
  promptLine() !== textBefore,
  'the arrow key changed nothing at all'
)

console.log(`\n${total - fails.length}/${total} checks passed`)
if (fails.length) {
  console.log('FAILED:')
  for (const f of fails) console.log('  - ' + f)
}
p.kill()
process.exit(fails.length ? 1 : 0)

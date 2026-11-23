// ---------------------------------------------------------------------------
// chrome.test.mjs — the terminal chrome must survive every width and colour
// depth. These checks catch the failure that matters: a row that is wider than
// the terminal wraps, the card edge drifts, and the whole frame reads broken.
// ---------------------------------------------------------------------------

import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleWidth, stripAnsi, paintFor, resolveTheme, resolveAccent, detectColor, DEFAULT_ACCENT } from '../src/theme.mjs'
import {
  banner,
  card,
  activity,
  section,
  promptText,
  statLine,
  notice,
  rule,
  termWidth,
  commandPalette,
  settingsPanel,
  settingsChoices,
  settingsScreen,
  pickerList,
  inputBox,
  SPINNER_FRAMES
} from '../src/render/chrome.mjs'

const WIDTHS = [44, 60, 80, 110]
const THEMES = ['graphite', 'paper', 'contrast']

/** Set the width chrome reads, and restore it when the test is done. */
function withWidth(width, fn) {
  Object.defineProperty(process.stdout, 'columns', { value: width, configurable: true, writable: true })
  try {
    return fn()
  } finally {
    delete process.stdout.columns
  }
}

const model = {
  version: '3.2.0',
  mode: 'agent',
  model: 'qwen2.5-coder:7b',
  provider: 'ollama',
  workspace: 'C:\\Users\\someone\\projects\\a-rather-long-workspace-path\\that\\keeps\\going',
  ctx: '65536',
  tools: 11,
  thinking: true,
  auto: false,
  note: 'a note long enough to need clipping at narrow widths'
}

test('default accent is cobalt, not lime', () => {
  assert.equal(DEFAULT_ACCENT, 'blue')
})

test('piped output stays plain unless colour is forced', () => {
  const piped = { isTTY: false }
  assert.equal(detectColor({}, piped), 'none')
  assert.equal(detectColor({ TERM: 'xterm-256color', COLORTERM: 'truecolor' }, piped), 'none')
  assert.equal(detectColor({ CODEZY_COLOR: 'truecolor' }, piped), 'truecolor')
  assert.equal(detectColor({ FORCE_COLOR: '1' }, piped), '16')
  assert.equal(detectColor({ NO_COLOR: '1', FORCE_COLOR: '1' }, piped), 'none')
})

test('the spinner always uses the braille dots, never the ASCII slash frames', () => {
  assert.equal(SPINNER_FRAMES.length, 10)
  for (const frame of SPINNER_FRAMES) {
    assert.match(frame, /^[\u2800-\u28FF]$/)
    assert.doesNotMatch(frame, /[-\\|/]/)
  }
})

test('activity and the closing line do not count steps', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const a = activity(p, { name: 'read_file', arg: 'src/main.ts', summary: '143 lines', ms: 118 }, 100)
  assert.doesNotMatch(a, /\bstep\b/i)
  const s = statLine(p, { steps: 9, tokens: 12041, secs: 43, thinking: true }, 100)
  assert.doesNotMatch(s, /\bstep\b/i)
  assert.match(s, /12,041 tokens/)
})

test('legacy theme ids still resolve', () => {
  for (const id of ['midnight', 'ember', 'mint', 'slate', 'dark', 'acrylic']) {
    assert.equal(resolveTheme(id), 'graphite')
  }
  assert.equal(resolveTheme('light'), 'paper')
  assert.equal(resolveTheme('nonsense'), 'graphite')
})

test('accent names, hex values and legacy values resolve', () => {
  assert.equal(resolveAccent('blue'), 'blue')
  assert.equal(resolveAccent('#6FA8FF'), 'blue')
  assert.equal(resolveAccent('#C6F24E'), 'lime')
  assert.equal(resolveAccent(''), 'blue')
})

test('paper uses the light cobalt signal', () => {
  const p = paintFor('paper', 'truecolor', 'blue')
  assert.match(p.signal('x'), /\x1b\[38;2;31;95;191m/)
  const g = paintFor('graphite', 'truecolor', 'blue')
  assert.match(g.signal('x'), /\x1b\[38;2;111;168;255m/)
})

for (const width of WIDTHS) {
  test(`banner and cards fit ${width} columns`, () => {
    withWidth(width, () => {
      const limit = termWidth(width)
      for (const theme of THEMES) {
        for (const mode of ['none', 'truecolor']) {
          const p = paintFor(theme, mode, 'blue')
          const out = banner(p, model)
          for (const line of out.split('\n')) {
            if (!line) continue
            assert.ok(
              visibleWidth(line) <= limit,
              `${theme}/${mode}: ${visibleWidth(line)} > ${limit}: ${stripAnsi(line)}`
            )
          }

          const box = card(p, 'approval for a long tool name that should be clipped', [
            { text: 'write src/a/very/long/path/that/keeps/going/and/going/file.ts (12 lines)' },
            { blank: true },
            { text: 'y once  ·  a always  ·  n no  ·  ? details', tone: 'low' },
            { label: 'tool', value: 'write_file' }
          ])
          const rows = box.split('\n')
          // the card is centred in the terminal, so it may start indented
          const inset = rows[0].length - rows[0].trimStart().length
          assert.match(stripAnsi(rows[0]).trimStart(), /^\+- approval/, `${theme}/${mode}: card title`)
          assert.match(stripAnsi(rows[0]).trimEnd(), /\+$/, `${theme}/${mode}: card top`)
          assert.match(stripAnsi(rows[rows.length - 1]).trimStart(), /^\+-+\+$/, `${theme}/${mode}: card bottom`)
          for (const row of rows.slice(1, -1)) {
            assert.match(stripAnsi(row).trimStart(), /^\|/, `${theme}/${mode}: card rail`)
          }
          for (const row of rows) {
            assert.ok(visibleWidth(row) <= limit, `${theme}/${mode}: card overflows`)
          }
          // every row of the card shares the same left edge
          for (const row of rows) {
            assert.equal(
              row.length - row.trimStart().length,
              inset,
              `${theme}/${mode}: the card rows are not aligned`
            )
          }

          const line = activity(
            p,
            {
              iteration: 3,
              name: 'run_command',
              arg: 'npm test -- --runInBand --coverage --watchAll=false',
              summary: '41 passing',
              ms: 14320,
              outcome: 'ok'
            },
            width
          )
          assert.match(stripAnsi(line), /^\s+✓ ⚡ Run\(/, `${theme}/${mode}: activity bullet`)
          assert.match(stripAnsi(line), /⎿/, `${theme}/${mode}: activity result`)
          for (const row of line.split('\n')) {
            assert.ok(visibleWidth(row) <= limit, `${theme}/${mode}: activity overflows`)
          }

          for (const [kind, text] of [
            ['rule', rule(p, 'a very long section label that should still fit', width)],
            ['section', section(p, 'model & mode & a long label', width)],
            ['notice', notice(p, 'ok', 'theme graphite · cobalt')],
            ['stat', statLine(p, { steps: 3, tokens: 12041, secs: 43, thinking: true }, width)],
            ['prompt', promptText(p, 'agent', true)]
          ]) {
            assert.ok(visibleWidth(text) <= limit, `${theme}/${mode}: ${kind} overflows`)
          }

          if (mode === 'none') {
            assert.ok(!/\x1b\[/.test(out + box + line), `${theme}/${mode}: leaked ANSI`)
          }
        }
      }
    })
  })
}

test('the home screen shows the wordmark and the runtime facts', () => {
  const p = paintFor('graphite', 'none', 'blue')
  withWidth(90, () => {
    const plain = stripAnsi(banner(p, model))
    // the wordmark is the hero — it is centred, not left in the corner
    assert.match(plain, /CODEZY|█/)
    assert.match(plain, /qwen2\.5-coder:7b/)
    // the compact banner no longer shows 'thinking on' as a separate fact
    assert.match(plain, /\+/)
    // the facts sit under the wordmark, centred
    const lines = plain.split('\n')
    const mark = lines.findIndex((l) => /█/.test(l))
    const facts = lines.findIndex((l) => /qwen2\.5-coder:7b/.test(l))
    assert.ok(mark >= 0 && facts > mark, 'the runtime sits under the wordmark')
  })
  withWidth(60, () => {
    // narrow terminals still fit — the card never wraps
    for (const line of stripAnsi(banner(p, model)).split('\n')) {
      if (line) assert.ok(visibleWidth(line) <= 60, 'the banner overflows at 60')
    }
  })
})

test('the `/` palette is one command per line and aligned', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const hits = Array.from({ length: 21 }, (_, i) => ({
    cmd: `/cmd${String(i).padStart(2, '0')}`,
    desc: `description number ${i}`
  }))
  const rows = commandPalette(p, hits, { width: 80 })
  assert.equal(rows.length, 12) // 10 commands + "more" + the key hint
  assert.match(stripAnsi(rows[0]), /\/cmd00/)
  assert.doesNotMatch(stripAnsi(rows[0]), /\/cmd01/) // one per line, not two columns
  assert.match(stripAnsi(rows[10]), /… 11 more/)
  assert.match(stripAnsi(rows[11]), /21 commands/)
  for (const row of rows) assert.ok(visibleWidth(row) <= 80, 'palette row overflows')

  // every description starts in the same column — that is what was misaligned
  const descCols = rows.slice(0, 10).map((r) => stripAnsi(r).indexOf('description'))
  assert.ok(descCols.every((c) => c === descCols[0]), 'the descriptions do not line up')

  // a wide terminal is the same list, one per line
  const wide = commandPalette(p, hits, { width: 100 })
  assert.doesNotMatch(stripAnsi(wide[0]), /\/cmd08/)
  for (const row of wide) assert.ok(visibleWidth(row) <= 100, 'wide palette row overflows')
  assert.deepEqual(commandPalette(p, [], { width: 80 }), [])
})

test('the settings screen fits every width and every section', () => {
  const p = paintFor('paper', 'none', 'blue')
  const data = {
    version: '3.2.0',
    theme: 'paper',
    otherTheme: 'graphite | contrast',
    accent: 'cobalt',
    accentRow: '▸ ● cobalt   ● lime   ● amber   ● magenta',
    thinking: true,
    model: 'qwen2.5-coder:7b',
    fast: '',
    provider: 'ollama',
    url: 'http://127.0.0.1:11434',
    mode: 'agent',
    auto: false,
    ctx: '65,536',
    tools: 11,
    workspace: 'C:\\Users\\someone\\projects\\a-rather-long-workspace-path',
    settingsFile: 'C:\\Users\\someone\\.codezy\\settings.json'
  }
  for (const width of WIDTHS) {
    withWidth(width, () => {
      const out = settingsPanel(p, data)
      for (const line of out.split('\n')) {
        if (line) assert.ok(visibleWidth(line) <= width, `${width}: settings overflows`)
      }
      const plain = stripAnsi(out)
      for (const word of ['settings', 'appearance', 'model', 'session', 'workspace']) {
        assert.match(plain, new RegExp(word))
      }
      assert.match(plain, /qwen2\.5-coder:7b/)
      assert.match(plain, /65,536/)
      assert.doesNotMatch(out, /\x1b\[/)
    })
  }
})

test('the settings screen numbers the rows it can change', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const data = {
    version: '3.2.0',
    theme: 'graphite',
    otherTheme: 'paper | contrast',
    accent: 'cobalt',
    accentRow: '▸ ● cobalt   ● lime   ● amber   ● magenta',
    thinking: true,
    model: 'qwen2.5-coder:7b',
    fast: '',
    provider: 'ollama',
    url: 'http://127.0.0.1:11434',
    mode: 'agent',
    auto: false,
    ctx: '65,536',
    tools: 11,
    workspace: 'codezy-cli',
    settingsFile: '~/.codezy/settings.json'
  }
  const editable = ['theme', 'accent', 'thinking', 'main', 'fast', 'mode', 'approvals', 'root']
  withWidth(80, () => {
    const out = settingsPanel(p, data, { editable, interactive: true })
    for (const line of out.split('\n')) {
      if (line) assert.ok(visibleWidth(line) <= 80, 'numbered settings overflows')
    }
    const plain = stripAnsi(out)
    // the number is the row's position in the editable list
    const numbers = [
      ...plain.matchAll(/(\d+) (theme|accent|thinking|main|fast|mode|approvals|root)\b/g)
    ]
    assert.equal(numbers.length, editable.length, 'every editable row is numbered')
    numbers.forEach((m, i) => assert.equal(Number(m[1]), i + 1, `row ${m[2]} is numbered ${m[1]}`))
    // read-only rows carry a quiet dot, never a number
    for (const row of ['provider', 'endpoint', 'context', 'tools', 'settings']) {
      assert.match(plain, new RegExp(`·\\s+${row}\\b`), `${row} is marked read-only`)
    }
    assert.match(plain, /pick a number/)
    // a plain map (no editable list) keeps the old shape
    const map = stripAnsi(settingsPanel(p, data))
    assert.doesNotMatch(map, /^\s*\d+ theme/m, 'a map has no numbers')
  })
})

test('the choices card marks the live value and never overflows', () => {
  const p = paintFor('graphite', 'none', 'blue')
  withWidth(80, () => {
    const out = settingsChoices(p, {
      title: 'theme',
      choices: [
        { id: 'graphite', label: 'graphite' },
        { id: 'paper', label: 'paper' },
        { id: 'contrast', label: 'contrast' }
      ],
      current: 'paper',
      sel: 2
    })
    for (const line of out.split('\n')) {
      if (line) assert.ok(visibleWidth(line) <= 80, 'choices card overflows')
    }
    const plain = stripAnsi(out)
    assert.match(plain, /1\s+graphite/)
    assert.match(plain, /2\s+paper\s+▸ current/)
    assert.match(plain, /3\s+contrast/)
    // the highlighted choice carries the pointer
    assert.match(plain, /▸\s+3\s+contrast/)
    assert.match(plain, /↑ ↓ move · enter or space picks/)
  })
})

test('the settings screen is ONE list — every value is on its row', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const items = [
    { kind: 'section', label: 'appearance' },
    {
      kind: 'row',
      label: 'theme',
      selected: false,
      chips: [
        { label: 'graphite', current: true },
        { label: 'paper', current: false },
        { label: 'contrast', current: false }
      ]
    },
    {
      kind: 'row',
      label: 'accent',
      selected: true,
      chips: [
        { label: 'cobalt', current: true },
        { label: 'lime', current: false }
      ]
    },
    { kind: 'row', label: 'model', value: 'qwen2.5-coder:7b', note: '· /model lists them' }
  ]
  withWidth(80, () => {
    const out = settingsScreen(p, {
      title: 'settings',
      items,
      status: '✓ theme graphite · lime',
      footer: '↑ ↓ row · ← → change · enter swaps to the next · esc closes'
    })
    for (const line of out.split('\n')) {
      if (line) assert.ok(visibleWidth(line) <= 80, 'settings screen overflows')
    }
    const plain = stripAnsi(out)
    // every value of a row is on the row — no hidden menu
    assert.match(plain, /theme\s+graphite · paper · contrast/)
    assert.match(plain, /accent\s+cobalt · lime/)
    // the pointer marks the pointed row
    assert.match(plain, /▸\s+accent/)
    assert.doesNotMatch(plain, /▸\s+theme/)
    // a row without a list shows its value and a note
    assert.match(plain, /model\s+qwen2\.5-coder:7b\s+· \/model lists them/)
    // the last change is on the screen
    assert.match(plain, /✓ theme graphite · lime/)
  })
})

test('the picker is a list with a pointer and the live value marked', () => {
  const p = paintFor('graphite', 'none', 'blue')
  withWidth(80, () => {
    const out = pickerList(p, {
      title: 'model',
      subtitle: 'model · ollama at http://127.0.0.1:11434',
      options: [
        { label: 'llama3.1:8b', note: '4.7 GB · Q4_K_M', current: false },
        { label: 'qwen2.5-coder:7b', note: '4.7 GB · Q4_K_M', current: true },
        { label: 'deepseek-r1:8b', note: '8.2 GB · Q4_K_M', current: false }
      ],
      sel: 1,
      footer: '↑ ↓ move · enter or space picks · type to filter · esc closes'
    })
    for (const line of out.split('\n')) {
      if (line) assert.ok(visibleWidth(line) <= 80, 'picker overflows')
    }
    const plain = stripAnsi(out)
    assert.match(plain, /\+- model/)
    assert.match(plain, /▸\s+qwen2\.5-coder:7b/)
    assert.match(plain, /llama3\.1:8b\s+4\.7 GB · Q4_K_M/)
    assert.match(plain, /qwen2\.5-coder:7b.*· current/)
    assert.match(plain, /↑ ↓ move · enter or space picks/)
  })
})

test('an empty picker says so instead of showing nothing', () => {
  const p = paintFor('graphite', 'none', 'blue')
  withWidth(80, () => {
    const out = stripAnsi(
      pickerList(p, {
        title: 'model',
        options: [],
        sel: -1,
        empty: 'nothing matches “zzz”',
        footer: 'esc closes'
      })
    )
    assert.match(out, /nothing matches “zzz”/)
  })
})

test('the home screen shows the project folder, not a foreign path', () => {
  const p = paintFor('graphite', 'none', 'blue')
  withWidth(90, () => {
    const out = stripAnsi(
      banner(p, { ...model, workspace: '~\\Documents\\Projekt domyślny\\codezy-cli' })
    )
    assert.match(out, /codezy-cli/)
    assert.doesNotMatch(out, /Projekt/, 'the logo area shows no translated path')
  })
})

test('the input box grows to fit what was typed', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const short = inputBox(p, { text: 'hello', caret: 5, width: 60 })
  assert.equal(short.body.length, 1, 'a short text is one row')
  assert.equal(short.caretRow, 0)

  // a long text wraps and the box gets taller — like opencode's
  const long = inputBox(p, {
    text: 'one two three four five six seven eight nine ten eleven twelve thirteen',
    caret: 74,
    width: 60
  })
  assert.ok(long.body.length > 1, 'a long text makes the box taller')
  assert.equal(long.body.length, long.rows)

  // every row is the same width — the raised background covers the full width
  const inner = long.inner
  for (const row of long.body) {
    const plain = stripAnsi(row)
    // the raised body has a leading and trailing space for the background wash
    assert.equal(visibleWidth(plain), inner + 2, 'the box row is not the right width')
  }
})

test('the input box never lets the text past its border', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const text = 'x'.repeat(400)
  const b = inputBox(p, { text, caret: 400, width: 60 })
  for (const row of b.body) {
    const plain = stripAnsi(row)
    assert.ok(visibleWidth(plain) <= b.inner + 2, 'the text overflowed the box')
  }
  // the caret stays inside the box
  assert.ok(b.caretRow >= 0 && b.caretRow < b.body.length, 'the caret is outside the box')
  assert.ok(b.caretCol <= b.inner, 'the caret is outside the box')
})

test('the caret lands on the row the wrapped text put it on', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu'
  // the caret sits right after "gamma"
  const caret = text.indexOf('gamma') + 'gamma'.length
  const b = inputBox(p, { text, caret, width: 60 })
  const row = stripAnsi(b.body[b.caretRow])
  assert.ok(row.includes('gamma'), 'the caret is not on the row that holds the text')
  // the caret column is where the text ends on that row
  const after = row.indexOf('gamma') + 'gamma'.length
  assert.equal(b.caretCol, after, 'the caret column does not match the text')
})

test('the wrapped text keeps its words whole', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const words = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm'
  const b = inputBox(p, { text: words, caret: 0, width: 60 })
  const plain = b.body.map(stripAnsi).join(' ')
  for (const w of words.split(' ')) assert.ok(plain.includes(w), `the word "${w}" was broken`)
})

test('the input box stops growing and scrolls instead', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const text = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ')
  const b = inputBox(p, { text, caret: text.length, width: 60, maxRows: 5 })
  assert.equal(b.body.length, 5, 'the box grew past its cap')
  // the caret is still on the last visible row — the text scrolled to it
  assert.equal(b.caretRow, b.body.length - 1)
  // the tail of the text is what is shown
  assert.match(stripAnsi(b.body[b.body.length - 1]), /word299/)
})

test('the scroll keeps the caret on screen', () => {
  const p = paintFor('graphite', 'none', 'blue')
  const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
  // the caret is in the middle — the window slides to it
  const mid = text.indexOf('word100') + 'word100'.length
  const b = inputBox(p, { text, caret: mid, width: 60, maxRows: 4 })
  assert.equal(b.body.length, 4)
  assert.ok(b.caretRow >= 0 && b.caretRow < 4, 'the caret scrolled off the box')
  assert.match(stripAnsi(b.body[b.caretRow]), /word100/)
})

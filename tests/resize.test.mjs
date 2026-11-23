// The frame when the terminal changes size.
//
// The width is injected, so the screen can be laid out at one size and then
// resized — the same thing a terminal does when it is dragged.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { paintFor, stripAnsi, visibleWidth } from '../src/theme.mjs'
import { wordmark } from '../src/render/chrome.mjs'
import { createScreen } from '../src/shell/screen.mjs'

const p = paintFor('graphite', 'none', 'blue')

function makeAt(columns, rows) {
  const size = { columns, rows }
  const sink = new PassThrough()
  let painted = ''
  sink.on('data', (d) => {
    painted += d.toString()
  })
  const screen = createScreen({
    paint: { p, placeholder: 'ask anything · / for commands' },
    wordmark: (w) => wordmark(p, w),
    facts: (w) => ['model · ollama · 65,536 ctx · 11 tools', 'project'],
    hint: p.low('↑ ↓ history · tab completes · / for commands'),
    completer: (line) => [[], line],
    size: () => size,
    input: new PassThrough(),
    output: sink
  })
  return { screen, size, painted: () => painted, restore: () => screen.rl.close() }
}

/** The rows of the painted screen, as the terminal would show them. */
function frameOf(painted) {
  const rows = []
  const parts = painted.split(/\x1b\[\d+;1H/)
  for (const part of parts.slice(1)) {
    rows.push(part.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ''))
  }
  return rows
}

/** The first and last column of the frame's ink — where it actually sits. */
function extent(rows) {
  const ink = rows.filter((r) => r.trim())
  if (!ink.length) return { from: 0, to: 0, centre: 0 }
  let from = Infinity
  let to = 0
  for (const r of ink) {
    const a = r.search(/\S/)
    if (a >= 0) from = Math.min(from, a)
    to = Math.max(to, r.trimEnd().length)
  }
  return { from, to, centre: (from + to) / 2 }
}

test('the frame is centred in the terminal', () => {
  for (const columns of [60, 80, 100, 150]) {
    const t = makeAt(columns, 30)
    try {
      t.screen.enter()
      const rows = frameOf(t.painted())
      const { from, to } = extent(rows)
      const centre = (from + to) / 2
      const want = columns / 2
      assert.ok(
        Math.abs(centre - want) <= 2,
        `at ${columns} columns the frame sits at ${centre}, not ${want}`
      )
    } finally {
      t.restore()
    }
  }
})

test('the frame fits after a resize', () => {
  const t = makeAt(150, 30)
  try {
    t.screen.enter()
    t.size.columns = 60
    t.size.rows = 20
    t.screen.resize()
    const rows = frameOf(t.painted().slice(t.painted().lastIndexOf('\x1b[2J')))
    for (const r of rows) {
      assert.ok(visibleWidth(r) <= 60, `a row is ${visibleWidth(r)} wide on 60 columns`)
    }
    const { from, to } = extent(rows)
    const centre = (from + to) / 2
    assert.ok(Math.abs(centre - 30) <= 2, `the frame sits at ${centre}, not 30`)
  } finally {
    t.restore()
  }
})

test('no painted row is ever as wide as the terminal', () => {
  // a row that exactly fills the terminal can still wrap, because the cursor
  // is left pending at the last column
  for (const columns of [60, 80, 100]) {
    const t = makeAt(columns, 30)
    try {
      t.screen.enter()
      for (const r of frameOf(t.painted())) {
        assert.ok(
          visibleWidth(r) < columns,
          `a row is exactly ${columns} wide — it can wrap`
        )
      }
    } finally {
      t.restore()
    }
  }
})

test('the frame is centred, not shoved to the left', () => {
  // a wide terminal must not leave a dead zone on the right — the frame is
  // laid out for the whole width
  const t = makeAt(150, 30)
  try {
    t.screen.enter()
    const rows = frameOf(t.painted())
    const ink = rows.filter((r) => r.trim())
    assert.ok(ink.length > 0, 'nothing was painted')
    let from = Infinity
    let to = 0
    for (const r of ink) {
      const a = r.search(/\S/)
      if (a >= 0) from = Math.min(from, a)
      to = Math.max(to, r.trimEnd().length)
    }
    // the frame's centre must be the terminal's centre
    const centre = (from + to) / 2
    assert.ok(
      Math.abs(centre - 75) <= 3,
      `the frame sits at ${centre}, not the middle of 150`
    )
    // and it must not be hugging the left edge
    assert.ok(from > 5, `the frame starts at column ${from} — it is not centred`)
  } finally {
    t.restore()
  }
})

test('the facts line keeps its start', () => {
  // the facts are clipped to the width — the head of the line must survive,
  // or the model name goes missing
  const t = makeAt(80, 30)
  try {
    t.screen.enter()
    const rows = frameOf(t.painted())
    const facts = rows.find((r) => /model/.test(r))
    assert.ok(facts, 'the facts line is missing')
    assert.match(facts.trim(), /^model/, 'the facts line lost its head')
  } finally {
    t.restore()
  }
})

test('a size report re-lays the frame out', () => {
  // a terminal tells the app its size with a size report — the frame must
  // follow it, not keep the width it had
  const t = makeAt(150, 30)
  try {
    t.screen.enter()
    const before = extent(frameOf(t.painted()))
    assert.ok(Math.abs(before.centre - 75) <= 4, 'the frame was not centred to begin with')
    // the terminal says it is 70 columns now
    t.screen.reportSize(30, 70)
    const after = frameOf(t.painted().slice(t.painted().lastIndexOf('\x1b[2J')))
    for (const r of after) {
      assert.ok(visibleWidth(r) < 70, `a row is ${visibleWidth(r)} wide on 70 columns`)
    }
    const { centre } = extent(after)
    assert.ok(Math.abs(centre - 35) <= 3, `the frame sits at ${centre}, not 35`)
  } finally {
    t.restore()
  }
})

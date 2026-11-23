import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderFrame, DEMO, clip, wrapText } from '../src/render/frame.mjs'
import { stripAnsi, resolveTheme, detectColor, to256, to16 } from '../src/theme.mjs'

const FIX = path.resolve(import.meta.dirname, 'fixtures')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

const CASES = [
  { name: 'graphite-80.plain', opts: { width: 80, theme: 'graphite', color: 'none' } },
  { name: 'graphite-120.plain', opts: { width: 120, theme: 'graphite', color: 'none' } },
  { name: 'paper-100.ansi', opts: { width: 100, theme: 'paper', color: 'truecolor', accent: 'lime' } }
]

for (const c of CASES) {
  test(`golden: ${c.name}`, () => {
    const out = renderFrame(DEMO, c.opts)
    const file = path.join(FIX, `${c.name}.txt`)
    if (UPDATE || !fs.existsSync(file)) {
      fs.mkdirSync(FIX, { recursive: true })
      fs.writeFileSync(file, out + '\n')
      if (!UPDATE) console.log('created golden', c.name)
      return
    }
    const expected = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    assert.equal(out + '\n', expected, `golden mismatch for ${c.name}`)
  })
}

test('alignment: no row exceeds requested width', () => {
  for (const w of [60, 80, 100, 120]) {
    for (const color of ['truecolor', '256', '16', 'none']) {
      const out = renderFrame(DEMO, { width: w, theme: 'graphite', color })
      for (const line of out.split('\n')) {
        assert.ok(
          stripAnsi(line).length <= w,
          `row wider than ${w} (${stripAnsi(line).length}): ${stripAnsi(line)}`
        )
      }
    }
  }
})

test('plain mode emits no ANSI escapes', () => {
  const out = renderFrame(DEMO, { width: 100, theme: 'graphite', color: 'none' })
  assert.equal(out, stripAnsi(out))
  assert.ok(out.includes('^'), 'plain caret should be ^')
})

test('color mode emits ANSI escapes', () => {
  const out = renderFrame(DEMO, { width: 100, theme: 'graphite', color: 'truecolor' })
  assert.notEqual(out, stripAnsi(out))
})

test('legacy theme names resolve to graphite', () => {
  for (const name of ['midnight', 'ember', 'mint', 'dark', 'slate', 'acrylic', 'singularity']) {
    assert.equal(resolveTheme(name), 'graphite')
  }
  assert.equal(resolveTheme('light'), 'paper')
  assert.equal(resolveTheme('contrast'), 'contrast')
})

test('detectColor honors NO_COLOR and FORCE_COLOR', () => {
  assert.equal(detectColor({ NO_COLOR: '1' }, { isTTY: true }), 'none')
  assert.equal(detectColor({ FORCE_COLOR: '0' }, { isTTY: true }), 'none')
  assert.equal(detectColor({ FORCE_COLOR: '3' }, { isTTY: true }), 'truecolor')
  assert.equal(detectColor({ TERM: 'dumb' }, { isTTY: true }), 'none')
})

test('clip and wrapText behave', () => {
  assert.equal(clip('hello', 3), 'he…')
  assert.equal(clip('hi', 10), 'hi')
  assert.deepEqual(wrapText('a b c', 3), ['a b', 'c'])
})

test('to256/to16 are deterministic', () => {
  assert.equal(to256([200, 100, 50]), to256([200, 100, 50]))
  assert.equal(typeof to16([200, 100, 50]), 'number')
})
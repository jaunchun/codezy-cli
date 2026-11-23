#!/usr/bin/env node
// ---------------------------------------------------------------------------
// preview.mjs — print the 3.2.0 terminal frame without a model, a session or
// a TTY. Phase 0 uses it to review the look and to generate golden fixtures.
//
//   node src/preview.mjs
//   node src/preview.mjs --width 80 --theme paper
//   node src/preview.mjs --color 256
//   node src/preview.mjs --plain
// ---------------------------------------------------------------------------

import { renderFrame, DEMO } from './render/frame.mjs'
import { detectColor, DEFAULT_ACCENT } from './theme.mjs'

const args = process.argv.slice(2)
const value = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const has = (name) => args.includes(`--${name}`)

const width = Number(value('width', process.stdout.columns || 100))
const theme = String(value('theme', 'graphite'))
const accent = String(value('accent', DEFAULT_ACCENT))
const plain = has('plain') || has('no-color')
const color = plain ? 'none' : String(value('color', detectColor()))

process.stdout.write(
  `${renderFrame(DEMO, { width, theme, accent, color, plain })}\n`
)

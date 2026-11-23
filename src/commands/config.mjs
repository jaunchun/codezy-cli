#!/usr/bin/env node
// codezy config — one settings surface (--json for scripts)
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseArgs } from '../../lib/cli.mjs'

const HOME = path.join(os.homedir(), '.codezy')
const SETTINGS = path.join(HOME, 'settings.json')

const A = parseArgs(process.argv.slice(2), ['json'])
const pos = A.positionals[0] === 'config' ? A.positionals.slice(1) : A.positionals
const SUB = (pos[0] || 'list').toLowerCase()
// remap positional access

const json = A.present.has('json')

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) }
  catch { return {} }
}
function writeSettings(obj) {
  fs.mkdirSync(HOME, { recursive: true })
  fs.writeFileSync(SETTINGS, JSON.stringify(obj, null, 2) + '\n')
}

const s = readSettings()

if (SUB === 'list' || SUB === 'get' && !pos[1]) {
  if (json) process.stdout.write(JSON.stringify(s, null, 2) + '\n')
  else {
    const keys = Object.keys(s)
    if (!keys.length) console.log('(no settings)')
    else for (const k of keys) console.log(`${k} = ${JSON.stringify(s[k])}`)
  }
  process.exit(0)
}

if (SUB === 'get') {
  const key = pos[1]
  if (!key) { console.error('usage: codezy config get <key>'); process.exit(2) }
  const v = s[key]
  if (json) process.stdout.write(JSON.stringify(v) + '\n')
  else console.log(v === undefined ? '(unset)' : JSON.stringify(v))
  process.exit(0)
}

if (SUB === 'set') {
  const key = pos[1]
  const val = pos.slice(2).join(' ')
  if (!key) { console.error('usage: codezy config set <key> <value>'); process.exit(2) }
  let parsed = val
  try { parsed = JSON.parse(val) } catch { /* keep string */ }
  s[key] = parsed
  writeSettings(s)
  if (json) process.stdout.write(JSON.stringify({ ok: true, key, value: s[key] }) + '\n')
  else console.log(`set ${key} = ${JSON.stringify(s[key])}`)
  process.exit(0)
}

if (SUB === 'edit') {
  console.log(SETTINGS)
  process.exit(0)
}

console.error(`unknown subcommand: ${SUB}\nusage: codezy config [list|get <key>|set <key> <value>|edit] [--json]`)
process.exit(2)
#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseArgs } from '../../lib/cli.mjs'

const HOME = path.join(os.homedir(), '.codezy')
const AGENT_DIR = path.join(HOME, 'agent')
const pos0 = process.argv.slice(2)
const A = parseArgs(pos0, ['json'])
const args = A.positionals[0] === 'sessions' ? A.positionals.slice(1) : A.positionals
const SUB = (args[0] || 'list').toLowerCase()
const json = A.present.has('json')

function listSessions() {
  if (!fs.existsSync(AGENT_DIR)) return []
  return fs.readdirSync(AGENT_DIR).filter((f) => f.endsWith('.json')).map((f) => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, f), 'utf8'))
      return { id: f.replace(/\.json$/, ''), title: d.title || d.saveTitle || '(untitled)', messages: (d.history || d.messages || []).length, file: f }
    } catch { return { id: f.replace(/\.json$/, ''), title: '(unreadable)', messages: 0, file: f } }
  })
}

if (SUB === 'list') {
  const list = listSessions()
  if (json) process.stdout.write(JSON.stringify(list, null, 2) + '\n')
  else {
    if (!list.length) console.log('no saved sessions')
    else for (const s of list) console.log(`${s.id}  ${s.title}  (${s.messages} msgs)`)
  }
  process.exit(0)
}

if (SUB === 'rm') {
  const id = args[1]
  if (!id) { console.error('usage: codezy sessions rm <id>'); process.exit(2) }
  const f = path.join(AGENT_DIR, id.endsWith('.json') ? id : id + '.json')
  if (!fs.existsSync(f)) { console.error(`not found: ${id}`); process.exit(1) }
  fs.unlinkSync(f)
  console.log(`removed ${id}`)
  process.exit(0)
}

if (SUB === 'export') {
  const id = args[1]
  const out = args[2] || `${id}.md`
  if (!id) { console.error('usage: codezy sessions export <id> [path]'); process.exit(2) }
  const f = path.join(AGENT_DIR, id.endsWith('.json') ? id : id + '.json')
  if (!fs.existsSync(f)) { console.error(`not found: ${id}`); process.exit(1) }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'))
  const hist = d.history || d.messages || []
  const md = hist.map((m) => `## ${m.role}\n\n${m.content || ''}\n`).join('\n')
  fs.writeFileSync(out, md)
  console.log(`exported ${id} -> ${out}`)
  process.exit(0)
}

console.error(`usage: codezy sessions [list|rm <id>|export <id> [path]] [--json]`)
process.exit(2)
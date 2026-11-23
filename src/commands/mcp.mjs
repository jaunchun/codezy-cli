#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseArgs } from '../../lib/cli.mjs'
import { mcpRegistryTools } from '../../lib/mcp.mjs'

const HOME = path.join(os.homedir(), '.codezy')
function readSettings() {
  try { return JSON.parse(fs.readFileSync(path.join(HOME, 'settings.json'), 'utf8')) } catch { return {} }
}
const pos0 = process.argv.slice(2)
const A = parseArgs(pos0, ['json'])
const args = A.positionals[0] === 'mcp' ? A.positionals.slice(1) : A.positionals
const SUB = (args[0] || 'list').toLowerCase()
const json = A.present.has('json')
const settings = readSettings()
const servers = settings.mcpServers || []

if (SUB === 'list') {
  if (json) process.stdout.write(JSON.stringify(servers, null, 2) + '\n')
  else {
    if (!servers.length) console.log('no MCP servers configured')
    else for (const s of servers) console.log(`${s.name || '(unnamed)'}  ${s.command || ''}  ${s.enabled === false ? '(disabled)' : ''}`)
  }
  process.exit(0)
}

if (SUB === 'test') {
  if (!servers.length) { console.log('no MCP servers configured'); process.exit(0) }
  let ok = true
  for (const s of servers) {
    try {
      const r = await mcpRegistryTools([s], '3.2.0')
      console.log(`${s.name}: ${r.total || 0} tools`)
    } catch (e) {
      ok = false
      console.log(`${s.name}: FAILED ${e?.message ?? e}`)
    }
  }
  process.exit(ok ? 0 : 1)
}

console.error('usage: codezy mcp [list|test] [--json]')
process.exit(2)
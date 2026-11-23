#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const pos0 = process.argv.slice(2)
const args = pos0[0] === 'skills' ? pos0.slice(1) : pos0
const SUB = (args[0] || 'list').toLowerCase()
if (SUB === 'list') { console.log('no skills installed'); process.exit(0) }
if (SUB === 'run') { console.error('skills run: not yet available in CLI'); process.exit(2) }
console.error('usage: codezy skills [list|run <name>]'); process.exit(2)
#!/usr/bin/env node
import { getVersion } from '../../lib/cli.mjs'

const pos0 = process.argv.slice(2)
const args = pos0[0] === 'update' ? pos0.slice(1) : pos0
const check = args.includes('--check')
const version = getVersion()
console.log(check ? 'checking for updates…' : 'to update: npm i -g codezy-cli@latest')
console.log(`current: ${version}`)

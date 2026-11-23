#!/usr/bin/env node
const pos0 = process.argv.slice(2)
const args = pos0[0] === 'completions' ? pos0.slice(1) : pos0
const shell = (args[0] || '').toLowerCase()
const cmds = ['chat','agent','plan','auto','config','sessions','mcp','skills','completions','update','serve','doctor','help']
if (!['bash','zsh','fish','pwsh','powershell'].includes(shell)) {
  console.error('usage: codezy completions <bash|zsh|fish|pwsh>')
  process.exit(2)
}
if (shell === 'bash' || shell === 'zsh') {
  console.log(`_codezy() { COMPREPLY=( $(compgen -W "${cmds.join(' ')}" -- "\${COMP_WORDS[COMP_CWORD]}") ); }\ncomplete -F _codezy codezy`)
} else if (shell === 'fish') {
  for (const c of cmds) console.log(`complete -c codezy -a ${c}`)
} else {
  console.log(`Register-ArgumentCompleter -Native -CommandName codezy -ScriptBlock { param($w) ${cmds.map((c)=>`'${c}'`).join(',')} | Where-Object { $_ -like "$w*" } }`)
}
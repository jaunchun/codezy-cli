# CODEZY

**A coding agent for your terminal, running on the models you already have.**
Local **Ollama** by default, any **OpenAI-compatible** endpoint if you prefer.
It reads your folder, proposes real diffs, runs commands, and asks before it
writes.

![version](https://img.shields.io/badge/version-3.2.0-6FA8FF) ![node](https://img.shields.io/badge/node-%E2%89%A518-6FA8FF) ![license](https://img.shields.io/badge/license-MIT-green)

**Node.js 18+** · Windows, macOS, Linux · no account, no telemetry

```bash
npm i codezy-cli            # add -g to put codezy on your PATH
ollama pull qwen2.5-coder:7b
codezy
```

`codezy` opens the agent REPL in your current folder. It reads, searches,
edits and runs commands with per-action approval. Switch modes from the prompt:

```text
╭────────────────────────────────────────────────────────────────────────────────────╮
│   ██████╗ ██████╗ ██████╗ ███████╗███████╗██╗   ██╗ │ runtime                      │
│  ██╔════╝██╔═══██╗██╔══██╗██╔════╝╚══███╔╝╚██╗ ██╔╝ │ ollama                       │
│  ██║     ██║   ██║██║  ██║█████╗    ███╔╝  ╚████╔╝  │ qwen2.5-coder:7b             │
│  ██║     ██║   ██║██║  ██║██╔══╝   ███╔╝    ╚██╔╝   │ 65,536 ctx                   │
│  ╚██████╗╚██████╔╝██████╔╝███████╗███████╗   ██║    │ 11 tools                     │
│   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝   ╚═╝    │ thinking on                  │
│                                                     │ agent v3.2.0                 │
│                                                                                    │
│  a coding agent in your terminal                                                   │
│                                                                                    │
│  ▎ start here                                                                      │
│  ❯ explain this codebase                  ❯ fix the failing tests                  │
│  ❯ add a feature                          ❯ review my diff                         │
│                                                                                    │
│  hello                                                                        │
│                                                                                    │
│  /help commands   /model switch   /theme palette   /exit quit                      │
╰────────────────────────────────────────────────────────────────────────────────────╯

❯ explain the auth flow
```

Type `/` and the command palette opens under the prompt; keep typing to filter,
Tab to complete. `/settings` is a live screen, not a poster: every row that
can change is numbered, you type the number, you get the choices, and the
choice applies right away.

```text
$ /settings
╭─ settings ────────────────────────────────────────╮
│  ▎ appearance                                      │
│   1 theme        graphite              /theme paper  │
│   2 accent      ▸● cobalt ● lime ● amber ● magenta  │
│   3 thinking    on                    /thinking     │
│   · provider    ollama                               │
│  ...                                                │
│    pick a number to change it · b goes back · q closes╯
settings ❯ 1
╭─ theme ────────────────────────────────────────────╮
│  1  graphite   ▸ current                             │
│  2  paper                                            │
│  3  contrast                                         │
╰─────────────────────────────────────────────────────╯
settings ❯ 2
✓ theme paper · cobalt
```

Type the number, pick from the choices, and the change lands at once — theme,
accent, thinking, model, fast model, mode, approvals and the workspace root.
`b` goes back one step, `q` closes the screen, and any slash command still
works while it is open. Theme, accent and thinking are saved to
`~/.codezy/settings.json`; the rest live for the session.

Four modes, one engine:

- **agent** — tools with per-action approval (the default).
- **chat** — answers only, no tools, no file changes.
- **plan** — read-only research; never writes or runs.
- **auto** — tools, gated actions approved automatically.

Move between them with `/mode` or start there directly: `--chat`, `--plan`,
`--auto`.

## Why this one

- **Local first.** Ollama at `http://127.0.0.1:11434` is the default. With it
  selected, there is no account, no telemetry and no prompt leaving the machine.
- **Approval before impact.** Writes and commands land in a real approval card.
  `y` allows once, `a` trusts that tool for the session, anything else denies.
- **One REPL, four modes.** No second binary, no flag archaeology — switch
  between chat, plan, agent and auto without leaving the session.
- **A terminal that reads like a tool.** Graphite, paper and contrast surfaces,
  hairline rules, a ledger of every tool call, and a live braille phase spinner.
  No step counters; a box is reserved for a decision.
- **The same settings as the desktop app.** Providers, model choice, memory,
  themes and skills live in `~/.codezy/settings.json`, shared by both surfaces.
- **Scriptable when you need it.** `codezy exec` writes the answer to stdout,
  activity to stderr, and returns stable exit codes.

## The spinner is part of the interface

A local model can think for ten seconds. Silence is the wrong answer. The REPL
uses [`nanospinner`](https://www.npmjs.com/package/nanospinner) — the small,
proven terminal spinner behind many Node CLIs — to hold one quiet line while the
model works:

```text
  ⠋ Thinking… · 3s
  ⠙ Run npm test… · 12s
  ✓ 43s · 12,041 tokens
```

- The label follows the **live phase**, not a generic dot: `Thinking`,
  `Read(src/main.ts)`, `Run(npm test)…`.
- Elapsed seconds appear after two, so a slow model never looks frozen.
- Frames are dropped while you are typing or answering an approval; the line
  you are on is never wiped.
- It writes to **stderr** and is TTY-gated, so pipes and CI stay byte-clean.
- It drives the loop itself instead of `start()`, which keeps Ctrl+C able to
  interrupt a turn rather than exiting the process.

That is the only runtime dependency in the CLI. One dependency, used
deliberately.

## Requirements

You need a model, either way:

- **Local (default)** — [Ollama](https://ollama.com) running at
  `http://127.0.0.1:11434` with a model pulled:

  ```bash
  ollama serve
  ollama pull qwen2.5-coder:7b
  ```

- **Cloud or another local server** — any OpenAI-compatible endpoint. Add the
  provider (base URL + API key) once in **Settings → Models**, then select it
  with `/provider`. `--url` and `--model` override the endpoint and model for
  one run.

Git is optional, but `/diff` and the doctor's git check use it when present.
Settings, memory and skills are shared with the CODEZY desktop app at
`~/.codezy/settings.json` (or your custom data folder). The desktop app's
**Open terminal interface** button launches the same unified REPL from the copy
bundled with the installer; the npm package updates independently.

## Quick start

From a checkout, install the local folder or run it directly:

```bash
npm i -g .                       # install this package folder globally
node index.mjs --help            # no global install
```

Everyday commands:

```bash
codezy                              # agent REPL (the default)
codezy --chat                       # chat REPL: answers only
codezy --plan                       # read-only research REPL
codezy "explain this file"          # one-shot chat, prints and exits
codezy -p "summarize this diff"     # explicit one-shot
codezy exec "fix the failing tests" --dir . --auto
codezy doctor                       # node · settings · endpoint · model · git
```

Piped stdin works too:

```bash
cat error.log | codezy -p "why is this failing?"
```

Piped output is plain text: no ANSI, no spinner, no banner. If a script wants
colour anyway, set `CODEZY_COLOR=truecolor` (or `FORCE_COLOR=1`).

## Modes and one-shot runs

| Mode | Start it with | What it does |
| --- | --- | --- |
| **Chat** | `codezy --chat` | Answers only. No tools, no edits, no commands. |
| **Plan** | `codezy --plan` | Reads and researches; never writes or runs. |
| **Agent** | `codezy` | Reads, searches, edits and runs commands inside `--dir`. Writes and commands ask for approval. |
| **Auto** | `codezy --auto` | Same as agent, with gated actions approved automatically. |
| **Agent one-shot** | `codezy exec "…"` / `codezy run "…"` | One task, tools, approvals, final answer, exit. Ideal for scripts and CI. |

`/mode <chat|agent|plan|auto>` switches without restarting the session. A model
that cannot call tools still works: the agent falls back to classic edit blocks
with the real file contents and tells you why. When Ollama `/api/show` reports no
tool support, the welcome panel carries a note instead of pretending the tools
will run.

## Commands

| Command | What it does |
| --- | --- |
| `codezy` | Agent REPL. |
| `codezy --chat` | Chat REPL without tools. |
| `codezy --plan` | Plan REPL: read-only research. |
| `codezy "prompt"` | One-shot chat; prints the answer and exits. |
| `codezy -p "<prompt>"` | One-shot chat; omit the value to read stdin. |
| `codezy exec "<prompt>"` | One-shot **agent** run: tools + approvals, then exit. |
| `codezy run "<prompt>"` | Alias for `exec`. |
| `codezy doctor [--json]` | Health check; `--json` prints one machine-readable line. |
| `codezy config` | Inspect the shared settings surface. |
| `codezy sessions` | Browse saved agent sessions. |
| `codezy skills` | List installed skills. |
| `codezy completions <shell>` | Print shell completions. |
| `codezy update [--check]` | Print the update command and current version. |
| `codezy --version` | Print the CLI version. |
| `codezy <command> --help` | Detailed help for `exec`/`run` or `doctor`. |

## Options

| Option | Meaning |
| --- | --- |
| `-p, --print <prompt>` | One-shot mode; omit the value to read stdin. |
| `-a, --agent` | Use the tool-calling agent (tools + approvals). |
| `--chat` | Open the REPL in chat mode (no tools). |
| `--plan` | Open the REPL in read-only plan mode. |
| `--mode <m>` | Start in `chat`, `agent`, `plan` or `auto`. |
| `-c, --continue` | Resume the most recent saved agent session. |
| `--model <id>` | Override the model from settings for this run. |
| `--dir <path>` | Workspace root / linked folder. Alias: `--root`. Defaults to the current folder for `exec`. |
| `--url <url>` | Ollama or OpenAI-compatible endpoint for this run. |
| `--ctx <n>` | Context window in agent mode. Default: `65536`. |
| `--auto` | Approve every gated write and command automatically. |
| `--output-format <fmt>` | One-shot output: `text` (default), `json`, `stream-json`. |
| `--preview` | Print the terminal chrome and exit; no model, no session. |
| `-h, --help` | Show help. |
| `-V, --version` | Show the version. |

## Themes

The terminal and the desktop app share one palette (the desktop adds its
singularity backdrop on top):

```text
/theme                     show the current theme and accents
/theme paper               switch surface
/theme graphite cobalt     surface + accent in one line
```

Surfaces: **graphite** (default), **paper**, **contrast**. Accents: **cobalt**
(default), **lime**, **amber**, **magenta**. Legacy names (`midnight`, `ember`,
`mint`, `slate`, `dark`, `light`, `acrylic`, `singularity`) are accepted
forever and resolve to the nearest current surface, so old settings never
break.

## Approvals and safety

The agent asks before it changes something:

```text
╭─ approve · write_file ─────────────────────────────────────────────────╮
│  write src/main.ts (12 lines)                                          │
│                                                                        │
│  y once   a always   n no   ? details                                  │
╰────────────────────────────────────────────────────────────────────────╯
```

- `y` approves this action once.
- `a` trusts this tool for the rest of the session.
- anything else (including Enter) denies it.
- `--auto` approves every gated action; `/auto` toggles the same behavior in
  the REPL.

**Approval is real.** Without `--auto` and without an interactive TTY, gated
tools are denied instead of silently running. Use `--auto` only on a branch or
a disposable checkout: the CLI does not create the desktop app's pre-edit
backups, though path confinement and destructive-command rejection still
apply.

## REPL commands

Type `/help` for the full list. The most useful commands:

| Command | Does |
| --- | --- |
| `/mode <chat\|agent\|plan\|auto>` | Switch modes without restarting. |
| `/theme [surface] [accent]` | Change the terminal palette. |
| `/settings` | The live settings screen: type a number to change any row. |
| `/model [id]` · `/provider` | Switch model or provider; `/model fast <id>` sets the cheap model for summaries. |
| `/thinking on\|off` | Long mode: reason-first replies and a doubled step budget. |
| `/auto [on\|off]` | Toggle automatic approval. |
| `/root [dir]` | Show or set the workspace root. |
| `/todos` | Show the current checklist. |
| `/tools` · `/mcp` | List agent tools, or MCP server status. |
| `/diff` · `/undo` | Inspect or revert the newest approved change. |
| `/search <q>` | Web search without involving the model. |
| `/scout <q>` | Read-only research in fresh context; files a digest back into the conversation. |
| `/compact` | Summarize older turns to free context. |
| `/usage` · `/cost` | This session's tokens, or the usage heatmap. |
| `/resume [n]` | List or restore saved agent sessions. |
| `/export [file]` | Save the transcript. |
| `/clear` | Start a fresh context. |
| `/exit` | Quit (Ctrl+C also works). |

Sessions are saved under `~/.codezy/agent/`. `-c` / `--continue` resumes the
most recent one; `/resume` picks another.

## Serving scripts and CI

In one-shot mode, the final answer goes to **stdout** and tool/approval activity
goes to **stderr**, so pipes stay clean:

```bash
codezy exec "run the tests and summarize failures" --dir . --auto \
  --output-format json > result.json
```

Exit codes are stable:

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Runtime error (endpoint, model, tool or turn failure). |
| `2` | Usage error (bad flag or command). |

For unattended runs, prefer a branch or a disposable checkout. `--auto` is
powerful by design.

## Doctor and common fixes

`codezy doctor` checks Node, the package, settings, the data folder, the
endpoint, the active model, hooks, MCP and git. `codezy doctor --json` is the
same report on one line. A stopped Ollama is a warning, not a failure.

| Symptom | Fix |
| --- | --- |
| `codezy` is not recognized | Reopen the shell after `npm i codezy-cli` (add `-g` for a global install); make sure npm's global prefix (`npm prefix -g`) is on `PATH`. |
| Can't reach Ollama | Start `ollama serve`, or point at another endpoint with `--url`. |
| Model isn't installed | `ollama pull <model>`; check with `ollama list`. |
| "does not support tools" | Pick a tool-capable model (for example `qwen2.5-coder:7b`, `qwen3:8b`, `llama3.1:8b`), or stay in chat mode and use edit blocks. |
| Approval is denied in a pipe | Add `--auto` (only on a branch/disposable checkout). |
| 401 / 403 from a cloud provider | Re-enter the key in **Settings → Models** and confirm the base URL (often ends in `/v1`). |
| Wrong or old version | `codezy --version`, then `npm update -g codezy-cli`. The desktop app's installer does not update a global npm CLI. |

## Data and privacy

- Local inference stays on `127.0.0.1`. There is no telemetry endpoint.
- A cloud provider receives the prompt only when you select one.
- Web search sends only the query to DuckDuckGo/Wikipedia (or fetches the URL
  you ask for); results are not persisted as pages.
- Settings and provider keys live in `~/.codezy/settings.json` — never commit
  that file.
- Agent saves live in `~/.codezy/agent/`; the main log is
  `~/.codezy/logs/main.log`.

## More help

```bash
codezy --help
codezy exec --help
codezy doctor --help
```

The [CODEZY field manual](https://github.com/jaunchun/Codezy/blob/main/docs/index.html)
covers models, agent tools, the desktop app and all 37 known errors with a cause
and a fix.

## License

MIT · <https://github.com/jaunchun/codezy-cli>

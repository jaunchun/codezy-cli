# CODEZY v2 — Agent Orchestration Harness (handoff brief)

> **STATUS (phase 16 - the CLI is its own repo):** the terminal agent moved
> out of the desktop tree. Behavior and install shape are unchanged: the npm
> package is `codezy-cli`, the executable is still `codezy`.
>
> (1) THE MOVE. `codezy/cli` is now the sibling `codezy-cli` directory
> (moved, not copied). lib/, node_modules/, launch.bat/launch.sh and the
> whole package moved with it; `codezy/cli` no longer exists.
>
> (2) THE PACKAGE. The npm package is `codezy-cli` (on the registry since
> 3.1.5) with `bin: { "codezy": "./index.mjs" }`; the version stays 3.1.6.
> repository/homepage/bugs point at
> https://github.com/jaunchun/codezy-cli. `index.mjs`, `print.mjs`,
> `codezy.mjs`, `codezy-v2.mjs`, `doctor.mjs` and lib/ are the same files;
> the help install line is `npm i codezy-cli` (add -g for PATH). The
> lockfile follows the package name and `npm ls` is clean.
>
> (3) THE DESKTOP WIRING. Main-process imports for the harness and the web
> core resolve `../../../codezy-cli/lib/*`; the dev terminal default is
> `../codezy-cli/codezy.mjs`; global detection looks for
> `node_modules/codezy-cli`; the npx fallback is
> `npx -y -p codezy-cli codezy`. electron-builder still ships the CLI to
> `resources/cli` (installed-app paths unchanged) and only the source path
> is `../codezy-cli`; the explicit file filter still keeps node_modules and
> repository metadata out of the installer.
>
> (4) DOCS + TESTS. Every install prompt is `npm i codezy-cli`; the desktop
> README, field manual (install card, terminal section, E05/E06, changelog),
> both sites and the CLI README point at the new package/repo. Tests were
> repointed at the sibling tree with the package-name/path pins updated;
> batch2's file-completion fixture now types @src (the old @cli folder left
> the app tree).
>
> VERIFIED: 48 / 48 batches, 2,142 PASS lines; `npm run typecheck` clean;
> docs-check 26/26 and docs-search-check 16/16; `npm run build` and
> `npm run dist`. Installer CODEZY-Setup-3.1.6.exe is 113,579,681 bytes,
> SHA-256 BB5E97F4FF4325E0887B6224244EE0A2C39AEF92D5B72B0FE002F49166B4E93E,
> and installed silently (exit 0). Built and installed app.asar are both
> 15,820,994 bytes and byte-identical, SHA-256
> 24639B1B5B8B122233B0075F508A1928B099B77BAFB942B84DE54B965B602BA8;
> verify-installed is 11/11, the bundled CLI is codezy-cli@3.1.6 and
> getVersion() reports 3.1.6; the installed CODEZY.exe reports FileVersion
> 3.1.6 / ProductVersion 3.1.6.0. Authenticode status: NotSigned (the
> documented unsigned-build path).
>
> STILL OWNER-GATED: the CLI repo is initialized and committed locally but
> has no remote push yet; `npm publish` of 3.1.6 is not run (npm login is
> present as jaunchun, and the registry's latest is 3.1.5); the signing-cert
> decision/review remains open; no Linux/macOS runtime check (config only).
> Deletion of the Oct-9 TikTok scratch still awaits approval.
>
> **STATUS (phase 15 - 3.1.6: the CLI home page and the spinner):**
> the terminal-shaped release on top of 3.1.5; the harness did not move.
>
> (1) THE CLI HOME PAGE. cli/README.md was rebuilt as the npm package page:
> badges and a three-command quickstart, a terminal still, a practical
> "Why this one", the chat-vs-agent table, the spinner explained, every
> command and flag, approvals and safety, both REPL references, the
> one-shot/CI contract, the doctor table, data/privacy and a manual link.
> cli/package.json sharpened its description and keywords, gained a bugs
> URL, and now points homepage at the new page.
>
> (2) THE SPINNER. nanospinner stays, and is documented as the agent
> REPL's live phase line: the label follows thinking / read file / run
> command, elapsed seconds appear after two, frames drop while typing or
> answering an approval, and the line is stderr-only and TTY-gated. The
> loop is still driven directly instead of start(), so Ctrl+C interrupts
> a turn. The banner reads CODEZY v2 · 3.1.6 and --preview includes a
> spinner sample. The chat TUI keeps its builtin-only spinner.
>
> (3) VERSION + DOCS. Root, CLI and site-3d manifests and both lockfiles
> report 3.1.6; the installer name, manual title/footer/changelog, CLI
> user-agent and version-pinning tests follow. 3.1.4 stays skipped and the
> 3.1.5 notes below remain untouched as history.
>
> (4) GIT GUARD. A stray C:\.git on the verification machine made every
> folder look like a repository and broke batch4/batch6. gitDiff and the
> CLI /diff now use the same volume-root guard as gitStatus - a drive root
> is never accepted as a worktree. Behavior in normal folders is unchanged.
>
> VERIFIED: 48 / 48 batches, 2,142 PASS lines; `npm run typecheck` clean;
> docs-check 26/26 and docs-search-check 16/16; `npm run build` and
> `npm run dist`. Installer CODEZY-Setup-3.1.6.exe is 113,579,642 bytes,
> SHA-256 C2690DDA0C10932A24DC5A4B53A6EE4BADDFDBB1DE03DD09C20FB060BFB9C027,
> and installed silently (exit 0). Built and installed app.asar are both
> 15,820,904 bytes and byte-identical, SHA-256
> 53C32F14270D2A45EAB73CF222AD1ADBA1CA57779F76E4E6E3ED15210963283F;
> verify-installed is 11/11, carrying the six-pane Settings UI and a
> bundled CLI getVersion() of 3.1.6; the installed CODEZY.exe reports
> FileVersion 3.1.6 / ProductVersion 3.1.6.0. Authenticode status: NotSigned
> (the documented unsigned-build path).
>
> STILL OWNER-GATED: `npm publish` needs npm login/OTP; the GitHub release
> v3.1.6 is not published; the signing-cert decision/review remains open;
> no Linux/macOS runtime check (config only). Deletion of the Oct-9 TikTok
> scratch still awaits approval.
>
> **STATUS (phase 14 - the release surface: Settings, the manual, the CLI):**
> the polish pass that makes 3.1.5 feel finished rather than merely capable.
>
> (1) SETTINGS. The single long scroll is now six categories - General, Models,
> Agent, Tools, Data and About. Every original `.settings-section` label
> stays in the DOM inside its pane, so the palette jumps, deep links and
> existing tests still resolve; a jump switches category, scrolls at once and
> re-scrolls after the pane paints. Notifications/input moved to General, the
> supported-model guide to Models, MCP to Tools, and no control was dropped.
> The responsive layout keeps the sidebar and panes usable at narrow widths.
>
> (2) THE MANUAL. docs/index.html is a three-column shell: the eight
> categories on the left (split Guide/Reference), the reading column in the
> middle, and "On this page" on the right. One top search indexes section
> titles, subheadings and all 37 errors; `/` or Ctrl+K focuses it, arrows and
> Enter navigate, and choosing an error clears the chips and opens that card.
> Scrollspy follows both rails; the layout collapses cleanly at 1040 px and
> 820 px. All 37 entries keep their exact text, cause and fix; strict
> monochrome, no fonts/images/analytics, file:// safe.
>
> (3) THE CLI. `--help`, `exec --help` and `doctor --help` now print
> command-specific pages with aligned options, a "what it does" block and
> exit codes. The agent REPL banner reads capability from Ollama `/api/show`
> and refreshes it on `/model`; an unprobed model says "not reported" rather
> than guessing. The npm identity is `codezy@3.1.5` (root, cli/package.json,
> both lockfiles); the old `codezy-cli` name is gone from the tree.
>
> VERIFIED: 48 / 48 batches, 2,142 PASS lines; `npm run typecheck` clean;
> docs-check 26/26 and docs-search-check 16/16; no horizontal overflow at
> 1440 px or 430 px; `npm run build` + `npm run dist`. Installer
> CODEZY-Setup-3.1.5.exe is 113,579,425 bytes and installed silently
> (exit 0). Installed asar is 15,820,820 bytes, SHA-256 matches the built
> asar, carries the six-pane Settings UI and reports codezy 3.1.5; bundled
> chat TUI getVersion() reports 3.1.5. Authenticode status: NotSigned (the
> documented unsigned-build path).
>
> STILL OWNER-GATED: `npm publish` needs npm login/OTP; the GitHub release
> v3.1.5 is not published; no Linux/macOS runtime check (config only).
>
> **STATUS (phase 13 — capability-aware routing, readable errors, a short
> manual):** the release that stops pretending every model can run every
> mode.
>
> (1) ROUTING + PROMPTING. Agent mode is on for existing settings once,
> through the `agentModeMigrated` marker; `v2` still needs a linked folder
> and a model that advertises `tools`. Before any schema is attached the
> app probes Ollama `/api/show` and reads `capabilities` (cloud providers
> are assumed capable until a 400 says otherwise). A completion-only model
> such as codellama now gets classic edit blocks with the REAL folder
> contents (secrets, binaries and node_modules skipped), a notice, and one
> classic retry on "does not support tools" — never a raw 400. The system
> prompt gained a setup card and a synthetic turn immediately before the
> question (folder, mode, web, limits); small models weight the newest
> turn. The picker badges installed models tools / chat only, and Settings
> has a supported-model guide with RAM guidance and pull commands.
>
> (2) ERRORS + LOOP GUARD. Error toasts are WHAT + FIX, with the raw engine
> text under "Technical details" and an explicit close. The shared harness
> now skips a third consecutive identical read-only call and gives the
> model ONE tool-free turn to answer from evidence it already has; live
> qwen2.5-coder:7b went from 11 repeated web_fetch calls / iteration cap to
> a six-step answer citing Ollama v0.40.11 in 12s. Classic codellama:13b
> produced the exact `===FILE: index.html` hunk and applied "Hello from
> CODEZY" in 27s on the same prompt probe.
>
> (3) THE MANUAL. docs/index.html is eight plain-language sections / 37
> collapsible, searchable errors (1,429 lines, 87.7 KB; was 18 sections,
> 153 KB), dark-only monochrome, dependency-free and file:// safe. Every
> error keeps its exact text, cause and fix; search opens its hit; E24 now
> documents the duplicate guard.
>
> VERIFIED: 48 / 48 batches, 2,124 PASS lines; `npm run typecheck` clean;
> `npm run build` + `npm run dist`; installer CODEZY-Setup-3.1.5.exe
> 113,576,455 bytes installed silently (exit 0). Installed app.asar
> 15,805,108 bytes contains the capability routing, readable notices and
> duplicate guard; the bundled CLI now ships package.json and
> getVersion() reports 3.1.5. Live settings patched to webSearch "auto"
> and agentModeMigrated true (v2 already true, qwen2.5-coder:7b).
>
> **STATUS (phases 10–12 — the web, the preview, the terminal):** three
> things the user actually uses, all fixed at the root.
>
> (1) THE WEB. The root cause of "web search doesn't work" was NOT the
> model: DuckDuckGo answers a minimal header set with HTTP 202 and an
> anti-bot page, and the old code parsed that as "no results" (202 is a
> 2xx!). The search core moved into cli/lib/search.mjs (one core, two
> shells — the CLI's /search, the agent's web_search tool and the app all
> share it) and now: sends a real browser header set, DETECTS the 202
> challenge instead of parsing it, falls back to key-free sources
> (Wikipedia's API + DuckDuckGo's instant answers) when it is rate-limited
> (Wikipedia's article rides along with the results — its infobox carries
> "Stable release X"), and DIGS: keyLines() pulls the answer-bearing line
> out of the snippets and the pages, answerToken() finds the version or
> price that sits right after an intent word, answerKind() keeps a price
> question from being answered with a version, and the domain weighting
> prefers the subject's own site + Wikipedia over an aggregator. The block
> then LABELS the answer ("## The web answer — the live web says the
> current value is: 0.40.6") — a 7B given a wall of text picks the wrong
> number; given one labelled value it quotes it. The results also ride
> WITH the question (a user-role turn right before it) and the system
> prompt says the model HAS the web — otherwise it still answers "I
> cannot browse the internet" with the results sitting right there. The
> app gained a `web` chip (auto | always | off) and a quiet "searched the
> web · 8 results · 2 pages read" line. Verified live: Ollama 0.40.6,
> Node v26.12.0, Intel CEO Lip-Bu Tan, and the user's own "whats the
> latest wemmbu upload" now returns a real video + link.
>
> (2) THE LIVE SITE PREVIEW. The chat's linked folder is served over a
> custom scheme (codezy-preview://<sessionId>/<path>, so relative assets
> resolve like a real site), a recursive watcher on the folder pushes a
> `previewreload` event and the pane reloads, and the pane (opened from
> the title bar) frames the page at desktop/tablet/phone width or points
> at a dev server. The renderer CSP grew a `frame-src` for the scheme. The
> preview IS the files on disk — nothing is copied or rewritten.
>
> (3) "OPEN TERMINAL INTERFACE" DID NOT WORK IN AN INSTALLED APP: the
> handler looked for `cli/codezy.mjs` next to the app, and the installer
> ships ONLY out/** + package.json (the CLI is a separate npm package) —
> so the button always answered "CLI script not found". Now the chat TUI
> SHIPS WITH THE APP as an electron-builder `extraResources` entry
> (outside the asar, because a plain `node` cannot read a file out of
> one; node builtins only, so no bundled node_modules), the command
> resolution is bundled → global install → `npx -y codezy`, the working
> directory is the CHAT'S FOLDER (never the asar), and the plan takes the
> command to run (terminalPlan gained an optional command). Verified in
> the installed app: Windows Terminal opened with
> `cmd /k node ...\CODEZY\resources\cli\codezy.mjs` and the CODEZY TUI
> came up in the project folder.
>
> (4) NANOSPINNER in the CLI (the user's request): cli/package.json now
> depends on nanospinner 1.2.2 and the agent REPL's spinner IS it —
> except that nanospinner's `start()` installs a SIGINT handler that
> exits the process, which would break "ctrl+c interrupts the turn", so
> the REPL drives nanospinner's renderer itself (loop + spin + update)
> behind a guarded stream that drops a frame while the human is typing,
> keeping the elapsed-seconds suffix. The v1 TUI keeps its own frames
> because its colour follows the user's theme palette.
>
> NEW batch46 = 33 checks (the extraction behaviourally, the web fix, the
> app wiring, the preview, nanospinner + the SIGINT trap, and the
> terminal fix incl. the plan's custom command). The installer was
> rebuilt, installed and verified; the app currently running has all of
> it.
>
> **STATUS (phase 9 — the drama, in EVERY theme):** the lesson of the
> singularity round, learned the hard way: a theme must never look like
> the app didn't change. The black-hole treatment (blocks 35–41) is
> singularity-only by design, so in the ACRYLIC theme — translucent over
> the desktop wallpaper — the whole round was nearly invisible. CSS block
> 45 now gives EVERY surface the same craft, driven by each theme's OWN
> accent instead of a hardcoded white: the horizon under the title bar,
> the seam of light above the composer, the active sidebar row wearing an
> accent rail + hairline, the breath of light behind the conversation
> column, a send button that breathes, the Thinking chip in the accent
> colour, and the agent rail's dot burning with it. In singularity the
> accent IS white, so both layers agree. The duplicate white
> `thinkHalo` keyframes were folded into the accent version. NEW batch45
> = 11 checks (block 45 exists; every surface listed above is accent-
> driven; the new block carries no fixed colour; singularity still forces
> a white accent; the motion-off guard still covers the new animations).
> VERIFIED IN THE REAL APP, not in a probe: the installed build was
> captured with Win32 `PrintWindow` (no focus stolen, nothing clicked)
> in BOTH themes, and the difference is the difference between the
> wallpaper bleeding through and the black hole burning behind the
> column. The user's setting had flipped to acrylic at 22:08 — it is
> back on singularity, where the app's look is designed to live.
> Installer rebuilt + reinstalled with block 45 (108.2 MB).
>
> **STATUS (phase 8 — the CLI gets the same looks):** the agent REPL was the
> last flat surface in the product; it now speaks the SAME visual language
> as the chat TUI (bordered cards, section rules, aligned columns) so the
> two shells feel like one product. (1) NEW `cli/lib/ui.mjs` — the chrome,
> with the colour helpers INJECTED (`setPaint`, so the shell keeps owning
> its palette and the tests render without a TTY). `card(title, rows)`
> draws `╭─ title ─╮ │ … ╰──╯`; rows are either `{ text, color }` (a free
> line) or `{ label, value, color }` (a fact row — dim label, coloured
> value, padded so the border never drifts). `rule(label)` draws a
> `label ───────` section head. THE CONTRACT (and the thing batch44
> enforces behaviourally): every row AND both borders are exactly the same
> visible width — a long value is clipped, never overflows. (2) THE HEADER
> is a card now: model · via · endpoint · context · tools · fast model ·
> thinking · workspace as a fact table, under the usual hint lines (the
> `--auto` / qwen2.5-coder notes moved INTO the shared string so they
> print once). (3) A RUN reads as a LEDGER: `1 ⎿ list dir    . · 3
> entries · 42ms` — a step counter, a padded verb column, the argument,
> the outcome, the wall time. The line builder is `activityLine()`, shared
> by the live run and the preview so they cannot drift. (4) The QUESTION
> is a card: `╭─ the agent needs a decision ─╮` with the options inside —
> and so is the APPROVAL GATE (`╭─ approve this action ─╮`, tool + what),
> because a human is deciding something in both cases. The card measures
> what is VISIBLE, so a value carrying its own colour can never push the
> border out of line (batch44 asserts it).
> (5) `/help` is structured — a `commands` section with an aligned command
> column, then a `session` section (model · workspace · thinking · gated
> tools). (6) THE PROMPT CARRIES THE MODE: `you> ` normally, `you* ` while
> thinking is on (and `/thinking` refreshes it). (7) `--preview` prints
> the whole chrome — header, a run, the question card, the stat line —
> with no model, no TTY and no side effects; `CODEZY_FORCE_COLOR=1`
> keeps the colours in a pipe. That flag is also how the look was
> REVIEWED: the preview's raw ANSI was captured and rendered in a
> terminal-styled page for a screenshot (all 15 box lines measured at
> exactly 78 columns). NEW batch44 = 21 checks (card alignment +
> truncation + paint injection + width clamp, behaviourally; the v2 wiring
> and the preview, by pin). The CLI is a separate npm package — the
> installer is untouched by this phase.
>
> **STATUS (phase 7 — the reading experience, and the looks):** the last
> visual round, verified by SCREENSHOT, not by eye: a probe page
> (`tests/.tmp/visual-probe*.html` + `probe.css`, served by
> `tests/.tmp/probe-server.mjs`) renders the REAL built stylesheet with
> mock markup, so every rule below was looked at before it shipped. Two
> fixes came straight out of the probe: the empty state's orbit read as a
> stray swoosh (now a faint full ring with one bright arc travelling it)
> and the tagline wrapped (now one line, 64ch). (1) CSS block 40 — THE TYPE
> SYSTEM: a real scale for replies (h1 1.45em → h4 1em, tight tracking,
> line-height 1.68), quiet list markers, links that underline with a
> 2.5px offset and a hover that brightens the rule. (2) CSS block 41 —
> COMPOSITION/DEPTH/MOTION: the empty state is a composition (mark under
> the orbiting ring, wordmark at 30px/light/0.42em tracking with the
> trailing letter-space optically cancelled, tagline, four starter cards
> built on a grid with a mono index + a slide-in arrow + a lit top edge,
> a kbd hint row), the conversation column gets a breath of light behind
> it (`.main-pane::before`, z-index -1 so it sits under the content), the
> in-chat usage/tasks panels become obsidian slabs, and messages ARRIVE
> (`msgRise` + a 35ms-per-row stagger, motion-off aware). (3) The earlier
> blocks (35-39) stay: the live agent rail, the breathing Thinking chip,
> the chrome pass, markdown made typographic, the obsidian overlays, the
> composer. Verified in the probe: the ledger table, the drawn task-list
> checkboxes, the quote rail, the fading rule, the code block's inset
> top light-line, the agent rail's step counter, the ruler labels, the
> active row's 2px white rail (confirmed via getComputedStyle: 2px ×
> 19.2px, opacity 1) and the title bar's 1px white-gradient horizon.
> NEW batch43 = 20 checks (type system, composition, depth, arrival +
> stagger, markup, and a monochrome-discipline pin). typecheck ✓;
> `npm run build` ✓ rebaked.
>
> **STATUS (phase 6 — the visual round):** app chrome only, no behaviour
> change, no new theme. Two additive CSS blocks at the end of
> `src/renderer/src/styles/global.css` (block 35 = the surfaces, block 36 =
> the chrome) + three small TSX/store touches. Discipline: monochrome
> (built from --text/--text-2/--text-3 only), transform/opacity/
> background-position/box-shadow only (no layout thrash), every animation
> disabled under `data-motion="off"`. (1) LIVE AGENT RAIL (`.act-rail`):
> the app's streaming line is now a bordered pill with a step counter, a
> mono label and a slow sweep of light; the dot pulses by PHASE — `thinking`
> = slow (1.9s), `running` = quick (0.85s), `done` = still. The phase rides
> the new `v2step` event: `V2Activity` gained `phase?: 'thinking' |
> 'running' | 'done'` (app.ts), the store sets it from the event, and
> `ChatView`'s new `ActivityRail` component renders it. (2) THINKING CHIP
> breathes when lit (`thinkHalo`, 3.4s). (3) EMPTY STATE: `.empty-mark`
> wraps the cube logo with a breathing halo + a conic-gradient arc of light
> orbiting it (`markOrbit`, 9s, masked to a hairline annulus) — the mark is
> now a piece of the singularity, not a logo on a page. (4) OBSIDIAN
> HAIRLINES: code blocks get an inset top light-line, their header a
> gradient; the user bubble lifts a hair on hover; composer chips and the
> quick follow-up chips lift a pixel. (5) CHROME (block 36): sidebar
> section labels become uppercase ruler marks with a fading hairline; the
> active row wears a 2px rail of light (white-hot in singularity) that
> animates in; rows nudge 1px on hover; in singularity the title bar gets
> a horizon line, the wordmark a soft bloom, the logo a drop-shadow, the
> composer a seam of light, and the sidebar's inner edge brightens.
> (6) MARKDOWN MADE TYPOGRAPHIC (block 37): remark-gfm was already enabled,
> so tables/task-lists/strikethrough reached the DOM unstyled — a reply with
> a table rendered as a raw white-bordered browser table in a black app.
> Now: tables read as a ledger (hairline grid, mono uppercase header, row
> hover), task-list checkboxes are actually drawn, quotes get a rail of
> light, rules a fading hairline, emphasis/images handled. (7) THE
> OVERLAYS (block 38): in singularity, modals / pickers / context menus /
> the palette / toasts / the update pill are obsidian panels with an inset
> top light-line; the scrim deepens and blurs the hole behind it.
> typecheck ✓; `npm run build` ✓ rebaked; full suite green. NEW batch42 =
> 30 checks (blocks 35–38 exist, the rail's three phase pulses + sweep, the
> chip halo, the orbiting arc, ruler labels + active rail, the horizon and
> the seam, GFM styling, the ActivityRail component + the phase on
> V2Activity, and a MONOCHROME-DISCIPLINE pin: no colour literal and no
> hsl() may enter the new blocks, and every animation needs a motion-off
> guard).
>
> **STATUS (phase 5 — questioning, Thinking long mode, live progress):**
> three human-facing upgrades, all sharing one core. (1) QUESTIONING: new
> exported `ASK_USER_TOOL` schema + `runAgent({ askUser })` — when the host
> passes an async `askUser(question, options[])`, `ask_user` joins BOTH the
> tool schema and the registry (merged after `delegate`, never when the host
> can't deliver answers). The model's call CHECKS first (non-empty, ≤2000
> chars) and then literally parks the chain on the host's promise; an empty
> answer returns "No answer given — proceed with your best judgement". v2's
> REPL wires `askRealUser`: spinStop, yellow ❓ + options list, parks on a
> module-level `pendingAsk` that the wire `'line'` handler resolves with the
> next typed line; Ctrl+C resolves it as skipped instead of hanging. Print/
> one-shot passes `askNoOne` (instant "no user available" stub) so headless
> never blocks. SYSTEM names `ask_user` + tells the model to ask ONE focused
> question when a decision is genuinely the user's. (2) THINKING (long
> mode): persisted `settings.thinkingMode` (types + DEFAULT_SETTINGS) —
> the app's new composer **Thinking** chip (`.thinking-chip`, inverted+halo
> when lit, `setThinking` persists via updateSettings, hydrates on boot)
> and the REPL's `/thinking [on|off]` (SLASH + /help + static help) both
> drive it. Effect everywhere: a `THINKING_MODE` reason-first system section
> (restate → plan → alternative rejected → verify), chat:send shifts
> `target.effort` to 'deep', runV2's effort becomes
> `settings.thinkingMode ? 'deep' : (session.effort ?? settings.effort)`
> (deep = 30-step budget), REPL `maxIter: THINKING ? 16 : 8`. (3) LIVE
> PROGRESS: runAgent now emits `onEvent({type:'model'})` before every model
> call and `{type:'tool_start'})` before every tool (both fire BEFORE the
> step, `tool` stays after); the v2 REPL relabels the running spinner live
> (`step 3: thinking` / `step 3: run_command npm test…` via new `spinSet`
> + shared `eventArg()`), prints a dim `↩ checklist still open` line on
> nudges, and closes every run with `✓ N step(s) · X tokens · Ys`. The app
> bridge forwards the two start events as a NEW `v2step` ChatEvent
> (activity-only — no trace row until the matching `v2tool` lands).
> `harness.d.mts` caught up with reality: widened `V2Event` union
> (tool|tool_start|model|nudge|retry|end + attempt/wait/sub/depth),
> `ASK_USER_TOOL`/`PARALLEL_SAFE`/`DEFAULT_STALL_MS`/`DEFAULT_MAX_WAIT_MS`/
> `isTransient`/`repairJson`/`parseTextToolCall`/`fitContext` exports,
> `stallMs`/`maxWaitMs` call options, `finishGuard`+`askUser`+`retries`
> options, `usage`+`stopped` result shape. NEW batch41 = 33 checks
> (ask_user behavior: park/steer/verbatim answer, absent-without-host,
> blank-question rejection, empty-answer fallback; event sequence
> model→tool_start→tool→model→end; source pins for all three features +
> the app pipeline). Full suite = **41 batches ALL PASS**; typecheck ✓;
> `npm run build` ✓ rebaked; installer rebuilt to match the final tree.
> Note: questioning is a TERMINAL-agent feature — the app's runV2 passes no
> askUser, so the app's agent mode is behaviorally unchanged by (1).
>
> **STATUS (phase 4 — harness super-round: dual models, endurance, scouting):**
> the terminal agent (`codezy-v2.mjs` + shared `lib/harness.mjs`) is now a
> long-session machine — desktop app normal mode untouched by design. (1)
> DUAL MODELS: new `fastModel` settings field (app types + DEFAULT_SETTINGS
> carry it, UI ignores it; `patchSettings` merges over disk so app saves can
> never drop it). v2 boots `FAST = String(settings.fastModel || '')`;
> `/model fast <id|off|clear>` switches it session-only, `/model` no-arg and
> `/help` show both roles. `call()` took `model: modelOverride` (default
> always MAIN). Compaction summaries and /scout route to FAST when set —
> grunt work never burns main-model context. (2) `/scout <q>`: fresh-context
> READ-ONLY research run — registry filtered to list_dir/read_file/
> grep_search/glob/web_*, sub-tools only, `allowDelegate: false` (depth-0),
> maxIter 5, retries 1, fast model when set; digest is filed into history as
> a `[scout report: …]` pair + autosave. Added to SLASH, v2 `/help`, static
> `codezy --help` (AGENT COMMANDS row + footer). (3) ENDURANCE: `ollamaCall`
> now streams NDJSON with a stall watchdog (`DEFAULT_STALL_MS = 90_000`; no
> chunk for 90s → abort → retriable `StallError`, never an AbortError —
> caller aborts stay interrupt-class and are rethrown as AbortError;
> plain-JSON responders keep the old one-shot path so mocks/proxies still
> work). `openaiCall` gained a total-wait cap (`DEFAULT_MAX_WAIT_MS =
> 600_000` → retriable `WaitTimeoutError`). `isTransient` classifies both
> watchdog errors as retriable. (4) FINISH GUARD: `runAgent({ finishGuard })`
> — final text while a checklist item is `in_progress` → nudge message pushes
> the model back into the loop, `nudges` capped at 2 (never a nag-loop),
> wired in `turn()` off `registry.todo_write` state. NEW batch40 = 22 checks
> (loopback servers: NDJSON stream parse with stats, JSON fallback,
> stall→StallError with timing, caller-abort passthrough, openai wait cap,
> guard once/cap/absent, 2-stall-then-recover retry, source pins incl. the
> app field). Full suite = **40 batches ALL PASS** (live batches up);
> typecheck ✓; `npm run build` ✓ rebaked. Smoke: direct electron boots and
> stays alive on the real profile — earlier silent "deaths" were closed
> preview windows + single-instance lock races (a lock loser quits
> pre-whenReady with NO log line, by design at `src/main/index.ts:429`).
> Installer built: `dist/CODEZY-Setup-3.1.5.exe` (108.2 MB) + blockmap.
>
> **STATUS (phase 3c — "way more" round, 3.1.5):** version bumped 3.1.3 →
> 3.1.5 everywhere (root + `cli/package.json`, batch34 equality pin); 3.1.4
> skipped by request. APP: always-on-top (createWindow + live settings:set +
> Settings row), start-hidden (gated on tray + first window; row renders only
> while tray on), zoom persisted (600ms-throttled `patchSettings({zoomLevel})`,
> restored at createWindow), one-time win32 tray balloon on first
> close-to-tray (`trayBalloon` in tray.ts), `render-process-gone` → log +
> capped(3) auto-reload + unresponsive/responsive logging, `app:startOllama`
> IPC (shared `ensureOllama`, one-boot guard) + `bootOllama()` store action
> + Sidebar offline dot is a button (`.status-row.clickable`), `app:openLogs`
> IPC + Settings → Diagnostics "open logs folder", NEW `src/main/deeplink.ts`
> (pure `findDeepLink`/`sessionIdFromLink`/`PROTOCOL`) +
> `setAsDefaultProtocolClient` at boot + `open-url` (mac, early) +
> launch/argv + second-instance scan → `handleDeepLink` logs +
> `revealWindow()` (extracted; second-instance uses it), web Notification
> `onclick` → `window.focus()`. CLI: `codezy doctor --json` (only `json`
> whitelisted under doctor — bogus flags still exit 2; one JSON line
> `{version, ok, errors, warnings, endpoint, model, checks[]}` with ANSI
> stripped from fields; exit codes unchanged; help line added). README:
> `## What's new in 3.1.5` + TOC + Settings/CLI docs (all new text — no
> historical "What's new" edits). batch39 = 46 checks; suite green.

> **STATUS (phase 3b — QoL round: tray, startup, crash log, zoom):** four
> user-facing quality-of-life features, all wired through Settings. (1) NEW
> `src/main/tray.ts` — tray icon behind "minimize to tray": a generated
> 16×16 monochrome disc embedded as base64 PNG (NO asset file — build/ is
> not shipped), left-click toggles show/hide, menu = Open CODEZY / Open
> data folder (shell.openPath on ~/.codezy) / Quit. syncTray(enabled,
> actions) creates/destroys on demand. (2) Close-to-tray: the ✕ hides the
> window when `settings.minimizeToTray` (close handler e.preventDefault +
> self.hide()), a real quit bypasses via a `quitting` flag set in
> before-quit; second-instance now also shows a HIDDEN window (was only
> restore+focus). (3) Launch at login: `applyLoginItem` wraps
> app.setLoginItemSettings({openAtLogin}) — applied at boot and live on
> change, try/caught for DEs that don't support it. (4) NEW `src/main/
> log.ts` — ~/.codezy/logs/main.log: launch line (version/platform/arch),
> uncaughtException + unhandledRejection handlers (log AND continue — a
> main-process rejection must not kill the app untraced), 512 KiB startup
> rotation to main.old.log, logLine never throws. (5) Zoom: Ctrl/Cmd + '+',
> '-', '0' via webContents before-input-event (±0.5 steps, floor −3, 0
> resets) — independent of any menu, works dev+packaged. Settings + types
> carry `minimizeToTray?` / `openAtLogin?`; SettingsModal gained Tray (keep
> in tray / quit on close) + Startup (launch at login / manual only) rows,
> both live-syncing through settings:set. NEW batch38 = 26 checks (log
> unit incl. never-throws + rotation, PNG signature+IHDR decode of the
> embedded tray icon, 13 wiring pins incl. baked renderer strings). Also
> hardened batch5's live-model A-scenario while Ollama was flaking: the
> clipboard readback now polls ≤6s (its /copy is a fire-and-forget
> Set-Clipboard — a cold PowerShell read back the machine's STALE
> clipboard) and the reply wait is 30s (cold model load). Ollama was found
> DOWN mid-round (connection refused) and restarted via `ollama serve`.
> typecheck ✓ build ✓ (out/ rebaked).

> **STATUS (phase 3 — desktop app portability round, v3.2):** the app no
> longer assumes Windows. (1) NEW `src/main/terminal.ts` — pure
> `terminalPlan(platform, root)`: win32 keeps the EXACT wt.exe→cmd.exe
> behavior (pinned args), darwin runs Terminal.app via osascript (proper
> AppleScript quoting incl. double-quote paths) with an `open -a Terminal`
> fallback, linux walks x-terminal-emulator→gnome-terminal→konsole→
> xfce4-terminal→xterm; index.ts's `app:openTerminal` now walks the plan
> awaiting each spawn, falls through on 'error', and a total miss returns
> `Could not open a terminal — tried …` instead of a silent no-op. (2) NEW
> `src/main/windowstate.ts` — the window remembers where you put it:
> `~/.codezy/window.json` saved on close (getNormalBounds + maximized flag
> via per-window `self`), restored at launch SANITIZED against
> `screen.getAllDisplays()` — garbage/off-screen/unplugged-monitor saves
> fall back to centered defaults, sizes clamp to min 940×600 and the
> biggest display, the top-40px title strip must keep ≥80px grabbable;
> maximize fires at 200ms AFTER the acrylic resize nudge (120ms) so it
> can't be undone by setSize. (3) `update.ts` is platform-aware everywhere
> (optional `platform` param, default `process.platform`, so batch21 is
> untouched): new `installerPattern()` — win .exe / darwin .dmg+.zip /
> linux .AppImage+.deb+.rpm+.tar.gz — `pickAsset`/`evaluateReleases`/
> `checkForUpdates` thread it, downloads keep the asset's real extension
> (`CODEZY-update<AppImage>` etc), and `applyUpdate` refuses off Windows
> (never spawns NSIS); the `update:apply` IPC opens the release page off
> win32 (`auto-install is Windows-only — install from the release page`)
> and does NOT quit. (4) `electron-builder.yml`: mac (dmg+zip,
> `identity: null` — unsigned, matching the release reality) + linux
> (AppImage+deb) blocks; scripts `dist:mac`/`dist:linux` added, `dist`
> stays `--win`. (5) NEW `launch.sh` (root, twins launch.bat: npm run dev)
> + NEW `cli/launch.sh` (TUI, node guard). (6) Cleanup: stray
> `electron.vite.config.1791919184541.mjs` deleted; batch34's PROJ is now
> fileURLToPath-portable like 35/36/37. (7) NEW batch37 = 53 checks (esbuild
> bundle pattern from batch21): terminal plans ×3 platforms + quoting,
> installer matrix + exe-only-off-Windows guarantee + download ext +
> apply refusal, sanitize matrix + fs roundtrip, 15 source/config pins.
> typecheck ✓, `npm run build` ✓ (out/ rebaked — main+preload+renderer).
> Note: mac/linux TARGETS exist but must be built on their own hosts;
> runtime on those platforms is unverified here (code-read + unit pins
> only).

> **STATUS (CLI/v1 round — the composer stays LIVE while the model talks):**
> fixed the reported "streaming swallows every key" bug in `codezy.mjs`
> without touching stdin handlers' structure or the command chain. (1) The
> stdin router now feeds `keyInput` during a reply (`const streaming =
> thinking || !!abortCtl`): Enter mid-stream hits the EXISTING rawSubmit
> contract — a `/command` stops the reply (abort) and runs right after it
> unwinds, plain text pushes to lineQueue and auto-sends after (askRaw
> already drains lineQueue first). Bare/glued Esc (`/^(</x1b)+$/`) keeps
> stop-the-stream priority before keyInput's own Esc handling; an open
> palette/overlay keeps first crack at Esc. (2) The progress row shows
> `· N queued` while lines wait (`render()` reads lineQueue.length). (3)
> shift+enter inserts a newline mid-stream too. (4) ROUTER NEVER EATS
> INPUT: the old final branch dropped keys when no waiter/overlay/stream
> existed (loop between asks) — now `else keyInput(s)` always reaches the
> composer; Enter-without-waiter queues like piped readline. (5) DSR
> fast-typist fix: keystrokes arriving while queryRow's 250ms cursor query
> is out were buffered into dsrWait.buf and DISCARDED on timeout — on a
> pipe (tests, redirected TUI) that ate any input written <~300ms after
> boot. Extracted the stdin handler to module-scope `handleKey(s)`,
> queryRow now replays `pending` after resolve (askRaw parks its waiter on
> the following microtask), and askRaw drains lineQueue right after the
> await before parking. batch36 = new 14-check live suite (CODEZY_TTY
> spawns: queue counter `· 1 queued` observed, esc→`stopped`,
> queued-line auto-sends a 2nd stream, `/usage` palette path RUNS
> mid-stream + aborts the reply, 5 source pins). Full suite **36/36 ALL
> PASS**. Debug seams: tests\.tmp\debug-stream.mjs / debug-stream2.mjs.

> **STATUS (phase 1 — harness & agent round):** `lib/harness.mjs` got
> `PARALLEL_SAFE` (only read-only `list_dir/read_file/grep_search/glob/
> web_search/web_fetch` prefixes run via Promise.all; the first mutating/
> gated/unknown call demotes the rest to a sequential tail; tool messages
> always pushed in wireCalls order; gated reads demote themselves),
> `isTransient()` retry classifier + `callWithRetry` (408/429/5xx +
> ECONNREFUSED/ETIMEDOUT/ECONNRESET/EPIPE/EAI_AGAIN/fetch failed/socket
> hang up/timed out; never AbortError; "model not found" fails fast;
> `retries=2, retryDelayMs=400` ×3 backoff, injectable; retry surfaced via
> onEvent), `usage` accumulation on ALL return paths, abort→`{status:
> 'stopped', messages, usage}` (chain intact), and a run1 executor with
> the concurrent read prefix. v2 REPL: spinner elapsed seconds, approval
> preview `approvalView` + `a=always`, `~/.codezy/agent/` session
> saves/resume, `-c/--continue` routing (index.mjs + helpText — implies
> agent mode, loads newest save), `sessionUsage/addUsage`, `compactHistory`
> auto-past-60 + `/compact`, `/resume` + `/usage` commands + SLASH + help,
> `turn()` restructure (AbortController, autosave, auto-compact, pinned
> tools-ternary line verbatim ×2, `signal: ctl.signal`), SIGINT interrupt
> handler, onEvent `retry` display. Verified: probe-harness 11/11,
> batch35 (30 checks) ALL PASS, batches 9/11/18/22/29/30/34 green,
> node --check clean everywhere.

> **STATUS (npm publish readiness — `codezy` is installable):** the CLI package
> is now complete enough to publish. Name `codezy` is FREE on the registry
> (404 = unclaimed). Added `cli/README.md` (the npm page: install · quick start
> · requirements · modes table · REPL commands · exit codes) and `cli/LICENSE`
> (root MIT copy) — npm auto-includes README/LICENSE regardless of `files`.
> Fixed the one engines-vs-code contradiction: `codezy.mjs` read package.json
> via `import.meta.dirname` (Node 20.11+ — on Node 18 the try/catch silently
> degraded the footer version to 0.0.0) → now `const pkg = { version:
> getVersion() }` from lib/cli.mjs like every other entry point; grep confirms
> no Node-20+ API remains anywhere in `cli/`, so `engines: >=18` is honest.
> `--help`'s install line is registry-first (`Install: npm install -g codezy
> (from a checkout: npm install -g ./cli)`), README CLI section matches
> (registry-first, Windows/macOS/Linux — no historical What's-new edits).
> Verified by a REAL install: `npm pack` → `codezy-3.1.3.tgz` (17 files,
> 85.2 kB packed / 272.3 kB unpacked, tarball parked in tests\.tmp) → `npm
> install -g <tgz> --prefix <temp>` → the generated shim runs `--version` →
> `codezy 3.1.3` exit 0, `--help` exit 0 with the new line, and `doctor`
> ALL-GREEN exit 0 from the INSTALLED layout (endpoint + model reachable).
> `npm publish --dry-run` passes with only the expected ENEEDAUTH warning.
> **Pending, needs the owner: `npm login` + `npm publish` (or a token) —
> until that runs, the README's registry line is aspirational.** WSL is not
> installed on this box → no Linux runtime signal; Node 18 floor untested on
> a real 18 (machine runs v24).

> **STATUS (TUI session polish — home is a state, the tab is a lamp):** four
> quality-of-life upgrades on top of the splash redesign. (1) `/new` (and its
> `/clear` alias) run from chat mode now RETURN TO THE START SCREEN — the
> splash IS the empty state, so a wipe is visible, not a silent blank chat;
> piped mode keeps its `fresh context — screen cleared` notice. (2) The
> streaming indicator counts the reply live once the first token lands
> (`✳ 240 chars · 3s · esc to stop`, `thinkT0` stamp) — a quiet model no
> longer looks frozen; before the first token it still says `thinking…`. (3)
> The window/tab title is a status lamp via `setTitle()`: `CODEZY ·
> thinking…` → `CODEZY ✓ done` / `CODEZY · ready` (esc) / `CODEZY ✗ error` —
> visible even when the tab is unfocused. (4) Connection-style failures
> (fetch failed/ECONNREFUSED/socket) get an actionable second line
> (`can't reach the model — is ollama running? /model picks another
> provider`) instead of a bare `error: fetch failed`. `/new`'s COMMANDS
> description now says what it does ("fresh context — wipes chat, back to
> start screen"). Probe-verified: /new from a live chat redraws the splash
> (2nd wordmark frame) and exits 0; title lamps + live counter observed
> mid-stream. batch1/2/3/8/12/27 re-ran green.

> **STATUS (TUI splash redesign — composer pinned to the bottom):** the splash
> is now identity-on-top / composer-on-bottom: flush block wordmark (the old
> glyphs had per-row indents — it read as a shear), tagline `● singularity —
> one local mind for your codebase`, the `chat · model · effort` meta above
> the box, the tip floating in the breathing gap, then a rule · hints · band ·
> footer stack anchored to the LAST screen rows (`buildSplash()` pads by
> `rows()` so the composer lands on the bottom on any terminal height).
> Boot wipes the screen first (`\x1b[2J\x1b[H`, TTY only) — stale scroll junk
> from previous runs (the white-box artifact) can't survive under it — and
> `resize` rebuilds the whole splash (was: splash ignored resizes). The splash
> palette now stacks ABOVE the band like chat mode: drawBox rewrites the union
> of drawn/wanted rows (`palRows` counter, restore pulls the SPLASH_ABOVE
> tail) instead of `\x1b[0J` below the footer — palettes near the bottom used
> to push rows past the edge and desync the cursor hops. batch1's A pins
> rewritten to the new geometry (11 relative checks: tagline = wm+7, meta =
> box-8, tip = box-5, rule = box+1, hints = box+2, footer = box+4).

> **STATUS (TUI: `/` opens the command palette by itself):** typing `/` in the
> v1 TUI input now pops the command-help palette (was ctrl+p only — "no
> command help popup"), filtering live like the `@path` file list does.
> `autoCmds()` runs from drawBox next to `autoOverlay()`: opens on a leading
> `/` (single line only), closes when the slash leaves the line, and only
> closes what IT opened (`auto: true` flag — ctrl+p/ctrl+r palettes and
> pick/value prompts are hands-off). The edit-proposal y/n loop owns the line
> via a new `rawPrompt` flag (the main input is itself a `waiters` entry, so
> `waiters.length` can't mark command prompts). Enter with the palette open:
> typed line is a real command (exact first token, or nothing matches → e.g.
> unknown commands) → runs as typed; a partial like `/eff` accepts the
> highlighted row (`/effort`) into the input. batch2 grew section C (4 checks:
> palette opens on `/`, filters to `/effort`, input keeps the typed text,
> `/quit` still exits 0). batch1's status-bar pin was effort-agnostic
> (light|medium|deep — it hard-coded `medium` while the machine runs `deep`);
> batch3 pins a known starting effort before A (picking the CURRENT value
> resolves silently — no save notice); batch8 B5 says "Do not use any tools."
> + retries ×3 (qwen wanders into tool loops on the trivial prompt and hits
> the iteration cap). batch34 = **72 checks** (the old STATUS block said 75 —
> counted).

> **STATUS (CLI → its own npm package):** `cli/package.json` now exists — name
> `codezy`, `bin.codezy → ./index.mjs`, `type: module`, `files: [index.mjs,
> print.mjs, codezy.mjs, codezy-v2.mjs, doctor.mjs, lib]`, engines node ≥18,
> version 3.1.3 synced to root; root package.json gained `"private": true` so
> only `cli/` can ever be published. `getVersion()` (lib/cli.mjs) reads
> cli/package.json FIRST and the repo root second — a global install has no
> repo root beside it. New `cli/doctor.mjs`: `codezy doctor` reports node ·
> package · settings · data dir · endpoint · model · hooks · mcp · git, exit 0
> (warnings are fine — a stopped Ollama is a warning) / 1 (real errors), bogus
> flag → 2; routed from index.mjs BEFORE the engine pick (so `codezy doctor`
> never becomes a chat prompt). `--help` is sectioned and colored on a TTY,
> byte-plain when piped (batch8's `--output-format` pin still holds).
> harness.mjs grew **`web_fetch`** (schema + registry: http(s)-only check,
> 15 s timeout, HTML → prose strip, maxChars 1k–100k, `…[truncated]`,
> `fetch failed: HTTP <n>` on errors) — src/main/prompt.ts names it too, and
> now also lists edit_file/glob which were missing from that tool line. The v2
> REPL: TAB completer over the 12 slash commands, a stderr spinner (TTY+!PRINT
> gated; `spinClear` before every write, `rl?.line` guard so typing is never
> wiped, retires when the run ends), the prompt now redraws AFTER output
> (drain) and never while busy/approving, new `/model` (live switch — MODEL is
> `let` now), `/tools`, `/auto [on|off]` (auto is `let` now), `/export [f]`
> (`# CODEZY session` / `## You` / `## CODEZY`), and SYSTEM lists all 11 tools
> incl. web_fetch. Pinned strings untouched: tools-ternary exactly ×2,
> `case '/mcp'`, `type /help · /mcp`, checklist + mcp help rows. batch34 is new
> (72 checks: package shape + version sync, --version/--help/doctor exit codes
> and ANSI-free output, web_fetch against a LOCAL http server, piped REPL
> command flow, batch29 pins, `npm pack --dry-run` contents). README CLI
> section rewritten (no historical What's-new edits). Installer untouched.

> **STATUS (v3.1.2 shipped): outward popovers + delete confirm.** Root cause of
> "effort hops to mode": each popover is wider than the gap between the badges,
> so anchored INWARD the effort popover sat on the mode badge (and vice versa)
> — the diagonal to an option crossed the sibling badge, mode lit up under the
> cursor and the pick hopped over. global.css now fans them OUTWARD: base rule
> (left badge) `right: 0; transform-origin: bottom right`, `.seg-fab-right`
> override (right badge) `left: 0; transform-origin: bottom left`. batch31 grew
> to 30 checks — 16a-f replay the effort trip as five real mouseMoved waypoints
> and assert mode stays at opacity 0.00 throughout (pre-fix it hit 1.00), 17a-e
> pin mode + hover effort so BOTH popovers are open and assert the boxes never
> intersect, no pop covers the sibling badge, both stay inside the `.composer`
> rail, Esc releases the pin, 18 asserts zero badge drift in-session. batch32 is
> new (15 checks, CDP ports 9358/8332): the chat row's trash used to call
> `sessions.delete` on ONE click — Sidebar.tsx now has a `delConfirm` state
> opening a `.ctx-menu` confirm ("Delete this chat?" + `Delete chat`/`Cancel`,
> `.ctx-head`/`.ctx-sub` styles); Cancel/Escape/outside-click dismiss without
> deleting; the trash stops mousedown propagation so the outside-dismiss can't
> eat the click that opens it and a second click toggles; the row ctx-menu's
> own two-step "Really delete?" is untouched. suites batch1–32 all green.
> version 3.1.2 + README "What's new in 3.1.2" +
> `dist\CODEZY-Setup-3.1.2.exe`.

> **STATUS (v3.1.1 shipped): corridor rebuild + one-click installer.** The
> effort/mode hover logic dropped its exit-point anchor entirely: `inQuad`
> sign-test over the static quad hull between the badge's near edge and the
> popover's near edge (both orientations), plus a 260 ms grace timer when the
> pointer slips out (`onMove`: inside box/corridor ⇒ cancelGrace, outside ⇒
> arm; `onDown` releases instantly — no grace on click). `segLastIn` /
> `onPointerMove` removed — geometry needs no anchor. `tests\batch31-test.mjs`
> grew to 16 checks (sideways corridor sweep + a synthetic grace replay —
> note: React maps onPointerLeave from `pointerout`, not `pointerleave`, and
> same-coordinate mouse moves are coalesced, so the replay dispatches
> `pointerout` and the "leave for real" step must move to a *different*
> far point). electron-builder.yml: `nsis.oneClick: true` +
> `allowToChangeInstallationDirectory` dropped — every exe replaces the
> existing install in place (registry-key driven), no second app. suites
> batch1–31 all green. version 3.1.1 + README "What's new in 3.1.1" +
> `dist\CODEZY-Setup-3.1.1.exe`.

> **STATUS (v3.1.0 shipped): the v3.1 round — code-block apply, project instructions, chat search, MCP trace, background task panel, and the effort/mode popovers rebuilt — suites batch1–31 all green.**
> - **batch26 code-block actions** — main `applyCodeBlock`: a full-overwrite
>   of an existing file goes through `applyEdits` (backup written, `/undo`
>   restores), new files land with `prev=null` (undo deletes them); `../`,
>   absolute-outside, binary and no-linked-folder cases refused. `CodeBlock`
>   UI: header (lang/lines/bytes), copy, save-to-file via dialog, inline
>   path row for applying, notices for errors. IPC + preload + api type +
>   CSS block 30. suite: 43 checks.
> - **batch27 project instructions** — `.codezy/instructions.md` per linked
>   folder lands in the system prompt right after CODEZY.md context
>   (missing ⇒ silent, oversized ⇒ capped with a marker; v2 gets it too,
>   TUI reads the same file with the same cap); Settings → instructions
>   rows: ready/not-created state, open or create-with-template, hint for
>   unlinked chats. CSS block 31. suite: 37 checks.
> - **batch28 chat search** — `searchSessions` (case-insensitive, newest
>   session/message first, hidden notes skipped, 1-char refused, corrupt
>   file never breaks the scan); store `runSearch` (debounced,
>   stale-response guard) + `openSearchHit`; `SearchOverlay` (debounced
>   hits with `<mark>`, arrow/Enter, Esc); ChatView `data-mid` rows scroll
>   into view and flash. Palette + cheat-sheet entries, CSS block 32.
>   suite: 53 checks.
> - **batch29 MCP visibility** — tool events carry wall-clock ms end to
>   end (harness → v2.ts → trace type → store); `TraceLine` chips: MCP
>   server, duration, result size, failed state, live activity label;
>   palette/Settings jump-and-flash for MCP servers; TUI `/mcp` + MCP
>   graft per turn with clean disconnect; `cli/lib/mcp.mjs` verified
>   against a real spawned NDJSON fake server. CSS block 33. suite: 59
>   checks.
> - **batch30 background tasks panel** — `v2.ts` registry cache is an LRU
>   of workspaces (eviction kills the victim's leftover children first);
>   `listV2Tasks`/`stopV2Task` export the harness task maps with
>   root-namespaced uids (`app #1` per workspace root) and a capped output
>   tail; IPC `tasks:list|stop`, preload + api types, `TasksPanel` with
>   elapsed time, output tail, per-row stop, self-polling while open; a
>   composer chip with the live count (`taskCount > 0`, instant on any
>   `run_command` event, any chat); palette `a-tasks`; CSS block 34.
>   suite: 48 checks.
> - **effort/mode popovers rebuilt (+ batch31)** — hover previews, a
>   click **pins** the menu open (click again / outside / Esc releases),
>   and the invisible-triangle hover travel holds it open across the 8px
>   gap. Three real bugs fixed: the `.intent` class had been dropped from
>   the fabs' className during the pin refactor (hover travel could never
>   work), `pointerleave` carries the jump destination so a fan anchored
>   there degenerated to zero area and got stuck open after a fast flick
>   (now anchored at the last position inside the fab, tracked via
>   `onPointerMove`), and a picked option kept focus so `:focus-within`
>   trapped the menu open (pointer picks now blur). `tests\batch31-test.mjs`
>   pins it all with a REAL headless Chrome replaying the click journey
>   against the built renderer (needs `npm run build`; mock bridge via
>   `Page.addScriptToEvaluateOnNewDocument` — mind the ASI: separate the
>   injected IIFEs with a `;`). suite: 12 checks.
> - **Ollama starts on the first chat, not at launch** — `ensureOllama()`
>   no longer runs on whenReady; the server comes up when a chat actually
>   needs it (faster boot, no idle VRAM).
> - **cowork AI cursor follows the agent** — 3s idle timer → streaming-
>   aware lifetime (run busy ⇒ alive, 6s grace after quiet), live
>   scroll-follow on content change while active, horizontal clamp in
>   `measure()`.
> - version 3.1.0 in `package.json` + `package-lock.json` (root entries);
>   README "What's new in 3.1.0"; `dist\CODEZY-Setup-3.1.0.exe`.

> **STATUS (v3.0.0 shipped): the mega-round — agent core, review-first editing, connections, makeover — suites batch1–25 all green (1,184 checks).**
> - **batch22 agent core** — new tools `edit_file` (targeted edit/replace with
>   unique-anchor checks), `glob`, `task_status`, `run_command` with
>   `background: true` (detached child, records capped at 20, `taskkill /pid
>   <pid> /T /F` on Windows); `MUTATING_TOOLS` gates every write tool **and
>   hides its schema** in plan mode (registry refusal + schema hiding, not
>   prompt text); `delegate` merges into `runAgent` — depth-limited (max 2),
>   same registry/approval gate/hooks, child capped at `delegateIter` 4;
>   iteration cap clamped 5–40 (effort light 8 / medium 15 / deep 30; plan 8);
>   `v2.ts` maps allowMutations/effort and keys the registry cache
>   `roots|rw|ro`. suite: 79 checks.
> - **batch23 review-first editing** — `src/shared/edits.ts` hunk engine:
>   `toHunks(diff, ctx=3)` with trailing-context fix, **position-based**
>   `composeHunks` (a skipped hunk contributes only its old lines — identity
>   keys silently broke on structurally-equal-but-different diffs),
>   `changeCounts`; `EditCard` renders per-hunk ticks + all/none + "{keep} of
>   {n} hunks"; `acceptEdits(messageId, only, overrides)` composes the file
>   from the selection (all-off ⇒ notice, no write); `ApproveModal` shows
>   real diffs via `ide.read` + raw args in a `<details>`. suite: 44 checks.
> - **batch24 connections** — `src/main/mcp.ts` stdio MCP client (NDJSON
>   JSON-RPC, `windowsHide`, handshake validation, timeouts 15 s / call 60 s,
>   stderr tail in errors, close rejects pendings); tools namespaced
>   `mcp__<server>__<tool>`, results flattened (isError flag, 16 k cap),
>   session cache keyed by command/args/env with reconnect-after-crash;
>   merged into the v2 registry **only with allowMutations** (never plan
>   mode), failures emit a chat event instead of blocking the run. IPC
>   `mcp:list|probe|save` + `mcpDisconnectAll()` on before-quit, preload +
>   api types, Settings → MCP servers (status dots, test, enable/disable,
>   remove, add). Vision: `expandMessage` classifies image attachments →
>   data URLs on `ChatMessage.images` (20 MB cap, unreadable ⇒ warning); the
>   Ollama wire sends raw base64 `images`, the OpenAI wire sends
>   `image_url` parts — **v1 chat only**, the v2 harness stays text. Five
>   new provider presets (groq / deepseek / together / mistral / openai).
>   CSS block 28. suite: 74 checks incl. a real fake MCP server (handshake,
>   RPC errors, hung-call timeout, crash→reconnect, ENOENT).
> - **batch25 makeover** — CSS block 29: typography rhythm (balance/pretty
>   wraps, heading tracking, tabular chips), layered theme picker (preview +
>   accent dot + active glow + focus ring; 7 themes pinned, ember at index
>   4), unified `.btn` transitions + `:focus-visible`, field accent focus
>   ring, `modalIn` dialog entrance, accent-tinted `::selection`, bubble
>   depth — all under the existing `html[data-motion='off']` kill. suite: 39
>   checks.
> - version 3.0.0 in `package.json` + `package-lock.json` (root entries),
>   README: badge 1184 checks · 25 batches, features rows (agent tools, MCP,
>   images, presets), "What's new in 3.0.0".

> **STATUS (v2.6.1 shipped): maintenance release — the first version delivered by the in-app updater.**
> No code changes from 2.6.0; version bumped in `package.json` /
> `package-lock.json` (root entries) + README. The check was verified **live**
> against GitHub: `tag=11` (`CODEZY-Setup-2.6.0.exe`, 113,527,611 bytes) is
> found, `evaluateReleases` picks the newest installer across *every*
> published release (tag names are irrelevant — drafts/prereleases skipped),
> and a client on 2.6.0 correctly reports "up to date" until a **higher**
> version lands. suites batch1–21: 948 checks green.

> **STATUS (v2.6.0 shipped): the in-app updater + the cowork tree fix — suites batch1–21 all green (948 checks).**
> - **batch21 the updater, pinned** — `src/main/update.ts`: `UPDATE_REPO =
>   'jaunchun/Codezy'`, `parseVersion` reads the version off the **asset name**
>   (the release tag is prose — literally `Release`), `compareVersions` is
>   numeric (`2.10.0 > 2.9.0`, never lexical), `pickAsset` wants an exe with a
>   version **and** a URL and takes the newest, `evaluateReleases` skips
>   drafts/prereleases and can never offer a downgrade, `checkForUpdates` uses
>   an 8 s timeout + a `CODEZY/<ver>` user agent and resolves `ok:false`
>   instead of throwing, `downloadUpdate` streams `.part` →
>   `CODEZY-update.exe`, verifies the byte count against content-length
>   (percent `-1` when the size is unknown) and `applyUpdate` spawns
>   `['--updated', '/S', '--force-run']` detached + `windowsHide` + `unref`
>   with **no second window** (a vanished setup ⇒ `ok:false`, never a crash).
>   IPC `update:check|download|apply|openRelease`, preload bridge, the launch
>   check is silent and gated by `settings.autoUpdate !== false`, the pill in
>   `TitleBar` runs idle → downloading → ready → installing, dismissal is
>   persisted per version (`codezy.update.dismissed`), Settings → about has
>   *check on launch / never / check now*, plus `/update`. suite: 134 checks
>   (injected fetch — GitHub is never touched by the tests).
> - **batch20 the cowork pass, pinned** — tree: directories are always walked,
>   the caps apply to file **rows** only, and every cut is explained by a
>   marker row (`\u0000more`, `\u0000more-tree`, `\u0000deep`); `showIgnored`
>   reveals `dist`/`venv`/`.vscode` while still hiding `.git`/`node_modules`.
>   git: `gitStatus` per linked root (2500 ms timeout, `path.dirname` guard so
>   a stray `C:\.git` can never trigger a whole-drive status). edits:
>   `listBackups` newest-first + `restoreBackup` — snapshots the current files
>   first (press twice safely), numeric ids only, writes nothing outside the
>   linked folders, and stops the whole restore on a binary instead of
>   corrupting it. prompt: `## Instructions from you` now sits above what
>   CODEZY learned, the goal and the project context. renderer: `.ide-more`
>   marker rows, git/ignored chips, `.ide-badge[data-st]`, Ctrl+P quick-open,
>   Ln/Col + wrap status bar, the row menu, new file/folder, quick follow-ups,
>   `/history` modal, settings export/import + *send a test*. suite: 168
>   checks.
> - **regression repaired mid-round** — older renderer suites ship mocks
>   without a `git` bridge, so `IdePane.refreshGit` guards
>   `typeof window.codezy.git?.status === 'function'`: a bare bridge simply
>   leaves no badges instead of taking the pane down.
> - typecheck 0, build 0, dist → **version 2.6.0**.
>
> **STATUS (v2.5.0 shipped): feature round — model-picker placement, chat/sidebar/settings/cowork upgrades, partial edit accepts — suites batch1–19 all green (645 checks).**
> - **batch19 the feature pass, pinned** — model picker: measures the space
>   around its chip (flips above/below, clamps into the window, caps its
>   height to the free space), animated open **and** close (`mounted` + `.show`
>   — the old "stretches, never retracts" bug), ★ favorites + Recent groups in
>   localStorage, one provider chip per connected endpoint, Home/End/PageUp/
>   PageDown; chat: `deleteFrom` (armed two-click truncate), composer drafts
>   persisted across restarts, `/transcript`, `/pin`, `/archive`, live token
>   counter while streaming; sidebar: search over titles **and** message text
>   (reaches archived chats), archive/Show archived, background-generation dot,
>   recent/A→Z sort, export-all; settings: font-size slider (12–20, live),
>   density via `html[data-density]`, hover-to-preview themes (click commits,
>   leave cancels), shortcuts button; cowork: tree filter, expand/collapse all,
>   `ide:rename`/`ide:delete` IPC (linked-folder confined, directories are never
>   deletable), find-in-file with a real selection, line-number gutter synced to
>   the buffer; edits: per-file ticks + `appliedEdits`, so a partial write is
>   remembered, never re-offered, and the bar hides only once every block
>   landed; palette +8 actions. suite: 128 checks.
> - typecheck 0, build 0, dist signed → **version 2.5.0**.
>
> **STATUS (v2.4.0 shipped): bug-hunt + AI-quality pass — suites batch1–18 all green (518 checks).**
> - **batch18 the hunt's fixes, pinned** — harness: `repairJson` (curly/single
>   quotes, string-aware comment strip, trailing commas, auto-close),
>   multi-call `parseTextToolCall` (loose gate, fence+prose dedupe, cap 7,
>   `args`/`parameters` aliases), `fitContext` shrink-never-drop + idempotent,
>   `read_file` paging + head/tail ending in `…[truncated]`, `list_dir`
>   natural order, runAgent id pairing (given API ids kept, missing assigned,
>   `tool_call_id` always set); main edits: backup BEFORE write (refusal ⇒
>   nothing applied), non-UTF-8 refusal, CRLF kept, undo dedupe + partial
>   retry; store boot pointer + re-root patch + corrupt files moved to
>   `.corrupt`; `ideRead {content, truncated}` + save guard; the same safety
>   rules in the TUI path. suite: 56 checks.
> - **renderer fixes** — attach merges picked files and Cancel keeps what's
>   staged; send/regenerate wrapped (a rejected IPC rolls the turn back and
>   the composer gets its draft back); `/init`/trace/steering are per-session;
>   `setActive` clears stale activity, keeps pending asks, and per-session
>   stream buffering keeps a background reply's text when you switch back.
> - **TUI fixes** — drawBox hops to the block's first row (multi-line/vim
>   caret), `askRaw` drains queued lines, glued `\r\n` paste tails keep their
>   second line, `atToken` skips the real separator, `--dir`/`--root` validate
>   and `--root` routes, `-p` never eats a following flag, markdown: intraword
>   `_` and hex colors stay literal, auto mode resolves its proposal,
>   `stream_options.include_usage` (+400 fallback) for real token usage.
> - **deferred (documented)** — T10: the splash re-prompt assumes the preview
>   box's absolute screen row, so a slash command that scrolls the terminal
>   (`/help` on a short window) can leave the next prompt landing on stale
>   output; the fix needs live-terminal relayout verification that can't be
>   done headless. Also known: unsigned installer/SmartScreen warning,
>   `grep_search`'s regex can backtrack badly on adversarial patterns.
>   typecheck 0, build 0 → **version 2.4.0**.
>
> **STATUS (v2.3.0 shipped): local-first UX round — Ollama auto-start, boot splash, autosetup, streaming isolation — suites batch1–17 all green (462 checks).**
> - **batch13 first-run setup + window hardening** — shared `connectPatch` upserts
>   the setup screen's provider (activate + default model, re-keys without
>   duplicating, presets keep their known-good model); main store: fresh install
>   or a TUI-written settings file → `setupDone false`, the patch flips it;
>   renderer sends `{setupDone}` as a partial patch. Runs on a faked USERPROFILE
>   with dataDir-pinned fixtures so the live settings file can never be
>   clobbered. suite: 27 checks.
> - **batch14 settings expansion + face-lift** — reduceMotion defaults off;
>   custom accent applies inline (`--accent`/`--accent-2`) while palette themes
>   WIN over it; motion flips `html[data-motion]`; every change is a patch
>   payload; Settings dialog: 7 sections, 8 accent swatches (click → applies +
>   persists), mode + effort rows, motion switch, build-time version chip.
>   suite: 16 checks.
> - **batch15 auto-continue + model cursor** — autoContinue defaults on: a reply
>   stopping inside an unclosed ``` fence gets a hidden "Continue exactly…"
>   nudge (capped at 3 per human turn, resets on every real message, the
>   setting kills it); v2tool `write_file` + applied chat edits publish `aiWrite`
>   → cowork editor live reload + blinking overlay cursor + tree dot + chip,
>   a dirty buffer is never clobbered by the reload; Settings row flips the
>   persisted flag. suite: 25 checks.
> - **batch16 effort bar + picked file chip** — code mode's 420px chat rail: the
>   tools row wraps and never flex-shrinks its pills while `.grow` stays
>   `flex: 1`; IdePane mirrors the open file (path + live content, unsaved
>   edits included) into `store.ideFile` and an image clears it; the composer
>   shows the chip and submit() attaches it (`message.files` → `expandMessage`);
>   closing the pane stops it. suite: 15 checks.
> - **batch17 streaming isolation + boot splash + autosetup** — per-session
>   streaming: a background reply lands in ITS own session, deltas never leak
>   into the visible chat, switching swaps thinking/stop state; stop() aborts
>   the session that's actually generating and force-clears a dead stream;
>   error events refresh the health dot; BootSplash logo renders during init
>   and flies to the measured title-bar rect; setup welcome: live engine pill +
>   one-click "Start with local Ollama"; static: seg-fab popover (no row
>   expansion), boot CSS, main spawns `ollama serve` windowless. suite: 29 checks.
> - **release wiring** — main `ensureOllama()` pings then spawns `ollama serve`
>   (detached, windowsHide) on whenReady; renderer `armOllamaWatch()` polls
>   every 3.5s while offline; TUI `imagePathsIn` re-joins unquoted paths split
>   at spaces (a folder like `Projekt domyślny` used to eat the attach),
>   apply notices print link-folder-relative paths instead of 100-char
>   absolutes; README + LICENSE added. Full sweep batch1–17 green.
>   typecheck 0, build 0 → **version 2.3.0**.
>
> **STATUS (v2.2.1 shipped): "models don't show up" root-cause fixes — suites batch1–12 all green.**
> - **batch12 settings coherence** — both holders used to write the settings
>   file as a WHOLE object from their in-memory copy, so whoever saved last
>   wiped what the other had just written (a Nebius provider connected in the
>   TUI could vanish after a desktop settings change, and vice versa) — and
>   neither side ever re-read the other's changes, so the app you looked in
>   showed no provider models at all. Fixes: main `patchSettings` (settings:set
>   now merges a PARTIAL patch over the file on disk; renderer sends only the
>   changed keys); TUI `saveSettings` writes only its dirty keys (baseline
>   diff) and `syncSettings()` re-reads disk before every input line (external
>   change → `refreshCtx`); renderer `resync()` pulls settings + models when
>   the picker opens or the Settings dialog shows (also fixes updateSettings
>   ordering — model refresh no longer sits behind `health.drive()` in one
>   try/catch); picker renders an explicit `(no models loaded — check the API
>   key)` note for a connected provider whose GET /models failed instead of a
>   silent gap (row building extracted to `pickerRows.ts`). suite: 17 checks
>   (disk-merge units, mocked-bridge patch payload + refresh order + resync,
>   picker rows, TUI clobber survival + external visibility on isolated
>   USERPROFILE). typecheck 0, build 0 → **version 2.2.1**.
>
> **STATUS (v2.2 shipped): Nebius provider + OpenAI-compatible agent mode — suites batch1–11 all green.**
> - **batch11 Nebius** — harness gained `openaiCall` + `chatCompletionsUrl`:
>   the OpenAI wire format (Bearer auth; messages sanitized — `tool_name` out,
>   `tool_call_id` in, object arguments → strings, orphan role:"tool" results
>   → user notes; `API error <code>` on !ok), same return shape as ollamaCall,
>   so runAgent speaks Ollama /api/chat AND any /chat/completions endpoint.
>   v2 agent mode resolves its target from `session.provider ??
>   settings.activeProvider` (desktop v2.ts + CLI codezy-v2; the CLI also
>   treats `--url …/vN` as OpenAI). Connection UX: shared `PROVIDER_PRESETS`
>   (Nebius Token Factory → `nvidia/Nemotron-3_5-Lightning`, OpenRouter, LM
>   Studio) fills Settings-dialog quick-add chips; `/provider nebius <key>`
>   connects in both shells (upsert + activate + NVIDIA default model),
>   bare `/provider` shows a card. batch11 suite: 59 checks (wire-shape units,
>   runAgent pairing loop, bundled v2.ts against a mocked fetch, real store
>   dispatch, TUI on an isolated USERPROFILE, live `--url …/v1` through
>   Ollama's OpenAI endpoint). typecheck 0, build 0 → **version 2.2.0**.
>
> **STATUS (v2.1 shipped): 4-batch feature round — suites batch1–10 all green.**
> - **batch7 TUI input & quick actions** — piped: /help rows, `!shell` prefix
>   (card + context push), `#fact` + /remember (memory.md append + card),
>   /fast toggle, /vim persist, /rewind card + numbered picker + empty notice.
>   TTY: cursor editing (arrow + mid-insert), vim modes — usable from the
>   splash, Esc → normal, i/a/o → insert, normal-mode keys dispatch
>   char-by-char so fast chunks like `dd` land, mode tag in the status line,
>   Esc-Esc → rewind picker (vim off). 37 checks.
> - **batch8 TUI meta + JSON output** — /export [path] (default
>   codezy-export-<stamp>.md in linkFolder/cwd, `# CODEZY session` + ## You +
>   transcript), /cost (transcript bytes/tokens, last stats, provider cost
>   line), /doctor (node, settings, data dir, endpoint, model, git, folder,
>   memory, skills, terminal + "first ✗ above is the thing to fix"); CLI
>   `--output-format text|json|stream-json` on -p and exec (json carries
>   tool_events, stream-json emits {type:'tool'} NDJSON, bogus → exit 2),
>   documented in --help.
> - **batch9 harness** — `todo_write` tool (pending/in_progress/done, validated
>   in `check`, state on the registry as `.state.todos`; registry cached per
>   workspace so lists survive turns; /todos in the v2 REPL; system prompts
>   name it). Lifecycle hooks: `loadHooks(roots)` reads .codezy/hooks.json
>   (workspace else home) — before_tool nonzero exit BLOCKS before the
>   approval gate and the hook's stderr becomes the model's tool result;
>   after_tool failures append `[hook] …` to the result; `{tool, args}` JSON
>   on stdin, per-hook `tools` filter, 10s default timeout. Tool lines
>   restyled to `⎿ verb arg · summary` (stepSummary). Suites: 31 checks incl.
>   a live `⎿ list dir . · 12 entries` line.
> - **batch10 desktop mirror** — /rewind [n] (numbered listing, drop, guarded
>   while streaming), /fast (light ↔ medium), /doctor (✓/✗ rows + fix hint),
>   /cost (turns/transcript/estimate), /add-dir (dedupe), `#fact` →
>   /remember via a new parseInput 'remember' kind; parseInput now accepts
>   hyphen commands (/add-dir) while `/usr/local…` stays chat. Friendly trace
>   names (`read file`) + `updating todos…` activity; design-layer section 4:
>   command toasts in the mono stack (aligned rows hold) with a 200ms strong
>   ease-out enter. batch10 suite: 47 checks (real store dispatch through
>   send() against a mocked bridge). typecheck 0, build 0 →
>   **version 2.1.0**. Headless tests only; no windows spawned.
>
> **STATUS (v2.0 shipped): 7-batch design overhaul — all green.**
> - **b1 design** — 6-row block wordmark, splash bands, status bar below input,
>   two-sided statusLine, left-truncated footer cwd.
> - **b2 navigation** — one COMMANDS table feeds /help + ctrl+p, /clear alias of
>   /new, overlay engine (cmds/hist/files) with the shared input line as filter,
>   @file autocomplete, drawBox = cursor-on-input-row invariant.
> - **b3 pickers & config** — THEMES (midnight/ember/mint/slate) + applyTheme(),
>   shared settings.json (read+write), pickItem/valuePrompt primitives, no-args
>   /model /effort /mode /theme pickers in TTY (cards piped), /settings,
>   ctrl+c wipes input + closes palette (blocks autoOverlay reopen).
> - **b4 sessions & git** — gitBranch helper (5s TTL), statusLine branch
>   segment + splash meta row, /resume + /open TTY pickers, /diff vs HEAD
>   (stat + colored content, `-- <path>` narrowing, untracked / no-repo /
>   no-commits notes, g:2 in COMMANDS).
> - **b5 editing & sharing** — proposal keys y/n/a/d/s/r (d = unified diff via
>   `git diff --no-index`, a = auto mode + apply), /copy (clip.exe / pbcopy /
>   wl-copy), image attachments: real image paths detected per message,
>   stored as paths in history, read fresh at send — Ollama passthrough,
>   OpenAI content parts via sniffMime, 📷 marker in the bubble.
> - **b6 desktop mirror** — 7-name ThemeName union shared with the TUI
>   (themeBase/themePalette → data-theme + data-palette), desktop /copy +
>   /diff (main git.ts via `git:diff` IPC), EditCard "Always" (= a), and ONE
>   delimited DESIGN LAYER block at the end of global.css: palette accents
>   matching the terminal, composer accent edge, hairline accent scrollbars.
>   Typecheck 0, build 0 (index-CkzVqFFp.css / index-B2T_hhE9.js).
> - **b7 integration** — suites batch1–6 ALL PASS (regression), CLI conventions
>   verified (`--help` → 0 · unknown flag → 2 · `-p` one-shot → 0), bumped to
>   **version 2.0.0**. Headless tests only; no windows spawned.
>
> Previous phase — harness hardening (state of the branches below still holds):
> - **CLI (v1.5)** — one entry point `cli/index.mjs` (`bin: codezy`), conventions
>   borrowed from claude-code/codex/opencode: `--help`/`--version` (exit 0),
>   unknown flag → exit 2, `-p/--print` one-shot (activity → stderr, reply →
>   stdout), `exec`/`run "prompt"` one-shot agent, `--agent` REPL, shared parser
>   in `cli/lib/cli.mjs`. v1 TUI gained `--model`/`--dir`. `cli/print.mjs` is the
>   plain-chat one-shot (optional `--dir` adds the file tree to context).
> - **Text-form tool-call fallback** (`parseTextToolCall`) — models without
>   native function calling (qwen2.5-coder) and flaky ones (llama3.1:8b, ~50%)
>   write tool calls as JSON *inside the reply text*; the loop now parses those
>   (balanced-brace scan, fenced or bare, registry-names only — a package.json
>   `{"name":…}` never executes) and runs them. This was the real "model can't
>   search the net" bug: `web_search` was requested as text and dropped. Fixed
>   in the SHARED core → desktop benefits too (`parseTextToolCall` in out/main).
> - **`inside()` root bug** — `path.relative(root, root)` is `''`, so any path
>   resolving to the root itself (`list_dir .`) was rejected as "outside the
>   linked folders". Root now counts as inside; `..` escapes and other drives
>   still throw.
> - **Mid-stream input** — desktop: slash commands run while the model writes,
>   new messages interject (partial kept as *(cut off by your next message)*);
>   v2 REPL: commands execute immediately mid-turn (chained, EOF waits for
>   async `/search`), approval answers no longer double-consume input;
>   v1 TUI: a `/command` submitted during streaming stops the stream to run now.
> - **v2 tool awareness** — `prompt.ts` adds a Tools section when `settings.v2`,
>   v2 SYSTEM names `web_search` explicitly; verified live: `exec` →
>   `✓ web_search` → real result, exit 0. typecheck+build green.
>
> **STATUS (batch 5 done): both shells shipped.**
> - Terminal: `cli/codezy-v2.mjs` — readline REPL, interactive `y/N` gate on TTY,
>   piped input **denies** gated tools unless `--auto` (safe default). Verified
>   headless: commands-only pipe → exit 0; live llama3.1:8b run exercised the
>   full loop (write_file approved → executed → final text → exit 0) and the
>   deny path (run_command denied → loop continued → exit 0).
> - Desktop: `src/main/v2.ts` (`runV2`) imports `cli/lib/harness.mjs` directly
>   (types via `cli/lib/harness.d.mts`). Approval = promise resolved by the
>   renderer's `ApproveModal` via `chat:v2decision`; tool activity streams as
>   `v2tool` events into the chat's activity line; toggled by the new
>   **Agent mode (v2)** setting (`settings.v2`, default off). typecheck+build green.

**The harness ships in BOTH versions.** One UI-agnostic core, consumed by the
terminal v2 TUI *and* the Electron desktop app. It must not know anything about
its UI: model call, approval gate, and tool registry are all injected, so each
shell can wire its own (terminal `y/n` prompt vs the app's confirm dialog).

## What CODEZY is

A local-first coding assistant with two shells over the same brain:

- **Desktop app** (Electron, built): React sidebar + chat UI, Electron main is the
  only backend. Accent `#3d9bff`, no purple, dark/light/acrylic themes.
  Confirm-before-write edit flow with backups + undo ("confirm everything with me").
- **Terminal v1** (`cli/codezy.mjs`, DONE — leave intact): opencode-style TUI over
  `cli/lib/{engine,md,edits,search,usage}.mjs`. Chat + `===FILE/===SEARCH/===REPLACE/===END`
  edit blocks the user confirms. State in `~/.codezy` (settings.json, sessions/,
  terminal/, backups/, memory.md).

v1 can only *suggest* edits — the model writes edit blocks in prose and a JS
function applies them after confirmation. It never calls tools itself.

**v2 closes that gap: a real stateful tool-calling loop.**

## The loop

```
append prompt → send message history + JSON tools schema to Ollama → response
  ├─ response has tool_calls?
  │    → extract name/args
  │    → validate safety
  │    → [human-in-the-loop approval gate]
  │    → execute via registry
  │    → append assistant msg containing the EXACT tool_calls payload
  │    → append role:"tool" msg with output (matched by function name / call id)
  │    → loop (iteration counter++)
  └─ plain text? → return it, terminate
```

## Hard requirements

1. **Endpoint** — `POST http://127.0.0.1:11434` native chat API, or the
   OpenAI-compatible `/v1/chat/completions`. Use models with function calling
   (`qwen3-coder`, `llama3.1`). The payload **must override `"num_ctx": 65536`
   in `options`** — local models default to 4096 and context truncation
   silently breaks tool calling.
2. **Tools layer** — a strict JSON-schema array, each entry:
   - `name` — must match a key in the backend execution registry exactly
   - `description` — what/when to use it
   - `parameters` — JSON Schema: `type`, `properties`, `required`
   Registry maps name → async fn that validates args and returns a string
   result (candidates: read_file, list_dir, grep, write_file, run_command,
   web_search — reuse `cli/lib/search.mjs`).
3. **Stateful history** — ordered `system/user/assistant/tool` messages.
   When a tool fires, append TWO messages in order:
   1. the assistant message containing the exact `tool_calls` payload returned by Ollama
   2. a `role:"tool"` message with the runtime output, mapped back via matching
      function name / call ID
   Never drop, reorder, or rewrite them.
4. **Human-in-the-loop gate** — optional async middleware/hook that pauses the
   loop awaiting an approval event before executing `write_file` / `run_command`.
   Design as an injectable async fn (e.g. `approve(toolName, args) → boolean`)
   so the TUI can prompt `y/n` and tests can auto-approve.
5. **Termination** — hard iteration cap per chain, **5–10**. On cap: stop with a
   visible message. Prevents infinite / hallucinated tool loops.
6. **Safety validation before every execution** — paths confined to the linked
   folder, blocked commands. Same spirit as `applyEdits` in `cli/lib/edits.mjs`.
7. **v1 stays untouched** — v2 = NEW files only (`cli/codezy-v2.mjs` entry +
   `cli/lib/harness.mjs` loop/tools/registry/gate). Importing `cli/lib/*` is
   fine; never modify v1 files.

## Two consumers of the same core

The harness core (`cli/lib/harness.mjs`, plain ESM, zero deps) exposes the loop
as something like `runAgent({ history, tools, callModel, approve, maxIter, onEvent })`:

- **Terminal v2** (`cli/codezy-v2.mjs`) — feeds `callModel` from
  `lib/engine.mjs`-style streaming, `approve` blocks on a TUI `y/n` prompt,
  `onEvent` draws tool activity on the TUI screen.
- **Desktop app** (`src/main/…`) — Electron main imports the SAME core file;
  `approve` returns a promise resolved by the renderer's confirm dialog
  (existing confirm-before-write UX), `onEvent` streams tool events over IPC.

The core must therefore:
- run in plain Node AND in Electron main (no browser/Node-specific globals
  outside the injected parts — use `fetch`, injectable fs/shell access)
- be side-effect free on import (no terminal writes, no stdin handling)
- report progress via the `onEvent` callback instead of printing

If electron-vite can't import a `.mjs` from `cli/lib/` directly, resolve it
(adjust the main-process build config or add a thin re-export) — do NOT fork the
logic into a second copy.

## Reuse from v1 / app

- `cli/lib/engine.mjs` — SSE/stream parsing, headers, effort presets
  (light `{0.9, num_ctx 4096, predict 1024}` / medium `{0.6, 8192, 2048}` /
  deep `{0.2, 16384, 4096}`) — v2 likely wants a higher ctx floor.
- `cli/lib/edits.mjs` — path safety, backup/undo conventions.
- `cli/codezy.mjs` — settings/DIRS conventions (`~/.codezy`, dataDir re-root),
  renderer/input patterns if v2 gets a TUI.
- `src/main/ollama.ts` — reference for the native `num_ctx` override.
- `src/main/prompt.ts` — BASE_INSTRUCTIONS, fileTree, message trimming.

## Testing (headless ONLY — no windows, no focus stealing)

- `node --check` on every new file.
- DI harness: inject a fake model fn returning canned `tool_calls` responses;
  assert:
  - approval gate actually pauses the loop (pending promise → resolve → resumes)
  - iteration cap stops a always-returns-tool_calls model at N
  - assistant `tool_calls` + `role:"tool"` messages pair correctly by name/id
  - `options.num_ctx === 65536` present in every outgoing payload
  - plain-text response terminates with no tool execution
- piped regression: pipe commands in, expect exit 0.
- the shared core gets tested ONCE, shell-independently (fake `approve`,
  fake registry) — both consumers then only need a thin wiring check.
- app side: verify Electron main can import the core and that an approval
  promise resolves from the renderer dialog (still headless — no live UI).

## Environment gotchas

- PowerShell 5 shell: no `&&` (use `;` / `foreach`), backticks get mangled in
  `node -e` → write `.mjs` files instead of inline JS.
- Node v24.21.0, plain ESM, no build step, no dependencies in `cli/`.
- Ollama confirmed live at `http://127.0.0.1:11434` (current model
  `qwen2.5-coder:7b`, default `num_ctx` 4096).
- Ask the user before anything destructive — the standing rule is
  "confirm everything with me".

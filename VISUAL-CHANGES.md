# Visual & UX Changes — Codezy CLI

## Overview

This document records all visual and quality-of-life improvements made to the Codezy CLI terminal interface.

---

### 1. Tool Labels — Icons for Visual Scanning

**File:** `src/render/chrome.mjs`

Every tool label in the activity log now carries an emoji icon so you can scan
the transcript at a glance instead of reading each verb.

| Tool         | Before    | After        |
|--------------|-----------|--------------|
| read_file    | Read      | 📄 Read      |
| write_file   | Write     | 📝 Write     |
| edit_file    | Edit      | ✏️ Edit      |
| list_dir     | List      | 📁 List      |
| grep_search  | Grep      | 🔍 Grep      |
| run_command  | Run       | ⚡ Run       |
| web_search   | Web       | 🌐 Search    |
| web_fetch    | Fetch     | 🔗 Fetch     |
| todo_write   | Plan      | 📋 Plan      |
| ask_user     | Ask       | 💬 Ask       |

---

### 2. Welcome Screen — Compact Block Logo & Icons

**File:** `src/render/chrome.mjs`

The wordmark uses a compact 4-row block art logo. The original 6-row block logo
consumed too much vertical space on the home screen — the input box was pushed
below the fold on 24-row terminals. The compact version keeps the brand gesture
while giving the user more room to work.

**Changes:**
- Logo: 6-row block → 4-row compact version
- Tagline: "a coding agent in your terminal" → "coding agent in your terminal" (integrated)
- Runtime facts: condensed to a single line instead of two
- Workspace: shows with 📂 icon
- Quick start section: renamed from "start here" to "quick start" with icons:
  - 💡 explain this codebase
  - 🐛 fix failing tests
  - ✨ add a feature
  - 🔎 review my diff
- Footer commands: each prefixed with an icon:
  - ❓ /help — commands
  - 🔄 /model — switch
  - 🎨 /theme — palette
  - 🚪 /exit — quit
- Warning notes: prefixed with ⚠ icon

---

### 3. Activity Output — Checkmark/Cross Icons

**File:** `src/render/chrome.mjs`

The `activity()` function now uses ✓/✕ instead of ◉ for tool outcomes, making
success/failure instantly scannable.

| Outcome | Before | After  |
|---------|--------|--------|
| Success | ◉      | ✓      |
| Failure | ◉      | ✕      |

---

### 4. Assistant Blocks — Spark Icon

**File:** `src/render/chrome.mjs`

The `assistantBlock()` function now uses ✦ instead of ◉ for the assistant's
response bullet, distinguishing it from tool activity markers.

---

### 5. Stat Line — Icons & Steps

**File:** `src/render/chrome.mjs`

The closing stat line after each turn now shows:
- ⏱ time elapsed
- 📊 token count
- 🔄 step count (new — was not shown before)
- 🧠 thinking mode indicator (when active)

Example: `✓ ⏱ 12s · 📊 12,041 tokens · 🔄 5 steps · 🧠 thinking`

---

### 6. Settings Screen — Section Icons

**File:** `src/render/chrome.mjs`

Both `settingsPanel()` and `settingsScreen()` now prefix section headers with
icons for faster visual navigation:

| Section     | Icon |
|-------------|------|
| appearance  | 🎨   |
| model       | 🧠   |
| session     | ⚙️   |
| workspace   | 📂   |

The `settingsScreen()` function uses an icon map so any section name that
matches gets its icon automatically; unknown sections fall back to ▎.

---

### 7. Status Bar — Persistent Bottom Line

**Files:** `src/shell/screen.mjs`, `src/shell/agent.mjs`

A new status bar sits on the last row of the chat screen, showing at a glance:

```
agent · qwen2.5-coder · codezy-cli  ·  12.4k tokens  ·  3 calls
```

**What it shows:**
- Current mode (agent/chat/plan/auto)
- Active model name
- Workspace directory name
- Total session tokens (formatted: 12.4k, 1,204, etc.)
- Total model calls

The status bar is set via `screen.setStatusBar(text)` and updates after each
turn completes. It only appears when the chat screen is active and the terminal
is at least 4 rows tall.

---

### 8. Input Queue — Visual Feedback

**File:** `src/shell/agent.mjs`

When you type a message while the agent is busy (mid-turn), your message is
queued for after the current turn. Previously this happened silently. Now you
see immediate feedback:

```
⏳ queued (1) your message text here...
```

The status line shows:
- ⏳ hourglass icon indicating queued state
- Queue count in parentheses
- Preview of the message (truncated to 60 chars with …)

Multiple queued messages increment the counter: `⏳ queued (2)`, `⏳ queued (3)`, etc.

The queue is cleared when `drain()` starts processing, so the feedback disappears
when your messages begin being handled.

---

### 9. Longer Coding Sessions — Increased Iteration Budget

**File:** `src/shell/agent.mjs`

The maximum tool-call iterations per turn (how many steps the agent can take
before stopping) was increased for longer coding tasks:

| Mode      | Before | After |
|-----------|--------|-------|
| chat      | 8      | 8     |
| plan      | 8      | 8     |
| agent     | 8      | 20    |
| auto      | 8      | 20    |
| thinking  | 16     | 32    |

Agent and auto modes get **20 iterations** (2.5× more) for complex multi-file
edits. Thinking mode gets **32 iterations** for deep reasoning tasks. The finish
guard (checklist enforcement) still prevents premature termination.

---

### 10. ASCII Borders — No More Garbled Characters

**Files:** `src/render/chrome.mjs`, `src/render/frame.mjs`, `src/shell/chat.mjs`

Unicode box-drawing characters (╭, ╮, ╰, ╯, │) rendered as garbled text ("c d p e")
in terminals that don't support the Latin-1 Supplement block. All panel borders
now use plain ASCII characters that render correctly everywhere.

| Element       | Before (Unicode) | After (ASCII) |
|---------------|-------------------|---------------|
| Corner TL/TR  | ╭ / ╮             | +             |
| Corner BL/BR  | ╰ / ╯             | +             |
| Vertical bar  | │                 | \|            |
| Title bar     | ╭─ title ───────╮ | +-- title ---+ |

This affects all panels: the welcome banner frame, settings panels, model picker,
question boxes (ask_user), and the chat shell card renderer.

---

### 11. Input Box — Gray Background

**File:** `src/render/chrome.mjs`

The input box on the home screen now has a gray background surface (using the
theme's `elevated` background color) so the input area reads as a distinct
raised panel instead of text on the terminal's default background.

The body rows of the input box are wrapped with `p.raised()` which applies the
theme-appropriate background color:
- Graphite theme: `#1D2025` (dark gray)
- Paper theme: `#E7E4DA` (light gray)
- Contrast theme: `#1A1A1A` (near-black gray)

The border characters changed from Unicode (╭─╮) to ASCII (+--+--) as part of
the garbled text fix (change #10).

---

### 12. /model Command — Inline Display

**File:** `src/shell/agent.mjs`

`/model` with no argument no longer opens a full-screen overlay menu. Instead,
it displays the current model information inline in the chat, keeping the prompt
visible and ready for the next command.

**`/model` (no args) — shows inline model info:**
```
▎ model info
  main     qwen2.5-coder:7b  · 65,536 ctx
  fast     off — everything runs on the main model
  provider ollama
  endpoint http://127.0.0.1:11434
  context  65,536

  /model <name>        switch main model
  /model fast <name>   set fast model
  /model list          show available models
```

**`/model list` — shows available models inline:**
```
▎ available models
  ▸ qwen2.5-coder:7b    · 8GB  main
    llama3.1:8b         · 4GB
    mistral:7b          · 4GB
```

The overlay picker is still accessible when needed — the model list appears
when the endpoint is queried, with the current model marked with ▸ and the
fast model marked with ·.

---

## Files Changed

| File                          | Changes                              |
|-------------------------------|--------------------------------------|
| `src/render/chrome.mjs`       | Tool labels, logo, banner, activity, |
|                               | statLine, assistantBlock, settings,  |
|                               | ASCII borders, gray input box        |
| `src/render/frame.mjs`        | ASCII borders (corner chars)         |
| `src/shell/screen.mjs`        | Status bar rendering, setStatusBar() |
| `src/shell/chat.mjs`          | ASCII borders (card renderer)        |
| `src/shell/agent.mjs`         | Queue feedback, status bar wiring,   |
|                               | maxIter increase, /model inline      |

## No Breaking Changes

All changes are purely visual/UX. No API or behavior changes. The `/model`
command still works the same way for switching models (`/model <name>`),
but now shows its info inline instead of as a full-screen menu.

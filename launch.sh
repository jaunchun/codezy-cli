#!/usr/bin/env bash
# CODEZY terminal UI launcher for macOS/Linux — runs the TUI from THIS
# folder (double-clickable on a Mac after `chmod +x`, or from any shell).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "node is required - install it from https://nodejs.org, then run this again."
  read -r -p "Press Enter to close"
  exit 1
fi
node "$PWD/index.mjs" "$@"
code=$?
if [ "$code" -ne 0 ]; then
  echo "codezy exited with code $code"
  read -r -p "Press Enter to close"
fi
exit "$code"

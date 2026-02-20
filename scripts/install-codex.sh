#!/usr/bin/env bash
set -euo pipefail

if [[ "${AGENT:-}" != "codex" ]]; then
  echo "Skipping Codex install because AGENT is not set to 'codex'."
  exit 0
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI not found. Installing @openai/codex-sdk..."
  npm install -g @openai/codex-sdk
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI installation check failed."
  exit 1
fi

echo "Authenticate Codex before continuing."
echo "Run: codex auth"
until codex auth status >/dev/null 2>&1; do
  read -r -p "Press Enter after running 'codex auth' to re-check: " _
done

echo "Codex auth confirmed."

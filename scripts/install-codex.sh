#!/usr/bin/env bash
set -euo pipefail

if [[ "${AGENT:-}" != "codex" ]]; then
  echo "Skipping Codex install because AGENT is not set to 'codex'."
  exit 0
fi

npm install -g @openai/codex-sdk

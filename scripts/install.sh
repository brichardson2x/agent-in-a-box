#!/usr/bin/env bash
set -euo pipefail

if [[ -f /etc/os-release ]]; then
  source /etc/os-release
  case "${ID:-}" in
    rocky|centos|rhel|almalinux)
      ;;
    *)
      if [[ "${ID_LIKE:-}" != *rhel* && "${ID_LIKE:-}" != *fedora* ]]; then
        echo "This installer requires a RHEL-compatible distro with dnf (Rocky, CentOS, RHEL, AlmaLinux). Found ${ID:-unknown}."
        exit 1
      fi
      ;;
  esac
fi

sudo dnf install -y git sqlite curl tar python3 python3-pip

# Install nvm & Node.js LTS
if [[ ! -d "$HOME/.nvm" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
fi

set +u
source "$HOME/.nvm/nvm.sh"
nvm install --lts
nvm use --lts
set -u

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Copied .env.example to .env. Please populate the file before running the service."
fi

prompt_choice() {
  local prompt="$1"
  shift
  local valid=("$@")
  local value
  while true; do
    read -r -p "$prompt " value
    value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
    for option in "${valid[@]}"; do
      if [[ "$value" == "$option" ]]; then
        printf '%s\n' "$value"
        return 0
      fi
    done
    echo "Invalid choice: '$value'. Valid options: ${valid[*]}"
  done
}

set_env_var() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

ensure_npm_global_bin_on_path() {
  local npm_prefix
  npm_prefix="$(npm config get prefix 2>/dev/null || true)"
  if [[ -n "$npm_prefix" && "$npm_prefix" != "undefined" && "$npm_prefix" != "null" ]]; then
    if [[ -d "$npm_prefix/bin" && ":$PATH:" != *":$npm_prefix/bin:"* ]]; then
      export PATH="$npm_prefix/bin:$PATH"
    fi
  fi
}

prompt_manual_install() {
  local binary="$1"
  local install_hint="$2"
  echo "Automatic install for '$binary' failed."
  echo "$install_hint"
  until command -v "$binary" >/dev/null 2>&1; do
    read -r -p "Install '$binary' manually, ensure it is on PATH, then press Enter to re-check: " _
  done
}

ensure_gh() {
  if command -v gh >/dev/null 2>&1; then
    return 0
  fi

  echo "GitHub CLI (gh) not found. Trying dnf package..."
  if ! sudo dnf install -y gh; then
    echo "dnf package 'gh' not available. Trying official GitHub CLI repo..."
    sudo dnf install -y 'dnf-command(config-manager)' || true
    if ! sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo; then
      echo "Could not add GitHub CLI repo."
    fi
    sudo dnf install -y gh || true
  fi

  if ! command -v gh >/dev/null 2>&1; then
    prompt_manual_install gh "Manual fallback: https://github.com/cli/cli#installation"
  fi
}

ensure_glab() {
  if command -v glab >/dev/null 2>&1; then
    return 0
  fi

  echo "GitLab CLI (glab) not found. Trying dnf package..."
  if ! sudo dnf install -y glab; then
    echo "dnf package 'glab' not available. Trying direct RPM..."
    local glab_rpm_url="https://github.com/profclems/glab/releases/latest/download/glab_linux_amd64.rpm"
    if ! curl -fsSL "$glab_rpm_url" -o /tmp/glab.rpm; then
      echo "Could not download glab RPM."
    else
      sudo dnf install -y /tmp/glab.rpm || true
    fi
  fi

  if ! command -v glab >/dev/null 2>&1; then
    prompt_manual_install glab "Manual fallback: https://gitlab.com/gitlab-org/cli#installation"
  fi
}

ensure_copilot_cli() {
  ensure_npm_global_bin_on_path
  if command -v copilot >/dev/null 2>&1; then
    return 0
  fi

  echo "Copilot CLI not found. Trying npm global install..."
  npm install -g @github/copilot || true
  ensure_npm_global_bin_on_path
  if ! command -v copilot >/dev/null 2>&1; then
    echo "Retrying Copilot CLI install with --unsafe-perm..."
    npm install -g --unsafe-perm @github/copilot || true
    ensure_npm_global_bin_on_path
  fi

  if ! command -v copilot >/dev/null 2>&1; then
    prompt_manual_install copilot "Manual fallback: npm install -g @github/copilot"
  fi
}

ensure_codex_cli() {
  ensure_npm_global_bin_on_path
  if command -v codex >/dev/null 2>&1; then
    return 0
  fi

  echo "Codex CLI not found. Trying npm global install..."
  npm install -g @openai/codex-sdk || true
  ensure_npm_global_bin_on_path
  if ! command -v codex >/dev/null 2>&1; then
    echo "Retrying Codex CLI install with --unsafe-perm..."
    npm install -g --unsafe-perm @openai/codex-sdk || true
    ensure_npm_global_bin_on_path
  fi

  if ! command -v codex >/dev/null 2>&1; then
    prompt_manual_install codex "Manual fallback: npm install -g @openai/codex-sdk"
  fi
}

CODEX_MODELS=(
  gpt-5.3-codex
  gpt-5.2-codex
  gpt-5.1-codex-max
  gpt-5.1-codex
  gpt-5.1-codex-mini
  gpt-5-mini
  gpt-4.1
)

COPILOT_MODELS=(
  claude-sonnet-4.6
  claude-sonnet-4.5
  claude-haiku-4.5
  claude-opus-4.6
  claude-opus-4.6-fast
  claude-opus-4.5
  claude-sonnet-4
  gemini-3-pro-preview
  gpt-5.3-codex
  gpt-5.2-codex
  gpt-5.2
  gpt-5.1-codex-max
  gpt-5.1-codex
  gpt-5.1
  gpt-5.1-codex-mini
  gpt-5-mini
  gpt-4.1
)

platform="$(prompt_choice "Platform (github/gitlab):" github gitlab)"
agent="$(prompt_choice "Agent (copilot/codex):" copilot codex)"
model_mode="$(prompt_choice "Model mode (default/custom):" default custom)"

set_env_var PLATFORM "$platform"
set_env_var AGENT "$agent"
set_env_var MODEL_SELECTION_MODE "$model_mode"

case "$agent" in
  codex)
    if [[ "$model_mode" == "custom" ]]; then
      codex_model="$(prompt_choice "Codex model (${CODEX_MODELS[*]}):" "${CODEX_MODELS[@]}")"
    else
      codex_model="default"
    fi
    set_env_var CODEX_MODEL "$codex_model"
    ;;
  copilot)
    if [[ "$model_mode" == "custom" ]]; then
      copilot_model="$(prompt_choice "Copilot model (${COPILOT_MODELS[*]}):" "${COPILOT_MODELS[@]}")"
    else
      copilot_model="default"
    fi
    set_env_var COPILOT_MODEL "$copilot_model"
    ;;
esac

case "$platform" in
  github)
    ensure_gh
    ;;
  gitlab)
    ensure_glab
    ;;
esac

case "$agent" in
  codex)
    ensure_codex_cli
    echo "Authenticate Codex before continuing."
    echo "Run: codex login"
    until codex login status >/dev/null 2>&1; do
      read -r -p "Press Enter after running 'codex login' to re-check: " _
    done
    echo "Codex auth confirmed."
    ;;
  copilot)
    ensure_copilot_cli
    echo "Authenticate Copilot CLI before continuing."
    echo "Run: copilot login"
    until copilot login; do
      read -r -p "Press Enter to retry 'copilot login': " _
    done
    echo "Copilot auth confirmed."
    ;;
esac

set -a
source .env
set +a

echo "Reminder: if auth expires, re-run the agent auth command and restart with: systemctl restart gitAgent"

case "$platform" in
  github)
    cat <<'EOF'
PLATFORM=github setup checklist:
- Create a GitHub App (account or org settings).
- Permissions: Issues (read/write), Pull Requests (read/write), Contents (read/write), Metadata (read).
- Events: Issue comments, Pull request review comments.
- Install the app on the target repository.
- Download the private key (.pem) to this host.
- Add App ID, Installation ID, Client ID, and private key path to .env.
EOF
    ;;
  gitlab)
    cat <<'EOF'
PLATFORM=gitlab setup checklist:
- Create a GitLab OAuth Application (User Settings -> Applications).
- Create a project/group access token with api and write_repository scopes.
- Set the bot token role to Developer on the target project/group.
- Configure the project webhook URL and set the webhook secret.
- Add GITLAB_APP_ID, GITLAB_APP_SECRET, GITLAB_BOT_TOKEN, and GITLAB_WEBHOOK_SECRET to .env.
EOF
    ;;
  *)
    echo "Unsupported PLATFORM value in .env: '${PLATFORM:-}' (expected github or gitlab)."
    exit 1
    ;;
esac

read -r -p "Press Enter after completing the platform app setup checklist and updating .env: " _

sudo mkdir -p /etc/gitagent
sudo cp .env /etc/gitagent/.env

npm ci
npm run build
npm run test

sudo cp gitAgent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gitAgent.service

curl -fsS "http://localhost:${PORT:-3000}/health"

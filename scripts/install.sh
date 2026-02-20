#!/usr/bin/env bash
set -euo pipefail

REQUIRED_OS="rocky"

if [[ -f /etc/os-release ]]; then
  source /etc/os-release
  if [[ "${ID:-}" != "$REQUIRED_OS" ]]; then
    echo "This installer is targeted at Rocky Linux but found $ID"
    exit 1
  fi
fi

sudo dnf install -y git sqlite curl tar python3 python3-pip

# Install nvm & Node.js LTS
if [[ ! -d "$HOME/.nvm" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
fi

source "$HOME/.nvm/nvm.sh"
nvm install --lts
nvm use --lts

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

ensure_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    sudo dnf install -y gh
  fi
}

ensure_glab() {
  if ! command -v glab >/dev/null 2>&1; then
    local glab_rpm_url="https://github.com/profclems/glab/releases/latest/download/glab_linux_amd64.rpm"
    curl -fsSL "$glab_rpm_url" -o /tmp/glab.rpm
    sudo dnf install -y /tmp/glab.rpm
  fi
}

platform="$(prompt_choice "Platform (github/gitlab):" github gitlab)"
agent="$(prompt_choice "Agent (copilot/codex):" copilot codex)"

set_env_var PLATFORM "$platform"
set_env_var AGENT "$agent"

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
    ;;
  copilot)
    ensure_gh
    echo "Authenticate GitHub CLI before continuing."
    echo "Run: gh auth login"
    until gh auth status >/dev/null 2>&1; do
      read -r -p "Press Enter after running 'gh auth login' to re-check: " _
    done
    echo "GitHub CLI auth confirmed."
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

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

sudo dnf install -y git sqlite curl tar

# Install nvm & Node.js LTS
if [[ ! -d "$HOME/.nvm" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
fi

source "$HOME/.nvm/nvm.sh"
nvm install --lts
nvm use --lts

# Install GitHub CLI
sudo dnf install -y gh || true

# Install GitLab CLI (glab)
GLAB_RPM_URL="https://github.com/profclems/glab/releases/latest/download/glab_linux_amd64.rpm"
curl -fsSL "$GLAB_RPM_URL" -o /tmp/glab.rpm
sudo dnf install -y /tmp/glab.rpm

# Install act (GitHub Actions runner)
curl -fsSL https://github.com/nektos/act/releases/latest/download/act-linux-amd64 -o /usr/local/bin/act
chmod +x /usr/local/bin/act

npm ci

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Copied .env.example to .env. Please populate the file before running the service."
fi

set -a
source .env
set +a

agent="$(printf '%s' "${AGENT:-}" | tr '[:upper:]' '[:lower:]')"
platform="$(printf '%s' "${PLATFORM:-}" | tr '[:upper:]' '[:lower:]')"

case "$agent" in
  codex)
    bash "$(dirname "$0")/install-codex.sh"
    ;;
  copilot)
    if ! command -v gh >/dev/null 2>&1; then
      sudo dnf install -y gh
    fi
    echo "Authenticate GitHub CLI before continuing."
    echo "Run: gh auth login"
    until gh auth status >/dev/null 2>&1; do
      read -r -p "Press Enter after running 'gh auth login' to re-check: " _
    done
    echo "GitHub CLI auth confirmed."
    ;;
  *)
    echo "Unsupported AGENT value in .env: '${AGENT:-}' (expected codex or copilot)."
    exit 1
    ;;
esac

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

npm run build
npm run test

mkdir -p /etc/systemd/system
cp gitAgent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gitAgent.service

curl -fsS "http://localhost:${PORT:-3000}/health"

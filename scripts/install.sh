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

sudo mkdir -p /etc/gitagent
sudo cp .env /etc/gitagent/.env

npm run build
npm run test

mkdir -p /etc/systemd/system
cp gitAgent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gitAgent.service

curl -fsS "http://localhost:${PORT:-3000}/health"

# GitAgent

GitAgent is a self-hosted service that listens for GitHub/GitLab mentions, invokes an AI coding agent, applies changes on a feature branch, and opens a pull request with traceability via SQLite sessions.

## Getting started

Installer target: dnf-based RHEL-family distros (`rocky`, `centos`, `rhel`, `almalinux`).

**Important**: Run the installer as your regular user (not root, not with sudo). The script will prompt for sudo when needed for system packages.

1. Run `bash scripts/install.sh` from the repo root as your regular user and choose your platform (`github` or `gitlab`), agent (`copilot` or `codex`), and model mode (`default` or `custom`) when prompted.
2. The installer copies `.env.example` to `.env` if needed, installs base dependencies (including Python + pip + native build tools), installs Node.js `20` by default via nvm (`NODE_VERSION` override supported), and installs/authenticates only the selected platform/agent tooling.
3. CLI installer fallback behavior:
   - `copilot` / `codex`: tries npm global install first, retries with `--unsafe-perm`, then prompts for manual install.
   - `gh` / `glab`: tries dnf package first, then repo/RPM fallback, then prompts for manual install.
   - If project setup fails on a custom Node version, installer retries with Node `20` for native module compatibility.
   - Manual fallback mode pauses and keeps re-checking until the selected CLI is installed and available on `PATH`.
4. Fill in the required `.env` values for your platform (`GITHUB_APP_*` for GitHub, or `GITLAB_APP_*` + `GITLAB_BOT_TOKEN` for GitLab).
   - For GitHub, `GITHUB_APP_ID` must be the App ID from GitHub App settings (not account/org ID or installation target ID).
5. Configure your platform webhook to point at `/webhook` and use the matching secret (`WEBHOOK_SECRET` for GitHub, `GITLAB_WEBHOOK_SECRET` for GitLab).
   - Mentions must match `BOT_HANDLE` (for example, `BOT_HANDLE=copilot-box` means use `@copilot-box`).
6. Optional firewall automation: set `OPEN_FIREWALL_PORT=true` in `.env` to auto-open `${PORT:-3000}/tcp` via `firewall-cmd` when available.

The installer creates a wrapper script at `/usr/local/bin/gitagent-wrapper.sh` that sources nvm and launches the service. The systemd unit runs as your user and can access nvm-installed Node.
The systemd unit reads environment values directly from your repo `.env` file, so `.env` updates are picked up on service restart.
On health-check failure, installer prints `systemctl status` and recent `journalctl` logs so startup/config errors are visible immediately.

### Agent model settings

- `MODEL_SELECTION_MODE` exact choices: `default` or `custom`.
- `CODEX_MODEL` is the model name used when `AGENT=codex` (passed to `codex --model`).
- `COPILOT_MODEL` is the model name used when `AGENT=copilot` (passed to `copilot --model`).

Codex model names (exact installer choices):
- `gpt-5.3-codex`
- `gpt-5.2-codex`
- `gpt-5.1-codex-max`
- `gpt-5.1-codex`
- `gpt-5.1-codex-mini`
- `gpt-5-mini`
- `gpt-4.1`

Copilot model names (exact supported values):
- `claude-sonnet-4.6`
- `claude-sonnet-4.5`
- `claude-haiku-4.5`
- `claude-opus-4.6`
- `claude-opus-4.6-fast`
- `claude-opus-4.5`
- `claude-sonnet-4`
- `gemini-3-pro-preview`
- `gpt-5.3-codex`
- `gpt-5.2-codex`
- `gpt-5.2`
- `gpt-5.1-codex-max`
- `gpt-5.1-codex`
- `gpt-5.1`
- `gpt-5.1-codex-mini`
- `gpt-5-mini`
- `gpt-4.1`

## Scripts

- `npm run build` compiles TypeScript to `dist/`.
- `npm start` launches the compiled server.
- `npm run dev` runs `tsx watch src/index.ts` with automatic reloads.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test` executes the Vitest suite.

## References

- Project schema and task list are documented in `plans/GitAgent_Spec_Sheet.md` and `plans/GitAgent_Task_List.md`.

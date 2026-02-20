# GitAgent — Specification Sheet
*AI-Powered Issue-to-PR Agent via Git Platform Webhooks*

---

## 1. System Overview

GitAgent is a self-hosted, single-tenant backend service that monitors a Git platform (GitHub or GitLab — selected at deploy time) for issue and PR mentions. When the configured bot handle is mentioned, the agent receives the issue/PR context as a prompt, invokes an AI coding agent (OpenAI Codex CLI or GitHub Copilot — selected at deploy time), executes the work autonomously on the host machine, and pushes results to a new branch. It then opens a pull request, requests a review from the configured reviewer, and communicates back in the original thread. All conversation turns are tracked in a session tied to the issue/PR pair, enabling multi-turn collaboration.

---

## 2. Design Principles

- Single-tenant per box — one running instance serves one repo and one platform config
- Platform-agnostic interface — GitHub and GitLab supported via adapter pattern, one selected per deployment
- Agent-agnostic interface — Codex CLI and Copilot SDK supported, one selected per deployment
- No frontend — purely webhook-driven, all interaction happens in the Git platform UI
- Minimal services — SQLite for persistence, systemd for process management, no separate DB daemon
- Full host access — agent runs with full filesystem and network access on the isolated machine
- Env-var driven configuration — no important values hardcoded

---

## 3. Architecture

### 3.1 Runtime Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend Runtime | Node.js + TypeScript | Express.js HTTP server |
| AI Agent — Option A | OpenAI Codex CLI (@openai/codex-sdk) | Spawned as child process per job |
| AI Agent — Option B | GitHub Copilot SDK (@github/copilot-sdk) | Imported in-process, runs per job |
| Git Platform — Option A | GitHub (via GitHub CLI + REST API) | Selected via PLATFORM env var |
| Git Platform — Option B | GitLab Cloud (via GitLab CLI + REST API) | Selected via PLATFORM env var |
| Persistence | SQLite via better-sqlite3 | Single file, no daemon required |
| Process Management | systemd | Express backend kept alive across reboots |
| OS Target | Rocky Linux | Bare metal / VM install |

### 3.2 Required Binaries (Host-Installed)

| Binary | Purpose | Install Method |
|---|---|---|
| Node.js + npm | Runtime for Express backend | Install script (nvm or dnf) |
| git | Repo operations — clone, branch, commit, push | dnf |
| GitHub CLI (gh) | GitHub API interactions, PR creation | Install script |
| GitLab CLI (glab) | GitLab API interactions, PR creation | Install script |
| OpenAI Codex CLI | AI agent option A — autonomous coding tasks | npm install -g or per docs |
| act | Local GitHub Actions workflow runner for dev/testing | Install script |
| sqlite3 | DB CLI for inspection/debugging | dnf |

### 3.3 Data Flow

- Git platform (GitHub/GitLab) sends a webhook event to the Express backend on mention
- Backend parses the event, extracts issue/PR context, mention body, and metadata
- Backend looks up or creates a session in SQLite keyed to the issue/PR ID pair
- Configured system instructions (`AGENT_SYSTEM_PROMPT` env var) are prepended to the prompt
- The selected AI agent (Codex or Copilot) is invoked with the full prompt + session history
- Agent performs work: reads/writes files, runs commands, operates in repo directory
- Backend commits changes to a new branch (`feature/`, `fix/`, or `misc/` prefix — agent determines)
- Backend pushes branch and creates a PR linking back to the originating issue
- Backend requests a review from `REVIEWER_USERNAME` env var
- Backend posts a comment in the originating issue (or PR if already in PR context) with a link to the new PR
- Subsequent mentions in the same issue or linked PR continue the same session

---

## 4. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PLATFORM` | Yes | Git platform: `github` or `gitlab` |
| `AGENT` | Yes | AI agent backend: `codex` or `copilot` |
| `BOT_HANDLE` | Yes | The @mention handle the bot listens for (without @) |
| `PLATFORM_TOKEN` | Yes | Personal access token for GitHub or GitLab API |
| `REVIEWER_USERNAME` | Yes | Platform username to request PR review from |
| `WEBHOOK_SECRET` | Yes | Secret to validate incoming webhook payloads |
| `REPO_PATH` | Yes | Absolute path on host where the target repo is checked out |
| `REPO_REMOTE` | Yes | Git remote URL of the target repo |
| `AGENT_SYSTEM_PROMPT` | Yes | Instructions prepended to every agent prompt |
| `OPENAI_API_KEY` | Codex only | API key for OpenAI Codex |
| `COPILOT_TOKEN` | Copilot only | Auth token for GitHub Copilot SDK |
| `SQLITE_PATH` | No | Path to SQLite DB file (default: `./data/agent.db`) |
| `PORT` | No | HTTP port for Express server (default: `3000`) |
| `LOG_LEVEL` | No | Logging verbosity: `debug`, `info`, `warn`, `error` (default: `info`) |
| `DEFAULT_BRANCH` | No | Base branch for PRs (default: `main`) |

---

## 5. Session Model

Sessions are the core persistence unit. A session ties together an issue, its linked PR (once created), and the full conversation history passed to the agent on each invocation.

### 5.1 SQLite Schema — `sessions` table

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | UUID generated at session creation |
| `issue_id` | TEXT NOT NULL | Platform issue ID (e.g. `github-owner-repo-42`) |
| `pr_id` | TEXT | Platform PR ID once PR is created — nullable |
| `platform` | TEXT NOT NULL | `github` or `gitlab` |
| `repo` | TEXT NOT NULL | `owner/repo` identifier |
| `branch` | TEXT | Branch created for this session |
| `history` | TEXT | JSON array of conversation turns |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

### 5.2 Session Lifecycle

- Created when bot is first mentioned in an issue with no existing session
- Issue ID and PR ID are linked in the same session record when PR is created
- Mentions in the linked PR resolve to the same session — agent receives full history
- Session persists indefinitely (no expiry — matches CLI agent default behavior)

---

## 6. Git Branching & PR Behavior

- Agent always works on a new branch — never commits to main or base branch
- Branch naming: agent determines `feature/`, `fix/`, or `misc/` prefix based on issue content, followed by a slug derived from the issue title or number
- Example branch names: `feature/user-auth-42`, `fix/null-pointer-issue-7`, `misc/update-readme-15`
- PR is always created against `DEFAULT_BRANCH`
- PR description includes: summary of changes, link back to originating issue, session ID for traceability
- Review request is always sent to `REVIEWER_USERNAME` on PR creation
- If push fails (permissions, conflicts, etc.), agent posts a comment in the issue explaining the failure and awaiting direction — that issue thread remains the active session context

---

## 7. Communication Routing Rules

- Bot is mentioned in an issue → agent works → posts update in the issue → opens PR → links PR to issue → subsequent communication moves to PR
- Bot is mentioned in a PR → agent works in that PR's session → responds in the PR
- All responses are posted as comments using the platform API under the bot's token
- If no PR exists yet (first mention in issue), response goes to issue thread
- Once PR is created, response and all future turns go to the PR thread

---

## 8. Installation

### 8.1 Install Script Responsibilities

- Detect Rocky Linux and verify compatibility
- Install dnf packages: git, sqlite, curl, tar
- Install nvm and Node.js LTS
- Install GitHub CLI (`gh`) from official RPM
- Install GitLab CLI (`glab`) from official binary
- Install `act` from GitHub releases
- Install npm dependencies (`npm ci`)
- Create `.env` file from `.env.example` with prompts for required values
- Initialize SQLite database file and run schema migrations
- Write and enable systemd service unit for the Express backend
- Start and verify the service is running

### 8.2 Webhook Setup

- User must configure a webhook on their GitHub repo or GitLab project pointing to `http(s)://HOST:PORT/webhook`
- Webhook events: Issues (comments), Pull Requests (comments) — or equivalent GitLab events
- `WEBHOOK_SECRET` must match the value configured on the platform

---

## 9. Constraints & Non-Goals

- Single repository per running instance — multi-repo support is not in scope
- Single platform and single agent per instance — no runtime switching
- No authentication layer — webhook secret is the only inbound security mechanism
- No billing, rate limiting, or quota management
- No frontend or dashboard
- No email or notification system beyond platform comments

# GitAgent — Task List
*Phased implementation plan with agent context boundaries*

---

This project is organized into 3 phases. Each phase is designed to be handed to a separate agent with its own focused context. Phases are sequential — each builds on the last.

---

## Phase 1 — Project Scaffold & Infrastructure

**Context for agent:** Set up the repository structure, TypeScript config, Express skeleton, SQLite integration, install script, and systemd service. No AI agent or Git platform integration yet — this phase produces a running, deployable skeleton on Rocky Linux.

---

### Task 1.1 — Repository & TypeScript Setup

- Initialize npm project with `package.json`
  - Set name, version, description, scripts (`build`, `start`, `dev`, `lint`, `typecheck`)
  - Set type to `commonjs`
- Install and configure TypeScript
  - `tsconfig.json` targeting ES2022, strict mode, output to `dist/`
  - Install `ts-node` and `tsx` for dev runtime
- Install and configure ESLint + Prettier
  - `eslint.config` with `typescript-eslint`
  - `.prettierrc` with consistent formatting rules
- Set up directory structure
  - `src/routes/`, `src/services/`, `src/adapters/`, `src/agents/`, `src/db/`, `src/utils/`
  - `scripts/` for install and migration scripts
  - `data/` gitignored for SQLite file
- Create `.env.example` with all required env vars documented
- Create `.gitignore` covering `node_modules`, `dist`, `.env`, `data/`

---

### Task 1.2 — Express Backend Skeleton

- Install Express and express types
- Create `src/index.ts` as entrypoint — loads env, initializes DB, starts server
- Create `src/app.ts` — Express app factory, middleware setup
  - JSON body parser
  - Request logging middleware (pino or morgan)
  - Error handling middleware
- Create `POST /webhook` route stub — returns 200, logs payload
- Create `GET /health` route — returns service status and config summary (no secrets)
- Validate required env vars on startup — fail fast with clear error messages

---

### Task 1.3 — SQLite Integration

- Install `better-sqlite3` and `@types/better-sqlite3`
- Create `src/db/client.ts` — opens SQLite connection, exports db instance
- Create `src/db/migrations.ts` — runs schema migrations on startup
  - `sessions` table as per spec
  - `schema_migrations` table to track applied migrations
- Create `src/db/sessions.ts` — typed CRUD functions
  - `createSession(issueId, platform, repo)` → `Session`
  - `getSessionByIssueId(issueId)` → `Session | null`
  - `getSessionByPrId(prId)` → `Session | null`
  - `linkPrToSession(sessionId, prId, branch)`
  - `appendHistory(sessionId, turn: HistoryTurn)`
  - `getHistory(sessionId)` → `HistoryTurn[]`
- Write unit tests for all DB functions using a temp in-memory SQLite instance

---

### Task 1.4 — Install Script

- Create `scripts/install.sh` — bash script targeting Rocky Linux
  - Check OS compatibility (Rocky Linux 8/9)
  - Install dnf packages: `git`, `sqlite`, `curl`, `tar`
  - Install nvm and Node.js LTS
  - Install GitHub CLI (`gh`) from official RPM
  - Install GitLab CLI (`glab`) from official binary
  - Install `act` from GitHub releases
  - Install npm dependencies (`npm ci`)
  - Prompt user to fill out `.env` from `.env.example` if not present
  - Run DB migrations
- Create `scripts/install-codex.sh` — conditional Codex CLI install
  - Runs if `AGENT=codex` in `.env`
  - Installs `@openai/codex-sdk` globally or per instructions
- Create systemd unit file: `gitAgent.service`
  - `ExecStart` points to `node dist/index.js`
  - `WorkingDirectory` set to install path
  - `EnvironmentFile` points to `.env`
  - `Restart=always`, `RestartSec=5`
  - `After=network.target`
- Install script copies unit file to `/etc/systemd/system/`, runs `systemctl daemon-reload`, `enable`, `start`
- Final install script verification step — `curl GET /health` and print result

---

## Phase 2 — Platform Adapters & Webhook Processing

**Context for agent:** Phase 1 is complete. Now implement the platform adapter layer (GitHub and GitLab), webhook signature validation, event parsing, mention detection, and the session management logic that wires webhook events to sessions. The AI agent is still stubbed — this phase ends with the system correctly receiving, parsing, and routing webhook events and creating sessions.

---

### Task 2.1 — Platform Adapter Interface

- Define `IPlatformAdapter` interface in `src/adapters/types.ts`
  - `parseWebhookEvent(req)` → `WebhookEvent | null`
  - `verifyWebhookSignature(req, secret)` → `boolean`
  - `postComment(repo, threadId, threadType, body)` → `void`
  - `createPR(repo, branch, base, title, body)` → `PRResult`
  - `requestReview(repo, prNumber, username)` → `void`
  - `linkIssueToPR(repo, issueNumber, prNumber)` → `void`
  - `getIssueContext(repo, issueNumber)` → `IssueContext`
- Define shared types: `WebhookEvent`, `PRResult`, `IssueContext`, `HistoryTurn`, `ThreadType` (`issue | pr`)

---

### Task 2.2 — GitHub Adapter

- Create `src/adapters/github.ts` implementing `IPlatformAdapter`
- Webhook signature validation using HMAC-SHA256 and `WEBHOOK_SECRET`
- Parse `issue_comment` and `pull_request_review_comment` webhook events
  - Detect `@BOT_HANDLE` mention in comment body
  - Extract issue/PR number, repo, comment body, author
  - Determine if event is in issue or PR context
- Implement `postComment` using GitHub REST API (`POST /repos/{owner}/{repo}/issues/{number}/comments`)
- Implement `createPR` (`POST /repos/{owner}/{repo}/pulls`)
- Implement `requestReview` (`POST /repos/{owner}/{repo}/pulls/{number}/requested_reviewers`)
- Implement `linkIssueToPR` — include closing keyword in PR body (`Closes #N`)
- Implement `getIssueContext` — fetch issue title, body, labels, existing comments
- Use `PLATFORM_TOKEN` for all API calls via `Authorization` header

---

### Task 2.3 — GitLab Adapter

- Create `src/adapters/gitlab.ts` implementing `IPlatformAdapter`
- Webhook signature validation using `X-Gitlab-Token` header
- Parse Note Hook events (issue comments and MR comments)
  - Detect `@BOT_HANDLE` mention in note body
  - Extract issue/MR IID, project, note body, author
  - Determine if event is in issue or MR context
- Implement `postComment` using GitLab REST API
- Implement `createPR` (create merge request via GitLab API)
- Implement `requestReview` (add reviewer to MR)
- Implement `linkIssueToPR` — use GitLab MR description or related issues API
- Implement `getIssueContext` — fetch issue title, description, labels, notes
- Use `PLATFORM_TOKEN` for all API calls

---

### Task 2.4 — Adapter Factory & Webhook Router

- Create `src/adapters/factory.ts` — returns correct adapter based on `PLATFORM` env var
- Update `POST /webhook` route in Express
  - Call `adapter.verifyWebhookSignature` — return 401 if invalid
  - Call `adapter.parseWebhookEvent` — return 200 early if not a mention event
  - Look up or create session for the issue/PR
  - Enqueue job for agent processing (in-memory queue — sync in Phase 2, async in Phase 3 if needed)
  - Return 200 immediately to platform (webhook must return fast)

---

### Task 2.5 — Session Resolution Logic

- Create `src/services/session.ts`
- `resolveSession(event: WebhookEvent)` → `Session`
  - If event is in issue context: look up by issue ID, create if not found
  - If event is in PR context: look up by PR ID, then fall back to linked issue session
  - If no session found in PR context — log warning, create new session linked to PR
- `buildPrompt(session, event, systemPrompt)` → `string`
  - Prepend `AGENT_SYSTEM_PROMPT`
  - Append issue/PR context (title, description)
  - Append conversation history
  - Append current mention body

---

## Phase 3 — AI Agent Integration & Git Operations

**Context for agent:** Phases 1 and 2 are complete. The system receives and routes webhook events, resolves sessions, and builds prompts. Now wire in the AI agent backends (Codex and Copilot), implement the Git operations (branch, commit, push), implement PR creation and review request, implement response posting, and handle failure cases. This phase makes the system fully functional end-to-end.

---

### Task 3.1 — Agent Interface

- Define `IAgentBackend` interface in `src/agents/types.ts`
  - `run(prompt: string, repoPath: string, sessionId: string)` → `AgentResult`
  - `AgentResult: { success: boolean, summary: string, filesChanged: string[], error?: string }`
- Create `src/agents/factory.ts` — returns correct agent based on `AGENT` env var

---

### Task 3.2 — Codex Agent

- Create `src/agents/codex.ts` implementing `IAgentBackend`
- Spawn Codex CLI as child process using `@openai/codex-sdk` or direct spawn
  - Pass prompt as input
  - Set working directory to `REPO_PATH`
  - Pass `OPENAI_API_KEY` via environment
  - Enable full auto-approve mode (no permission prompts)
- Stream stdout/stderr and capture full output
- Parse output to determine success/failure and extract summary
- Handle process exit codes and timeouts

---

### Task 3.3 — Copilot Agent

- Create `src/agents/copilot.ts` implementing `IAgentBackend`
- Import and initialize `@github/copilot-sdk` with `COPILOT_TOKEN`
- Invoke agent with prompt and repo context
- Handle tool calls for file reads/writes if SDK requires it
- Capture response and map to `AgentResult`
- Handle auth errors and API errors gracefully

---

### Task 3.4 — Git Operations Service

- Create `src/services/git.ts`
- `determineBranchName(issueTitle, issueNumber, agentSummary)` → `string`
  - Use heuristics to determine `feature/`, `fix/`, or `misc/` prefix
  - Slugify issue title, append issue number
  - Ensure branch name is a valid git ref
- `createBranch(repoPath, branchName, baseBranch)` — `git checkout -b`
- `stageAndCommit(repoPath, message)` — `git add -A`, `git commit`
- `push(repoPath, branchName, remote)` — `git push origin branchName`
- All git operations use `child_process.execSync` or `execa` with proper error handling
- If push fails: return structured error with failure reason for comment posting

---

### Task 3.5 — Job Orchestrator

- Create `src/services/orchestrator.ts` — the main job runner called after session resolution
- Full job flow:
  1. Post "Working on it..." comment in issue/PR to acknowledge mention
  2. Resolve session, build prompt
  3. Determine and create branch
  4. Run AI agent with prompt in `REPO_PATH`
  5. If agent fails: post error comment, append failure to session history, stop
  6. Stage, commit, push branch
  7. If push fails: post comment with failure details and instructions, stop
  8. Create PR with summary, link to issue, session ID in description
  9. Request review from `REVIEWER_USERNAME`
  10. Link PR ID to session in SQLite
  11. Post comment in originating issue with PR link
  12. Append full turn to session history
- Wrap entire flow in try/catch — any unhandled error posts a generic failure comment

---

### Task 3.6 — Response Formatting

- Create `src/utils/responses.ts` — template functions for all bot-posted comments
  - `acknowledgmentComment()` — "I'm on it, working now..."
  - `prCreatedComment(prUrl)` — success message with PR link
  - `pushFailedComment(error)` — failure message with instructions
  - `agentFailedComment(error)` — agent execution failure message
  - `prDescription(summary, issueUrl, sessionId)` — full PR body template

---

### Task 3.7 — End-to-End Validation

- Test full flow against a real test repo on GitHub or GitLab
  - Create a test issue, mention the bot
  - Verify webhook received, session created, agent invoked
  - Verify branch created, PR opened, review requested
  - Verify comment posted in issue with PR link
- Test multi-turn: mention bot again in issue, verify session continues
- Test mention in PR: verify response goes to PR, same session used
- Test push failure path: verify error comment posted with instructions
- Test agent failure path: verify error comment posted
- Verify systemd service survives reboot and webhook continues working

---

*End of Task List — 3 Phases, 13 Major Tasks*

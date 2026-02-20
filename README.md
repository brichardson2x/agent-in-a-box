# GitAgent

GitAgent is a self-hosted service that listens for GitHub/GitLab mentions, invokes an AI coding agent, applies changes on a feature branch, and opens a pull request with traceability via SQLite sessions.

## Getting started

1. Run `bash scripts/install.sh` and choose your platform (`github` or `gitlab`) and agent (`copilot` or `codex`) when prompted.
2. The installer copies `.env.example` to `.env` if needed, installs base dependencies (including Python + pip), and installs/authenticates only the selected platform/agent tooling.
3. Fill in the required `.env` values for your platform (`GITHUB_APP_*` for GitHub, or `GITLAB_APP_*` + `GITLAB_BOT_TOKEN` for GitLab).
4. Configure your platform webhook to point at `/webhook` and use the matching secret (`WEBHOOK_SECRET` for GitHub, `GITLAB_WEBHOOK_SECRET` for GitLab).

## Scripts

- `npm run build` compiles TypeScript to `dist/`.
- `npm start` launches the compiled server.
- `npm run dev` runs `tsx watch src/index.ts` with automatic reloads.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test` executes the Vitest suite.

## References

- Project schema and task list are documented in `plans/GitAgent_Spec_Sheet.md` and `plans/GitAgent_Task_List.md`.

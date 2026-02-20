# GitAgent

GitAgent is a self-hosted service that listens for GitHub/GitLab mentions, invokes an AI coding agent, applies changes on a feature branch, and opens a pull request with traceability via SQLite sessions.

## Getting started

1. Copy `.env.example` to `.env` and fill in the required credentials.
2. Run `npm run build` and `npm start`, or `npm run dev` during development.
3. Configure your platform webhook to point at `/webhook` and provide the matching `WEBHOOK_SECRET`.

## Scripts

- `npm run build` compiles TypeScript to `dist/`.
- `npm start` launches the compiled server.
- `npm run dev` runs `tsx watch src/index.ts` with automatic reloads.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test` executes the Vitest suite.

## References

- Project schema and task list are documented in `plans/GitAgent_Spec_Sheet.md` and `plans/GitAgent_Task_List.md`.

type AgentAuthProvider = 'codex' | 'copilot';

const AUTH_FAILURE_PATTERNS = [/not authenticated/i, /token expired/i, /login required/i, /unauthorized/i];

export const normalizeAgentAuthError = (
  provider: AgentAuthProvider,
  stdout: string,
  stderr: string
): string | undefined => {
  const combinedOutput = `${stdout}\n${stderr}`;
  if (!AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(combinedOutput))) {
    return undefined;
  }

  if (provider === 'codex') {
    return 'Codex authentication failed. Run `codex auth` on the host and restart gitAgent service.';
  }

  return 'Copilot authentication failed. Run `gh auth login` on the host and restart gitAgent service.';
};

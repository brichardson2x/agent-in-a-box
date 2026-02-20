[
  ['PLATFORM', 'github'],
  ['AGENT', 'codex'],
  ['BOT_HANDLE', 'gitagent'],
  ['PLATFORM_TOKEN', 'token'],
  ['REVIEWER_USERNAME', 'reviewer'],
  ['WEBHOOK_SECRET', 'secret'],
  ['REPO_PATH', '/tmp/repo'],
  ['REPO_REMOTE', 'https://example.com'],
  ['AGENT_SYSTEM_PROMPT', 'You are GitAgent']
].forEach(([key, value]) => {
  if (!process.env[key as string]) {
    process.env[key as string] = value as string;
  }
});

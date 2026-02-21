[
  ['PLATFORM', 'github'],
  ['AGENT', 'codex'],
  ['BOT_HANDLE', 'gitagent'],
  ['REVIEWER_USERNAME', 'reviewer'],
  ['WEBHOOK_SECRET', 'secret'],
  ['GITLAB_WEBHOOK_SECRET', 'gitlab-secret'],
  ['GITHUB_APP_ID', '1'],
  ['GITHUB_APP_PRIVATE_KEY_PATH', '/tmp/github-app.pem'],
  ['GITHUB_APP_INSTALLATION_ID', '1'],
  ['GITHUB_APP_CLIENT_ID', 'github-client-id'],
  ['GITLAB_APP_ID', 'gitlab-app-id'],
  ['GITLAB_APP_SECRET', 'gitlab-app-secret'],
  ['GITLAB_BOT_TOKEN', 'gitlab-bot-token'],
  ['REPO_PATH', '/tmp/repo'],
  ['REPO_REMOTE', 'https://example.com'],
  ['AGENT_SYSTEM_PROMPT', 'You are GitAgent']
].forEach(([key, value]) => {
  process.env[key as string] = value as string;
});

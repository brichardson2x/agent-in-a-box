import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv();

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const normalizePlatform = (value: string) => {
  const lower = value.toLowerCase();
  if (lower !== 'github' && lower !== 'gitlab') {
    throw new Error(`Unsupported platform: ${value}`);
  }
  return lower as 'github' | 'gitlab';
};

const normalizeModelSelectionMode = (value: string) => {
  const lower = value.toLowerCase();
  if (lower !== 'default' && lower !== 'custom') {
    throw new Error(`Unsupported model selection mode: ${value}`);
  }
  return lower as 'default' | 'custom';
};

const platform = normalizePlatform(requireEnv('PLATFORM'));
const modelSelectionMode = normalizeModelSelectionMode(process.env.MODEL_SELECTION_MODE ?? 'default');

export const Config = {
  platform,
  agent: requireEnv('AGENT'),
  modelSelectionMode,
  codexModel: process.env.CODEX_MODEL ?? 'default',
  copilotModel: process.env.COPILOT_MODEL ?? 'default',
  botHandle: requireEnv('BOT_HANDLE'),
  reviewer: requireEnv('REVIEWER_USERNAME'),
  webhookSecret: platform === 'github' ? requireEnv('WEBHOOK_SECRET') : requireEnv('GITLAB_WEBHOOK_SECRET'),
  githubAppId: platform === 'github' ? requireEnv('GITHUB_APP_ID') : undefined,
  githubAppPrivateKeyPath: platform === 'github' ? requireEnv('GITHUB_APP_PRIVATE_KEY_PATH') : undefined,
  githubAppInstallationId: platform === 'github' ? requireEnv('GITHUB_APP_INSTALLATION_ID') : undefined,
  githubAppClientId: platform === 'github' ? requireEnv('GITHUB_APP_CLIENT_ID') : undefined,
  gitlabAppId: platform === 'gitlab' ? requireEnv('GITLAB_APP_ID') : undefined,
  gitlabAppSecret: platform === 'gitlab' ? requireEnv('GITLAB_APP_SECRET') : undefined,
  gitlabBotToken: platform === 'gitlab' ? requireEnv('GITLAB_BOT_TOKEN') : undefined,
  gitlabWebhookSecret: platform === 'gitlab' ? requireEnv('GITLAB_WEBHOOK_SECRET') : undefined,
  repoPath: requireEnv('REPO_PATH'),
  repoRemote: requireEnv('REPO_REMOTE'),
  systemPrompt: requireEnv('AGENT_SYSTEM_PROMPT'),
  sqlitePath: path.resolve(process.env.SQLITE_PATH ?? './data/agent.db'),
  port: Number(process.env.PORT ?? 3000),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
  defaultBranch: process.env.DEFAULT_BRANCH ?? 'main'
};

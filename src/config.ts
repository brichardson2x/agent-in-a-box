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

export const Config = {
  platform: normalizePlatform(requireEnv('PLATFORM')),
  agent: requireEnv('AGENT'),
  botHandle: requireEnv('BOT_HANDLE'),
  reviewer: requireEnv('REVIEWER_USERNAME'),
  webhookSecret: requireEnv('WEBHOOK_SECRET'),
  platformToken: requireEnv('PLATFORM_TOKEN'),
  repoPath: requireEnv('REPO_PATH'),
  repoRemote: requireEnv('REPO_REMOTE'),
  systemPrompt: requireEnv('AGENT_SYSTEM_PROMPT'),
  openAiKey: process.env.OPENAI_API_KEY,
  copilotToken: process.env.COPILOT_TOKEN,
  sqlitePath: path.resolve(process.env.SQLITE_PATH ?? './data/agent.db'),
  port: Number(process.env.PORT ?? 3000),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
  defaultBranch: process.env.DEFAULT_BRANCH ?? 'main'
};

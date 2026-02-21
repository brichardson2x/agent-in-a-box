import { readFileSync } from 'node:fs';
import { createAppAuth } from '@octokit/auth-app';
import { Config } from '../config';

let cachedToken: string | undefined;
let tokenExpiresAt = 0;
let auth: ReturnType<typeof createAppAuth> | undefined;

const githubAuthGuidance = (details: string): string =>
  [
    `GitHub App authentication failed: ${details}`,
    'Verify GITHUB_APP_ID is the App ID from GitHub App settings (not account/org ID).',
    'Verify GITHUB_APP_INSTALLATION_ID matches the app installation on the target repo/org.',
    'Verify GITHUB_APP_PRIVATE_KEY_PATH points to the private key generated for this exact app.',
    'Verify host time is synchronized (`timedatectl status`); JWT auth fails when system clock is skewed.',
    'If key material was copied manually, ensure it is a valid PEM private key with real newlines.'
  ].join(' ');

const parseNumericId = (value: string, key: string): number => {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(githubAuthGuidance(`${key} must be a numeric ID`));
  }
  return Number(normalized);
};

const normalizePrivateKey = (value: string): string => {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized.includes('BEGIN') || !normalized.includes('PRIVATE KEY')) {
    throw new Error(githubAuthGuidance('private key file is not a valid PEM private key'));
  }
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
};

const getAuth = (): ReturnType<typeof createAppAuth> => {
  if (Config.platform !== 'github') {
    throw new Error('GitHub app auth requires PLATFORM=github');
  }
  if (!auth) {
    const appId = parseNumericId(Config.githubAppId as string, 'GITHUB_APP_ID');
    const installationId = parseNumericId(Config.githubAppInstallationId as string, 'GITHUB_APP_INSTALLATION_ID');
    let privateKeyFile: string;
    try {
      privateKeyFile = readFileSync(Config.githubAppPrivateKeyPath as string, 'utf8');
    } catch (error) {
      throw new Error(
        githubAuthGuidance(`unable to read private key at ${Config.githubAppPrivateKeyPath}: ${(error as Error).message}`)
      );
    }
    const privateKey = normalizePrivateKey(privateKeyFile);
    auth = createAppAuth({
      appId,
      privateKey,
      installationId
    });
  }
  return auth;
};

export const getInstallationToken = async (): Promise<string> => {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  let tokenData: { token?: string; expiresAt?: string };
  try {
    tokenData = await getAuth()({ type: 'installation' });
  } catch (error) {
    throw new Error(githubAuthGuidance((error as Error).message));
  }
  if (!tokenData.token) {
    throw new Error(githubAuthGuidance('installation token is missing in auth response'));
  }
  cachedToken = tokenData.token;
  tokenExpiresAt = tokenData.expiresAt ? new Date(tokenData.expiresAt).getTime() : now + 55 * 60 * 1000;
  return cachedToken;
};

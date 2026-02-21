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
    'Verify GITHUB_APP_PRIVATE_KEY_PATH points to the private key generated for this exact app.'
  ].join(' ');

const getAuth = (): ReturnType<typeof createAppAuth> => {
  if (Config.platform !== 'github') {
    throw new Error('GitHub app auth requires PLATFORM=github');
  }
  if (!auth) {
    let privateKey: string;
    try {
      privateKey = readFileSync(Config.githubAppPrivateKeyPath as string, 'utf8');
    } catch (error) {
      throw new Error(
        githubAuthGuidance(`unable to read private key at ${Config.githubAppPrivateKeyPath}: ${(error as Error).message}`)
      );
    }
    auth = createAppAuth({
      appId: Config.githubAppId as string,
      privateKey,
      installationId: Number(Config.githubAppInstallationId)
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

import { readFileSync } from 'node:fs';
import { createAppAuth } from '@octokit/auth-app';
import { Config } from '../config';

let cachedToken: string | undefined;
let tokenExpiresAt = 0;
let auth: ReturnType<typeof createAppAuth> | undefined;

const getAuth = (): ReturnType<typeof createAppAuth> => {
  if (Config.platform !== 'github') {
    throw new Error('GitHub app auth requires PLATFORM=github');
  }
  if (!auth) {
    auth = createAppAuth({
      appId: Config.githubAppId as string,
      privateKey: readFileSync(Config.githubAppPrivateKeyPath as string, 'utf8'),
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

  const tokenData = await getAuth()({ type: 'installation' });
  cachedToken = tokenData.token;
  tokenExpiresAt = tokenData.expiresAt ? new Date(tokenData.expiresAt).getTime() : now + 55 * 60 * 1000;
  return cachedToken;
};

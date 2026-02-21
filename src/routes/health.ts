import { execFileSync } from 'node:child_process';
import { Router } from 'express';
import fetch from 'node-fetch';
import { Config } from '../config';
import { getInstallationToken } from '../adapters/github-auth';

const router = Router();

const githubClockSyncHint = (): string | undefined => {
  try {
    const synchronized = execFileSync('timedatectl', ['show', '-p', 'SystemClockSynchronized', '--value'], {
      encoding: 'utf8'
    })
      .trim()
      .toLowerCase();
    if (synchronized !== 'yes') {
      return (
        'Detected unsynchronized system clock (`timedatectl status` -> `System clock synchronized: no`). ' +
        'GitHub App JWT authentication can fail with Bad credentials until clock sync is healthy.'
      );
    }
  } catch (error) {
    void error;
  }
  return undefined;
};

router.get('/', async (_req, res) => {
  const payload: Record<string, unknown> = {
    status: 'service-up',
    platform: Config.platform,
    gitRemote: Config.repoRemote,
    timestamp: Date.now(),
    platformAuth: { status: 'ok' }
  };

  try {
    if (Config.platform === 'github') {
      const token = await getInstallationToken();
      const response = await fetch('https://api.github.com/installation/repositories', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json'
        }
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`GitHub installation auth check failed (${response.status}): ${details}`);
      }
    } else {
      const response = await fetch('https://gitlab.com/api/v4/user', {
        headers: {
          'Private-Token': Config.gitlabBotToken ?? ''
        }
      });
      if (!response.ok) {
        throw new Error(`GitLab auth check failed with status ${response.status}`);
      }
    }
  } catch (error) {
    const details = (error as Error).message;
    const hint = Config.platform === 'github' && details.includes('Bad credentials') ? githubClockSyncHint() : undefined;
    payload.platformAuth = {
      status: 'warning',
      details: hint ? `${details} ${hint}` : details
    };
  }

  res.json(payload);
});

export default router;

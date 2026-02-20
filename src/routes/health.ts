import { Router } from 'express';
import fetch from 'node-fetch';
import { Config } from '../config';
import { getInstallationToken } from '../adapters/github-auth';

const router = Router();

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
      const response = await fetch('https://api.github.com/app', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json'
        }
      });
      if (!response.ok) {
        throw new Error(`GitHub auth check failed with status ${response.status}`);
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
    payload.platformAuth = {
      status: 'warning',
      details: (error as Error).message
    };
  }

  res.json(payload);
});

export default router;

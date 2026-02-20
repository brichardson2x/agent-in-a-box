import { Router } from 'express';
import { Config } from '../config';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    platform: Config.platform,
    gitRemote: Config.repoRemote,
    timestamp: Date.now()
  });
});

export default router;

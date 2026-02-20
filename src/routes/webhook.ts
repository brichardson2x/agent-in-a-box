import { Request, Response, Router } from 'express';
import { Config } from '../config';
import { getAdapter } from '../adapters/factory';
import { orchestrateJob } from '../services/orchestrator';

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const router = Router();

router.post('/', async (req: RawBodyRequest, res: Response) => {
  try {
    const adapter = getAdapter();
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    if (!adapter.verifyWebhookSignature(req, Config.webhookSecret, rawBody)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = adapter.parseWebhookEvent(req);
    if (!event) {
      return res.status(200).json({ status: 'ignored' });
    }

    await orchestrateJob(event, adapter);
    return res.status(200).json({ status: 'accepted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process webhook', details: (error as Error).message });
  }
});

export default router;

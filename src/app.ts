import express, { ErrorRequestHandler, Request } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Config } from './config';
import healthRouter from './routes/health';
import webhookRouter from './routes/webhook';

const logger = pino({ level: Config.logLevel });

type RawBodyRequest = Request & { rawBody?: Buffer };

const app = express();

app.use(
  express.json({
    verify(req, _res, buf) {
      (req as RawBodyRequest).rawBody = buf;
    }
  })
);

app.use(pinoHttp({ logger } as any));
app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  logger.error({ err }, 'Unhandled error');
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal Server Error' });
};

app.use(errorHandler);

export default app;

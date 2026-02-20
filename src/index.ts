import pino from 'pino';
import { Config } from './config';
import app from './app';
import { openDatabase } from './db/client';
import { runMigrations } from './db/migrations';

const logger = pino({ level: Config.logLevel });

const start = async () => {
  openDatabase();
  runMigrations();
  const server = app.listen(Config.port, () => {
    logger.info({ port: Config.port }, 'GitAgent is running');
  });

  server.on('error', (error) => {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  });
};

start().catch((error) => {
  logger.error({ error }, 'Unhandled startup error');
  process.exit(1);
});

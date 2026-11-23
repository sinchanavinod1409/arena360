import express from 'express';
import { ensureDbReady } from './db.ts';
import { apiRouter } from './routes.ts';

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(async (_req, _res, next) => {
    try {
      await ensureDbReady();
      next();
    } catch (err) {
      next(err);
    }
  });
  app.use('/api', apiRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[api-error]', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error',
      });
    }
  });
  return app;
}

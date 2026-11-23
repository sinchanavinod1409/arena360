import type { Request, Response } from 'express';
import { createApiApp } from './app.ts';
import { ensureDbReady } from './db.ts';

const apiApp = createApiApp();

export default async function handler(req: Request, res: Response) {
  try {
    await ensureDbReady();
    if (req.url === '/api' || req.url.startsWith('/api?')) {
      const urlObj = new URL(req.url, 'http://localhost');
      const vpath = urlObj.searchParams.get('__vpath');
      if (vpath !== null) {
        urlObj.searchParams.delete('__vpath');
        const qs = urlObj.searchParams.toString();
        req.url = `/api/${vpath}${qs ? `?${qs}` : ''}`;
      }
    }
    return apiApp(req, res);
  } catch (err) {
    console.error('[vercel-handler] startup/request error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Serverless function failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

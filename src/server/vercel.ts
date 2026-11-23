import express from 'express';
import { createApiApp } from './app.ts';

const app = express();
const apiApp = createApiApp();

app.use((req, res, next) => {
  if (req.url === '/api' || req.url.startsWith('/api?')) {
    const urlObj = new URL(req.url, 'http://localhost');
    const vpath = urlObj.searchParams.get('__vpath');
    if (vpath !== null) {
      urlObj.searchParams.delete('__vpath');
      const qs = urlObj.searchParams.toString();
      req.url = `/api/${vpath}${qs ? `?${qs}` : ''}`;
    }
  }
  return apiApp(req, res, next);
});

export default app;

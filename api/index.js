let cachedHandler = null;

export default async function handler(req, res) {
  try {
    if (!cachedHandler) {
      const mod = await import('./_app.mjs');
      cachedHandler = mod.default;
    }
    return await cachedHandler(req, res);
  } catch (err) {
    console.error('[api/index.js] Fatal handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Serverless function failed to initialize',
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
}

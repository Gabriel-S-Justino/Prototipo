// Monta os mesmos proxies de /api no servidor de desenvolvimento e no preview do Vite.
import type { Plugin } from 'vite';
import { handleDonki, handleHorizons } from './handlers.ts';

export function nasaDevApi(): Plugin {
  const mount = (server: { middlewares: { use: (path: string, fn: (req: any, res: any) => void) => void } }) => {
    const route = (handler: (q: Record<string, string>) => Promise<{ status: number; body: unknown; headers: Record<string, string> }>) => async (req: any, res: any) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const out = await handler(Object.fromEntries(url.searchParams));
      res.statusCode = out.status;
      for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
      res.end(JSON.stringify(out.body));
    };
    server.middlewares.use('/api/horizons', route((q) => handleHorizons(q)));
    server.middlewares.use('/api/donki', route((q) => handleDonki(q, process.env.NASA_API_KEY)));
  };
  return { name: 'nasa-dev-api', configureServer: mount, configurePreviewServer: mount };
}

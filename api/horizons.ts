// Função serverless (Vercel): GET /api/horizons?body=earth|mars&start=AAAA-MM-DD&stop=AAAA-MM-DD&step=1
import { handleHorizons } from './handlers.ts';

interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(k: string, v: string): void; json(body: unknown): void }

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const query = Object.fromEntries(Object.entries(req.query ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const out = await handleHorizons(query);
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.status(out.status).json(out.body);
}

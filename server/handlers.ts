// Lógica dos proxies serverless, independente de plataforma (Vercel em produção, Vite em desenvolvimento).
// O navegador nunca chama a NASA diretamente: assim a chave da API fica no servidor e o CORS não é problema.
import { HorizonsError, queryHorizons, validateQuery, HORIZONS_FRAME } from '../src/services/nasa/horizonsCore.ts';
import { DonkiError, queryDonki } from '../src/services/nasa/donkiCore.ts';

export interface ProxyResponse { status: number; body: unknown; headers: Record<string, string> }

const json = (status: number, body: unknown, cacheSeconds = 0): ProxyResponse => ({
  status,
  body,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400` : 'no-store',
  },
});

export async function handleHorizons(query: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<ProxyResponse> {
  try {
    const q = validateQuery({ body: query.body, start: query.start, stop: query.stop, stepDays: query.step ? Number(query.step) : 1 });
    const samples = await queryHorizons(q, fetchImpl);
    return json(200, { source: 'NASA/JPL Horizons', body: q.body, frame: HORIZONS_FRAME, retrievedAt: new Date().toISOString(), samples }, 86400);
  } catch (error) {
    if (error instanceof HorizonsError) return json(error.kind === 'parametros' ? 400 : 502, { error: error.message, kind: error.kind });
    return json(500, { error: 'Erro interno no proxy do Horizons.', kind: 'interno' });
  }
}

export async function handleDonki(query: Record<string, string | undefined>, apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Promise<ProxyResponse> {
  try {
    const cmes = await queryDonki(query.start ?? '', query.end ?? '', apiKey || 'DEMO_KEY', fetchImpl);
    return json(200, { source: 'NASA DONKI (CMEAnalysis)', start: query.start, end: query.end, keyType: apiKey ? 'configurada' : 'DEMO_KEY', cmes }, 3600);
  } catch (error) {
    if (error instanceof DonkiError) return json(error.kind === 'parametros' ? 400 : 502, { error: error.message, kind: error.kind });
    return json(500, { error: 'Erro interno no proxy da DONKI.', kind: 'interno' });
  }
}

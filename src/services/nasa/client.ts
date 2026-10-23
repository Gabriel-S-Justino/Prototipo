// Cliente do navegador para os proxies /api/horizons e /api/donki: tempo limite, validação e cache em memória.
import type { BodyId } from '../../data/bodies';
import type { EphemerisDescriptor, EphemerisSample } from '../../simulation/orbital/ephemeris';
import { calibrationFromCmes, type CmeAnalysis } from './donkiCore';
import type { SolarCalibration } from '../../simulation/mission/solar';
import { jdToIso } from '../../domain/units';

export class ServiceUnavailable extends Error {
  constructor(public service: 'Horizons' | 'DONKI', message: string) {
    super(message);
    this.name = 'ServiceUnavailable';
  }
}

async function getJson(url: string, service: 'Horizons' | 'DONKI', timeoutMs: number, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ServiceUnavailable(service, (body as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
    if (body === null) throw new ServiceUnavailable(service, 'Resposta sem JSON válido.');
    return body;
  } catch (error) {
    if (error instanceof ServiceUnavailable) throw error;
    if ((error as Error).name === 'AbortError') throw new ServiceUnavailable(service, `Tempo limite de ${timeoutMs / 1000} s excedido.`);
    throw new ServiceUnavailable(service, `Proxy inacessível (${(error as Error).message}). Em site estático sem /api, a integração não funciona.`);
  } finally {
    clearTimeout(timer);
  }
}

function checkSamples(value: unknown): EphemerisSample[] {
  const samples = (value as { samples?: unknown })?.samples;
  if (!Array.isArray(samples) || samples.length < 2) throw new ServiceUnavailable('Horizons', 'Resposta do proxy sem amostras.');
  for (const s of samples) {
    const ok = s && Number.isFinite(s.jd) && Array.isArray(s.r) && Array.isArray(s.v) && s.r.length === 3 && s.v.length === 3 && [...s.r, ...s.v].every(Number.isFinite);
    if (!ok) throw new ServiceUnavailable('Horizons', 'Amostra malformada na resposta do proxy.');
  }
  return samples as EphemerisSample[];
}

const tableCache = new Map<string, Promise<EphemerisDescriptor>>();

/** Baixa vetores de Terra (janela de partida) e Marte (janela de chegada) e devolve um descritor de efemérides. */
export function loadHorizonsEphemeris(range: { depStartJd: number; depEndJd: number; arrStartJd: number; arrEndJd: number }, fetchImpl: typeof fetch = fetch, timeoutMs = 25000): Promise<EphemerisDescriptor> {
  const pad = 2;
  const q = (body: BodyId, a: number, b: number) => `/api/horizons?body=${body}&start=${jdToIso(a - pad)}&stop=${jdToIso(b + pad)}&step=1`;
  const key = `${q('earth', range.depStartJd, range.arrEndJd)}|${q('mars', range.depStartJd, range.arrEndJd)}`;
  if (!tableCache.has(key)) {
    // Ambos os corpos cobrem partida→chegada: o cruzeiro e a conjunção também usam Terra e Marte depois da partida.
    const promise = Promise.all([
      getJson(q('earth', range.depStartJd, range.arrEndJd + 300), 'Horizons', timeoutMs, fetchImpl),
      getJson(q('mars', range.depStartJd, range.arrEndJd + 300), 'Horizons', timeoutMs, fetchImpl),
    ]).then(([e, m]) => ({ kind: 'horizons' as const, tables: { earth: checkSamples(e), mars: checkSamples(m) }, retrievedAt: new Date().toISOString() }));
    promise.catch(() => tableCache.delete(key));
    tableCache.set(key, promise);
  }
  return tableCache.get(key)!;
}

export async function loadDonkiCalibration(endIso: string, days = 90, fetchImpl: typeof fetch = fetch): Promise<SolarCalibration> {
  const start = new Date(Date.parse(`${endIso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const body = await getJson(`/api/donki?start=${start}&end=${endIso}`, 'DONKI', 20000, fetchImpl);
  const cmes = (body as { cmes?: unknown }).cmes;
  if (!Array.isArray(cmes)) throw new ServiceUnavailable('DONKI', 'Resposta do proxy sem a lista de CMEs.');
  return calibrationFromCmes(cmes as CmeAnalysis[], start, endIso);
}

// Camada de integração NASA/JPL Horizons (sem DOM): monta a consulta, interpreta o CSV de vetores,
// valida unidades e plausibilidade física e normaliza para km e km/s. Usada pelo proxy /api/horizons.
// Módulo também executado pelas funções da Vercel (Node ESM): imports relativos com extensão .ts explícita.
// Documentação da API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
import { HORIZONS_ID, type BodyId } from '../../data/bodies.ts';
import { AU_KM } from '../../domain/units.ts';
import type { EphemerisSample } from '../../simulation/orbital/ephemeris';

export const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
export const HORIZONS_MAX_SPAN_DAYS = 1200;

export interface HorizonsQuery { body: BodyId; start: string; stop: string; stepDays: number }

export class HorizonsError extends Error {
  constructor(public kind: 'parametros' | 'rede' | 'timeout' | 'http' | 'formato' | 'validacao', message: string) {
    super(message);
    this.name = 'HorizonsError';
  }
}

/** Referencial e unidades pedidos ao Horizons — o mesmo referencial do modelo analítico (eclíptica J2000). */
export const HORIZONS_FRAME = {
  center: '500@10',
  refPlane: 'ECLIPTIC',
  refSystem: 'ICRF',
  units: 'KM-S',
  timeScale: 'TDB',
  description: 'Vetores heliocêntricos (centro do Sol, 500@10), eclíptica e equinócio J2000 (ICRF), km e km/s, escala TDB, sem correção de aberração.',
} as const;

export function validateQuery(q: Partial<Record<keyof HorizonsQuery, unknown>>): HorizonsQuery {
  const body = q.body as BodyId;
  if (body !== 'earth' && body !== 'mars') throw new HorizonsError('parametros', 'Corpo deve ser earth ou mars.');
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof q.start !== 'string' || typeof q.stop !== 'string' || !iso.test(q.start) || !iso.test(q.stop)) throw new HorizonsError('parametros', 'Datas devem estar no formato AAAA-MM-DD.');
  const t0 = Date.parse(`${q.start}T00:00:00Z`);
  const t1 = Date.parse(`${q.stop}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) throw new HorizonsError('parametros', 'Intervalo de datas inválido.');
  if ((t1 - t0) / 86_400_000 > HORIZONS_MAX_SPAN_DAYS) throw new HorizonsError('parametros', `Intervalo máximo de ${HORIZONS_MAX_SPAN_DAYS} dias por consulta.`);
  const year0 = new Date(t0).getUTCFullYear();
  const year1 = new Date(t1).getUTCFullYear();
  if (year0 < 1900 || year1 > 2100) throw new HorizonsError('parametros', 'Datas suportadas: 1900–2100.');
  const stepDays = Number(q.stepDays ?? 1);
  if (!Number.isInteger(stepDays) || stepDays < 1 || stepDays > 10) throw new HorizonsError('parametros', 'Passo deve ser um inteiro entre 1 e 10 dias.');
  return { body, start: q.start, stop: q.stop, stepDays };
}

export function buildHorizonsUrl(q: HorizonsQuery): string {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${HORIZONS_ID[q.body]}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: `'${HORIZONS_FRAME.center}'`,
    START_TIME: `'${q.start}'`,
    STOP_TIME: `'${q.stop}'`,
    STEP_SIZE: `'${q.stepDays} d'`,
    VEC_TABLE: '2',
    OUT_UNITS: HORIZONS_FRAME.units,
    REF_PLANE: HORIZONS_FRAME.refPlane,
    REF_SYSTEM: HORIZONS_FRAME.refSystem,
    VEC_CORR: 'NONE',
    CSV_FORMAT: 'YES',
  });
  return `${HORIZONS_URL}?${params}`;
}

/** Faixas físicas plausíveis (distância ao Sol em UA, velocidade em km/s) para detectar dados corrompidos. */
const PLAUSIBLE: Record<BodyId, { r: [number, number]; v: [number, number] }> = {
  earth: { r: [0.97, 1.03], v: [28.5, 31.0] },
  mars: { r: [1.36, 1.69], v: [21.5, 26.6] },
};

/** Interpreta o JSON do Horizons (campo result com o bloco $$SOE … $$EOE em CSV). */
export function parseHorizonsVectors(payload: unknown, body: BodyId): EphemerisSample[] {
  if (!payload || typeof payload !== 'object') throw new HorizonsError('formato', 'Resposta do Horizons não é um objeto JSON.');
  const p = payload as { error?: unknown; result?: unknown };
  if (typeof p.error === 'string') throw new HorizonsError('http', `Horizons retornou erro: ${p.error}`);
  if (typeof p.result !== 'string') throw new HorizonsError('formato', 'Resposta do Horizons sem o campo "result".');
  if (!/Reference frame\s*:\s*ICRF/i.test(p.result) && !/ICRF/.test(p.result)) {
    throw new HorizonsError('validacao', 'O cabeçalho do Horizons não confirma o referencial ICRF pedido.');
  }
  if (!/Ecliptic/i.test(p.result)) throw new HorizonsError('validacao', 'O cabeçalho do Horizons não confirma o plano da eclíptica.');
  if (!/km\/s|KM-S|km\s*,\s*km\/s/i.test(p.result)) throw new HorizonsError('validacao', 'O cabeçalho do Horizons não confirma as unidades km e km/s.');
  const block = p.result.split('$$SOE')[1]?.split('$$EOE')[0];
  if (block === undefined) throw new HorizonsError('formato', 'O Horizons não retornou a tabela de vetores ($$SOE/$$EOE).');
  const samples: EphemerisSample[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim()).filter((c, i, arr) => !(i === arr.length - 1 && c === ''));
    if (cols.length < 8) throw new HorizonsError('formato', `Linha de vetores incompleta: "${line.slice(0, 60)}"`);
    const jd = Number(cols[0]);
    const values = cols.slice(2, 8).map(Number);
    if (!Number.isFinite(jd) || !values.every(Number.isFinite)) throw new HorizonsError('formato', `Valor numérico inválido na linha: "${line.slice(0, 60)}"`);
    const r = [values[0], values[1], values[2]] as const;
    const v = [values[3], values[4], values[5]] as const;
    const rAu = Math.hypot(...r) / AU_KM;
    const vKmS = Math.hypot(...v);
    const lim = PLAUSIBLE[body];
    if (rAu < lim.r[0] || rAu > lim.r[1] || vKmS < lim.v[0] || vKmS > lim.v[1]) {
      throw new HorizonsError('validacao', `Estado fisicamente implausível para ${body} em JD ${jd}: ${rAu.toFixed(3)} UA, ${vKmS.toFixed(2)} km/s. Verifique unidades e referencial.`);
    }
    if (samples.length && jd <= samples[samples.length - 1].jd) throw new HorizonsError('validacao', 'As datas da tabela do Horizons não estão em ordem crescente.');
    samples.push({ jd, r, v });
  }
  if (samples.length < 2) throw new HorizonsError('formato', 'Tabela do Horizons com menos de duas linhas.');
  return samples;
}

/** Executa a consulta com tempo limite. fetchImpl permite testes e o proxy no servidor. */
export async function queryHorizons(q: HorizonsQuery, fetchImpl: typeof fetch = fetch, timeoutMs = 15000): Promise<EphemerisSample[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(buildHorizonsUrl(q), { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new HorizonsError('timeout', `O Horizons não respondeu em ${timeoutMs / 1000} s.`);
    throw new HorizonsError('rede', `Falha de rede ao consultar o Horizons: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new HorizonsError('http', `O Horizons respondeu HTTP ${response.status}.`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new HorizonsError('formato', 'O Horizons não retornou JSON válido.');
  }
  return parseHorizonsVectors(json, q.body);
}

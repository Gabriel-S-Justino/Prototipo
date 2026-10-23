// Camada de integração NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information).
// Consulta análises de CMEs (CMEAnalysis) para calibrar a frequência e as velocidades dos eventos de treinamento.
// Documentação: https://ccmc.gsfc.nasa.gov/tools/DONKI/ e https://api.nasa.gov/
import type { SolarCalibration } from '../../simulation/mission/solar';

export const DONKI_URL = 'https://api.nasa.gov/DONKI/CMEAnalysis';
export const DONKI_MIN_SPEED = 500;

export class DonkiError extends Error {
  constructor(public kind: 'parametros' | 'rede' | 'timeout' | 'http' | 'formato', message: string) {
    super(message);
    this.name = 'DonkiError';
  }
}

export interface CmeAnalysis { id: string; time: string; speed: number; halfAngle: number | null; longitude: number | null; latitude: number | null }

export function buildDonkiUrl(start: string, end: string, apiKey: string) {
  const params = new URLSearchParams({ startDate: start, endDate: end, mostAccurateOnly: 'true', speed: String(DONKI_MIN_SPEED), halfAngle: '0', catalog: 'ALL', api_key: apiKey });
  return `${DONKI_URL}?${params}`;
}

export function parseDonkiCmeAnalysis(payload: unknown): CmeAnalysis[] {
  if (!Array.isArray(payload)) throw new DonkiError('formato', 'Resposta da DONKI não é uma lista.');
  const out: CmeAnalysis[] = [];
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const speed = Number(o.speed);
    const time = typeof o.time21_5 === 'string' ? o.time21_5 : null;
    if (!time || !Number.isFinite(speed)) continue; // registro incompleto: descartado, nunca preenchido
    const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    out.push({ id: String(o.associatedCMEID ?? time), time, speed, halfAngle: num(o.halfAngle), longitude: num(o.longitude), latitude: num(o.latitude) });
  }
  return out;
}

/** Converte CMEs reais em calibração estatística. Não cria eventos: apenas taxa e velocidades. */
export function calibrationFromCmes(cmes: CmeAnalysis[], start: string, end: string): SolarCalibration {
  const days = Math.max(1, (Date.parse(end) - Date.parse(start)) / 86_400_000);
  const fast = cmes.filter((c) => c.speed >= DONKI_MIN_SPEED);
  const unique = [...new Map(fast.map((c) => [c.id, c])).values()];
  const rate = Math.max(1 / 120, unique.length / days);
  const speeds = unique.length ? unique.map((c) => Math.round(c.speed)) : [600];
  return {
    ratePerDay: rate,
    speeds,
    source: 'donki',
    description: `Calibrado com NASA DONKI: ${unique.length} CME(s) ≥ ${DONKI_MIN_SPEED} km/s entre ${start} e ${end} (${rate < 1 ? `1 a cada ${Math.round(1 / rate)} dias` : `${rate.toFixed(1)} por dia`}).`,
  };
}

export async function queryDonki(start: string, end: string, apiKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = 15000): Promise<CmeAnalysis[]> {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(start) || !iso.test(end) || Date.parse(end) <= Date.parse(start)) throw new DonkiError('parametros', 'Intervalo de datas inválido.');
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > 120) throw new DonkiError('parametros', 'Intervalo máximo de 120 dias.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(buildDonkiUrl(start, end, apiKey), { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new DonkiError('timeout', `A DONKI não respondeu em ${timeoutMs / 1000} s.`);
    throw new DonkiError('rede', `Falha de rede ao consultar a DONKI: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new DonkiError('http', `A DONKI respondeu HTTP ${response.status}.`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new DonkiError('formato', 'A DONKI não retornou JSON válido.');
  }
  return parseDonkiCmeAnalysis(json);
}

// Fontes de efemérides heliocêntricas (eclíptica J2000, km e km/s).
// - 'standish': modelo analítico offline do JPL (Standish), usado quando o Horizons não está disponível.
// - 'horizons': tabelas de vetores retornadas pela API NASA/JPL Horizons, interpoladas por Hermite cúbico.
import { DEG, JD_J2000, MU, auToKm } from '../../domain/units';
import { STANDISH_1800_2050, STANDISH_VALID_JD, type BodyId } from '../../data/bodies';
import { elementsToState, solveKepler } from './kepler';
import type { StateVector, Vec3 } from './vector';

export type EphemerisKind = 'standish' | 'horizons';

/** Uma amostra de estado tabelado (km, km/s) num instante JD (TDB). */
export interface EphemerisSample {
  jd: number;
  r: Vec3;
  v: Vec3;
}

/** Descritor serializável (pode ir para um Web Worker). */
export type EphemerisDescriptor =
  | { kind: 'standish' }
  | { kind: 'horizons'; tables: Record<BodyId, EphemerisSample[]>; retrievedAt: string };

export interface Ephemeris {
  kind: EphemerisKind;
  label: string;
  validRange: [number, number];
  state(body: BodyId, jd: number): StateVector;
}

export class EphemerisRangeError extends RangeError {}

/** Estado pelo modelo de Standish. */
export function standishState(body: BodyId, jd: number): StateVector {
  if (jd < STANDISH_VALID_JD[0] || jd > STANDISH_VALID_JD[1]) {
    throw new EphemerisRangeError('Data fora do intervalo 1800–2050 do modelo analítico do JPL.');
  }
  const T = (jd - JD_J2000) / 36525;
  const set = STANDISH_1800_2050[body];
  const at = (x: [number, number]) => x[0] + x[1] * T;
  const a = auToKm(at(set.a));
  const e = at(set.e);
  const I = at(set.I) * DEG;
  const L = at(set.L);
  const varpi = at(set.longPeri);
  const Omega = at(set.longNode);
  const argp = (varpi - Omega) * DEG;
  const M = ((((L - varpi) % 360) + 540) % 360 - 180) * DEG;
  const E = solveKepler(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  return elementsToState({ a, e, i: I, raan: Omega * DEG, argp, nu }, MU.sun);
}

export const standishEphemeris: Ephemeris = {
  kind: 'standish',
  label: 'Modelo analítico JPL (Standish, 1800–2050) — offline',
  validRange: STANDISH_VALID_JD,
  state: standishState,
};

/** Interpolação de Hermite cúbica usando posição e velocidade tabeladas. */
export function hermite(samples: EphemerisSample[], jd: number): StateVector {
  if (samples.length < 2) throw new EphemerisRangeError('Tabela de efemérides vazia.');
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (jd < first.jd - 1e-9 || jd > last.jd + 1e-9) {
    throw new EphemerisRangeError('Data fora do intervalo consultado no JPL Horizons.');
  }
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].jd <= jd) lo = mid;
    else hi = mid;
  }
  const p0 = samples[lo];
  const p1 = samples[hi];
  const h = (p1.jd - p0.jd) * 86400; // s
  const s = h === 0 ? 0 : ((jd - p0.jd) * 86400) / h;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  const d00 = (6 * s ** 2 - 6 * s) / h;
  const d10 = 3 * s ** 2 - 4 * s + 1;
  const d01 = (-6 * s ** 2 + 6 * s) / h;
  const d11 = 3 * s ** 2 - 2 * s;
  const r = [0, 1, 2].map((k) => h00 * p0.r[k] + h10 * h * p0.v[k] + h01 * p1.r[k] + h11 * h * p1.v[k]) as unknown as Vec3;
  const v = [0, 1, 2].map((k) => d00 * p0.r[k] + d10 * p0.v[k] + d01 * p1.r[k] + d11 * p1.v[k]) as unknown as Vec3;
  return { r, v };
}

export function tableEphemeris(tables: Record<BodyId, EphemerisSample[]>, retrievedAt: string): Ephemeris {
  const ranges = Object.values(tables).map((t) => [t[0]?.jd ?? Infinity, t[t.length - 1]?.jd ?? -Infinity]);
  return {
    kind: 'horizons',
    label: `NASA/JPL Horizons (consultado em ${retrievedAt.slice(0, 10)})`,
    validRange: [Math.max(...ranges.map((r) => r[0])), Math.min(...ranges.map((r) => r[1]))],
    state: (body, jd) => hermite(tables[body], jd),
  };
}

export function ephemerisFrom(desc: EphemerisDescriptor): Ephemeris {
  return desc.kind === 'standish' ? standishEphemeris : tableEphemeris(desc.tables, desc.retrievedAt);
}

/** Obliquidade da eclíptica J2000 (IAU 1976), para converter para o equador terrestre. */
export const OBLIQUITY_J2000 = 23.439281 * DEG;

/** Vetor eclíptico → equatorial J2000. */
export function eclipticToEquatorial(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY_J2000);
  const s = Math.sin(OBLIQUITY_J2000);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

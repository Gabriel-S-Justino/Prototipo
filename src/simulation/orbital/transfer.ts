// Transferência interplanetária Terra → Marte: Lambert entre os estados das efemérides,
// energia característica de lançamento (C3), v∞ de chegada e declinação da assíntota (DLA).
import { DAY_S, MU } from '../../domain/units';
import type { Ephemeris } from './ephemeris';
import { eclipticToEquatorial } from './ephemeris';
import { solveLambert } from './lambert';
import { norm, sub, type StateVector, type Vec3 } from './vector';

export interface Transfer {
  ok: true;
  departureJd: number;
  arrivalJd: number;
  tofDays: number;
  /** Energia característica de lançamento C3 = v∞² (km²/s²). */
  c3: number;
  /** Excesso hiperbólico de partida (km/s) e vetor (eclíptica). */
  vInfDep: number;
  vInfDepVec: Vec3;
  /** Excesso hiperbólico de chegada em Marte (km/s). */
  vInfArr: number;
  vInfArrVec: Vec3;
  /** Declinação da assíntota de partida (graus, equador J2000). */
  dlaDeg: number;
  transferAngleDeg: number;
  /** Estado heliocêntrico da nave logo após a partida (no centro da Terra, aproximação de cônicas remendadas). */
  departureState: StateVector;
  earthAtDeparture: StateVector;
  marsAtArrival: StateVector;
}

export interface TransferFailure {
  ok: false;
  departureJd: number;
  arrivalJd: number;
  tofDays: number;
  reason: string;
}

export function computeTransfer(eph: Ephemeris, departureJd: number, tofDays: number): Transfer | TransferFailure {
  const arrivalJd = departureJd + tofDays;
  let earth: StateVector;
  let mars: StateVector;
  try {
    earth = eph.state('earth', departureJd);
    mars = eph.state('mars', arrivalJd);
  } catch (error) {
    return { ok: false, departureJd, arrivalJd, tofDays, reason: (error as Error).message };
  }
  const sol = solveLambert({ r1: earth.r, r2: mars.r, tof: tofDays * DAY_S, mu: MU.sun });
  if (!sol.ok) return { ok: false, departureJd, arrivalJd, tofDays, reason: sol.message };
  const vInfDepVec = sub(sol.v1, earth.v);
  const vInfArrVec = sub(sol.v2, mars.v);
  const vInfDep = norm(vInfDepVec);
  const eq = eclipticToEquatorial(vInfDepVec);
  return {
    ok: true,
    departureJd,
    arrivalJd,
    tofDays,
    c3: vInfDep * vInfDep,
    vInfDep,
    vInfDepVec,
    vInfArr: norm(vInfArrVec),
    vInfArrVec,
    dlaDeg: (Math.asin(eq[2] / vInfDep) * 180) / Math.PI,
    transferAngleDeg: (sol.transferAngle * 180) / Math.PI,
    departureState: { r: earth.r, v: sol.v1 },
    earthAtDeparture: earth,
    marsAtArrival: mars,
  };
}

/** Melhor tempo de voo (menor C3) para uma data de partida fixa, varrendo de 1 em 1 dia e refinando. */
export function bestTofForDeparture(eph: Ephemeris, departureJd: number, tofMin = 120, tofMax = 450): Transfer | null {
  let best: Transfer | null = null;
  for (let tof = tofMin; tof <= tofMax; tof += 1) {
    const t = computeTransfer(eph, departureJd, tof);
    if (t.ok && (!best || t.c3 < best.c3)) best = t;
  }
  if (!best) return null;
  for (let tof = best.tofDays - 1; tof <= best.tofDays + 1; tof += 0.05) {
    const t = computeTransfer(eph, departureJd, tof);
    if (t.ok && t.c3 < best.c3) best = t;
  }
  return best;
}

// Amostragem de órbitas e trajetórias para as cenas (apenas visual; usa as mesmas efemérides da simulação).
import type { BodyId } from '../data/bodies';
import { DAY_S, MU } from '../domain/units';
import { standishEphemeris, type Ephemeris } from '../simulation/orbital/ephemeris';
import { propagate } from '../simulation/orbital/kepler';
import type { StateVector, Vec3 } from '../simulation/orbital/vector';

const PERIOD: Record<BodyId, number> = { earth: 365.256, mars: 686.98 };

export function orbitPoints(eph: Ephemeris, body: BodyId, jd: number, count = 180): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= count; k++) {
    const t = jd + (PERIOD[body] * k) / count;
    try {
      pts.push(eph.state(body, t).r);
    } catch {
      pts.push(standishEphemeris.state(body, t).r); // fora da tabela do Horizons: só para desenhar a órbita
    }
  }
  return pts;
}

export function trajectoryPoints(start: StateVector, days: number, count = 160): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= count; k++) pts.push(propagate(start, (days * DAY_S * k) / count, MU.sun).r);
  return pts;
}

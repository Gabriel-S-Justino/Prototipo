// Geometria Sol–Terra–sonda: distâncias e ângulo de elongação (SEP) que governa a conjunção solar.
import type { Ephemeris } from '../orbital/ephemeris';
import { angleBetween, norm, scale, sub, type Vec3 } from '../orbital/vector';

/** Ângulo Sol–Terra–alvo (graus), visto da Terra. */
export function sunEarthProbeAngle(earth: Vec3, target: Vec3): number {
  return (angleBetween(scale(earth, -1), sub(target, earth)) * 180) / Math.PI;
}

export function earthMarsGeometry(eph: Ephemeris, jd: number) {
  const earth = eph.state('earth', jd).r;
  const mars = eph.state('mars', jd).r;
  return {
    distanceKm: norm(sub(mars, earth)),
    sepDeg: sunEarthProbeAngle(earth, mars),
    marsSunKm: norm(mars),
  };
}

/** Busca o mínimo do ângulo Sol–Terra–Marte num intervalo (passo de 1 dia, refinado por seção áurea). */
export function findConjunction(eph: Ephemeris, startJd: number, endJd: number) {
  let best = { jd: startJd, sepDeg: Infinity };
  for (let jd = startJd; jd <= endJd; jd += 1) {
    const sep = earthMarsGeometry(eph, jd).sepDeg;
    if (sep < best.sepDeg) best = { jd, sepDeg: sep };
  }
  let a = Math.max(startJd, best.jd - 1);
  let b = Math.min(endJd, best.jd + 1);
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 40; k++) {
    const c = b - phi * (b - a);
    const d = a + phi * (b - a);
    if (earthMarsGeometry(eph, c).sepDeg < earthMarsGeometry(eph, d).sepDeg) b = d;
    else a = c;
  }
  const jd = (a + b) / 2;
  return { jd, sepDeg: earthMarsGeometry(eph, jd).sepDeg };
}

/** Intervalo contínuo em torno de jd em que o SEP fica abaixo de um limiar (graus). */
export function windowBelow(eph: Ephemeris, centerJd: number, thresholdDeg: number, maxDays = 60) {
  let start = centerJd;
  let end = centerJd;
  while (start > centerJd - maxDays && earthMarsGeometry(eph, start - 0.25).sepDeg < thresholdDeg) start -= 0.25;
  while (end < centerJd + maxDays && earthMarsGeometry(eph, end + 0.25).sepDeg < thresholdDeg) end += 0.25;
  return { start, end };
}

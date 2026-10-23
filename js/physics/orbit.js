// Mecânica orbital em 2D. Funções puras, unidades SI.
import { AU, DAY, MU_SUN } from '../data/constants.js';
import { MARS, EARTH } from '../data/planets.js';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const length = (a) => Math.hypot(a[0], a[1]);

/** Velocidade de uma órbita circular: v = √(GM/r). */
export function circularSpeed(mu, r) {
  return Math.sqrt(mu / r);
}

/** Equação vis-viva: v² = GM·(2/r − 1/a). */
export function visViva(mu, r, a) {
  return Math.sqrt(mu * (2 / r - 1 / a));
}

/** 3ª Lei de Kepler: T = 2π·√(a³/GM). */
export function period(mu, a) {
  return TAU * Math.sqrt((a * a * a) / mu);
}

/** Longitude do planeta (rad) no instante t (s desde J2000): L = L0 + L̇·T. */
export function planetAngle(planet, t) {
  const centuries = t / (36525 * DAY);
  return (((planet.L0 + planet.Ldot * centuries) % 360) + 360) % 360 * DEG;
}

/** Posição e velocidade heliocêntricas de um planeta em órbita circular. */
export function planetState(planet, t) {
  const r = planet.a * AU;
  const angle = planetAngle(planet, t);
  const v = circularSpeed(MU_SUN, r);
  return {
    r: [r * Math.cos(angle), r * Math.sin(angle)],
    v: [-v * Math.sin(angle), v * Math.cos(angle)],
  };
}

/** Ângulo de fase Terra→Marte em graus [0, 360): quanto Marte está à frente da Terra. */
export function phaseAngle(t) {
  const diff = (planetAngle(MARS, t) - planetAngle(EARTH, t)) / DEG;
  return ((diff % 360) + 360) % 360;
}

/** Transferência de Hohmann entre órbitas circulares r1 → r2. */
export function hohmann(mu, r1, r2) {
  const a = (r1 + r2) / 2;
  return {
    a,
    dv1: visViva(mu, r1, a) - circularSpeed(mu, r1),
    dv2: circularSpeed(mu, r2) - visViva(mu, r2, a),
    time: period(mu, a) / 2,
  };
}

/** Ângulo de fase ideal para partir da Terra a Marte: 180° − 360°·(t_viagem / T_Marte). */
export function idealPhaseAngle() {
  const r1 = EARTH.a * AU;
  const r2 = MARS.a * AU;
  return 180 - 360 * (hohmann(MU_SUN, r1, r2).time / period(MU_SUN, r2));
}

/** Quantos graus por dia o ângulo de fase diminui (a Terra anda mais rápido que Marte). */
export function phaseRateDegPerDay() {
  return (EARTH.Ldot - MARS.Ldot) / 36525;
}

/** Δv para sair de uma órbita circular de raio r com excesso hiperbólico vInf: √(v∞² + 2GM/r) − √(GM/r). */
export function escapeBurn(mu, r, vInf) {
  return Math.sqrt(vInf * vInf + (2 * mu) / r) - circularSpeed(mu, r);
}

/** Excesso hiperbólico após uma queima prograde Δv numa órbita circular; null se não escapa. */
export function excessAfterBurn(mu, r, dv) {
  const v = circularSpeed(mu, r) + dv;
  const v2 = v * v - (2 * mu) / r;
  return v2 > 0 ? Math.sqrt(v2) : null;
}

/** Δv para ser capturado numa órbita elíptica (periapse rp, apoapse ra) chegando com v∞. */
export function captureBurn(mu, rp, ra, vInf) {
  return Math.sqrt(vInf * vInf + (2 * mu) / rp) - visViva(mu, rp, (rp + ra) / 2);
}

/** Resolve a equação de Kepler M = E − e·sen(E) pelo método de Newton. */
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

/** Elementos orbitais (2D, elíptico) a partir de posição r e velocidade v no instante t. */
export function stateToElements(r, v, mu, t) {
  const rLen = length(r);
  const v2 = v[0] * v[0] + v[1] * v[1];
  const h = r[0] * v[1] - r[1] * v[0];
  const dir = h >= 0 ? 1 : -1;
  const a = 1 / (2 / rLen - v2 / mu);
  const rv = r[0] * v[0] + r[1] * v[1];
  const ev = scale(sub(scale(r, v2 - mu / rLen), scale(v, rv)), 1 / mu);
  const e = length(ev);
  if (!(a > 0) || e >= 1) return { hyperbolic: true, a, e, mu };
  const omega = e < 1e-10 ? 0 : Math.atan2(ev[1], ev[0]);
  const nu = dir * (Math.atan2(r[1], r[0]) - omega);
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  return { a, e, omega, dir, mu, n: Math.sqrt(mu / (a * a * a)), M0: E - e * Math.sin(E), t0: t };
}

function perifocalToFrame(el, x, y) {
  const yy = el.dir * y;
  const c = Math.cos(el.omega);
  const s = Math.sin(el.omega);
  return [c * x - s * yy, s * x + c * yy];
}

function eccentricAnomalyAt(el, t) {
  return solveKepler(el.M0 + el.n * (t - el.t0), el.e);
}

/** Posição na órbita no instante t (propagação analítica por Kepler). */
export function positionAt(el, t) {
  const E = eccentricAnomalyAt(el, t);
  return perifocalToFrame(el, el.a * (Math.cos(E) - el.e), el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E));
}

/** Velocidade na órbita no instante t. */
export function velocityAt(el, t) {
  const E = eccentricAnomalyAt(el, t);
  const rLen = el.a * (1 - el.e * Math.cos(E));
  const k = Math.sqrt(el.mu * el.a) / rLen;
  return perifocalToFrame(el, -k * Math.sin(E), k * Math.sqrt(1 - el.e * el.e) * Math.cos(E));
}

/** Pontos da elipse inteira, para desenhar. */
export function trajectoryPoints(el, count = 200) {
  const points = [];
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  for (let i = 0; i <= count; i++) {
    const E = (i / count) * TAU;
    points.push(perifocalToFrame(el, el.a * (Math.cos(E) - el.e), b * Math.sin(E)));
  }
  return points;
}

/** Periapse e apoapse (posição e distância). */
export function apsides(el) {
  return {
    periapsis: perifocalToFrame(el, el.a * (1 - el.e), 0),
    apoapsis: perifocalToFrame(el, -el.a * (1 + el.e), 0),
    rp: el.a * (1 - el.e),
    ra: el.a * (1 + el.e),
  };
}

/** Aproximação máxima da nave a um planeta entre t0 e t1 (amostragem em duas passadas). */
export function closestApproach(el, planet, t0, t1) {
  const distAt = (t) => length(sub(positionAt(el, t), planetState(planet, t).r));
  let best = { t: t0, dist: distAt(t0) };
  const coarse = 800;
  const step = (t1 - t0) / coarse;
  for (let i = 1; i <= coarse; i++) {
    const t = t0 + i * step;
    const dist = distAt(t);
    if (dist < best.dist) best = { t, dist };
  }
  const from = Math.max(t0, best.t - step);
  const fine = 200;
  for (let i = 0; i <= fine; i++) {
    const t = from + (i / fine) * 2 * step;
    if (t > t1) break;
    const dist = distAt(t);
    if (dist < best.dist) best = { t, dist };
  }
  return best;
}

// Propagação de dois corpos por variáveis universais (Curtis, Orbital Mechanics for Engineering Students,
// algoritmos 3.3 e 3.4) e conversões estado ↔ elementos clássicos. Unidades: km, s, km/s, km³/s².
import { add, cross, dot, norm, scale, sub, type StateVector, type Vec3 } from './vector';

/** Funções de Stumpff C(z) e S(z), com série de Taylor perto de z = 0. */
export function stumpffC(z: number): number {
  if (Math.abs(z) < 1e-6) return 1 / 2 - z / 24 + (z * z) / 720;
  if (z > 0) return (1 - Math.cos(Math.sqrt(z))) / z;
  return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
}

export function stumpffS(z: number): number {
  if (Math.abs(z) < 1e-6) return 1 / 6 - z / 120 + (z * z) / 5040;
  if (z > 0) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  const s = Math.sqrt(-z);
  return (Math.sinh(s) - s) / (s * s * s);
}

/** Propaga um estado por dt segundos (qualquer cônica). Lança erro se não convergir. */
export function propagate(state: StateVector, dt: number, mu: number): StateVector {
  if (dt === 0) return state;
  const r0 = norm(state.r);
  const v0 = norm(state.v);
  const vr0 = dot(state.r, state.v) / r0;
  const alpha = 2 / r0 - (v0 * v0) / mu;
  const sqrtMu = Math.sqrt(mu);

  let chi = sqrtMu * Math.abs(alpha) * dt;
  if (!Number.isFinite(chi) || chi === 0) chi = (sqrtMu * dt) / r0;
  let converged = false;
  for (let i = 0; i < 100; i++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);
    const F = ((r0 * vr0) / sqrtMu) * chi * chi * C + (1 - alpha * r0) * chi ** 3 * S + r0 * chi - sqrtMu * dt;
    const dF = ((r0 * vr0) / sqrtMu) * chi * (1 - z * S) + (1 - alpha * r0) * chi * chi * C + r0;
    const step = F / dF;
    chi -= step;
    if (Math.abs(step) < 1e-9 * Math.max(1, Math.abs(chi))) {
      converged = true;
      break;
    }
  }
  if (!converged || !Number.isFinite(chi)) throw new Error('Propagação de Kepler não convergiu.');

  const z = alpha * chi * chi;
  const C = stumpffC(z);
  const S = stumpffS(z);
  const f = 1 - ((chi * chi) / r0) * C;
  const g = dt - (chi ** 3 * S) / sqrtMu;
  const r = add(scale(state.r, f), scale(state.v, g));
  const rn = norm(r);
  const fdot = (sqrtMu / (rn * r0)) * (alpha * chi ** 3 * S - chi);
  const gdot = 1 - ((chi * chi) / rn) * C;
  return { r, v: add(scale(state.r, fdot), scale(state.v, gdot)) };
}

export interface ClassicalElements {
  /** Semieixo maior (km); negativo para hipérboles. */
  a: number;
  e: number;
  /** Inclinação, nodo ascendente, argumento do periastro e anomalia verdadeira (rad). */
  i: number;
  raan: number;
  argp: number;
  nu: number;
}

/** Resolve a equação de Kepler M = E − e·sen E (elipse) pelo método de Newton. */
export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) return E;
  }
  return E;
}

/** Elementos clássicos → estado inercial (Curtis, algoritmo 4.5). */
export function elementsToState(el: ClassicalElements, mu: number): StateVector {
  const p = el.a * (1 - el.e * el.e);
  const cnu = Math.cos(el.nu);
  const snu = Math.sin(el.nu);
  const rPf: Vec3 = [(p * cnu) / (1 + el.e * cnu), (p * snu) / (1 + el.e * cnu), 0];
  const k = Math.sqrt(mu / p);
  const vPf: Vec3 = [-k * snu, k * (el.e + cnu), 0];
  return { r: perifocalToInertial(rPf, el), v: perifocalToInertial(vPf, el) };
}

function perifocalToInertial(x: Vec3, el: ClassicalElements): Vec3 {
  const cO = Math.cos(el.raan), sO = Math.sin(el.raan);
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const cw = Math.cos(el.argp), sw = Math.sin(el.argp);
  return [
    (cO * cw - sO * sw * ci) * x[0] + (-cO * sw - sO * cw * ci) * x[1],
    (sO * cw + cO * sw * ci) * x[0] + (-sO * sw + cO * cw * ci) * x[1],
    sw * si * x[0] + cw * si * x[1],
  ];
}

/** Estado → elementos clássicos (Curtis, algoritmo 4.2). */
export function stateToElements(state: StateVector, mu: number): ClassicalElements {
  const { r, v } = state;
  const rn = norm(r);
  const h = cross(r, v);
  const hn = norm(h);
  const n = cross([0, 0, 1], h);
  const nn = norm(n);
  const eVec = scale(sub(scale(r, dot(v, v) - mu / rn), scale(v, dot(r, v))), 1 / mu);
  const e = norm(eVec);
  const energy = dot(v, v) / 2 - mu / rn;
  const a = -mu / (2 * energy);
  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / hn)));
  let raan = nn > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, n[0] / nn))) : 0;
  if (n[1] < 0) raan = 2 * Math.PI - raan;
  let argp = 0;
  if (nn > 1e-12 && e > 1e-12) {
    argp = Math.acos(Math.max(-1, Math.min(1, dot(n, eVec) / (nn * e))));
    if (eVec[2] < 0) argp = 2 * Math.PI - argp;
  } else if (e > 1e-12) {
    argp = Math.atan2(eVec[1], eVec[0]);
  }
  let nu = 0;
  if (e > 1e-12) {
    nu = Math.acos(Math.max(-1, Math.min(1, dot(eVec, r) / (e * rn))));
    if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
  }
  return { a, e, i, raan, argp, nu };
}

/** Pontos de uma trajetória propagada entre 0 e duration (s), para desenho. */
export function sampleTrajectory(state: StateVector, duration: number, mu: number, count = 120): Vec3[] {
  const points: Vec3[] = [];
  for (let k = 0; k <= count; k++) points.push(propagate(state, (duration * k) / count, mu).r);
  return points;
}

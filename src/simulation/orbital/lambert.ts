// Problema de Lambert (uma revolução) por variáveis universais — Curtis, algoritmo 5.2,
// com busca por bisseção em z (o tempo de voo cresce monotonicamente com z em revolução única),
// o que garante convergência sempre que existe solução. Unidades: km, s, km/s.
import { cross, dot, norm, scale, sub, type Vec3 } from './vector';
import { stumpffC, stumpffS } from './kepler';

export interface LambertInput {
  r1: Vec3;
  r2: Vec3;
  /** Tempo de voo (s), > 0. */
  tof: number;
  mu: number;
  /** Sentido da transferência; padrão prograde (movimento no sentido da órbita dos planetas). */
  prograde?: boolean;
}

export type LambertResult =
  | { ok: true; v1: Vec3; v2: Vec3; transferAngle: number; z: number; iterations: number }
  | { ok: false; reason: 'tof-invalido' | 'geometria-degenerada' | 'sem-convergencia'; message: string };

const Z_MAX = 4 * Math.PI * Math.PI; // limite da elipse de revolução única

export function solveLambert({ r1, r2, tof, mu, prograde = true }: LambertInput): LambertResult {
  if (!(tof > 0) || !Number.isFinite(tof)) return { ok: false, reason: 'tof-invalido', message: 'O tempo de voo precisa ser positivo.' };
  const R1 = norm(r1);
  const R2 = norm(r2);
  const cosTheta = Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2)));
  const cz = cross(r1, r2)[2];
  let theta = Math.acos(cosTheta);
  if (prograde ? cz < 0 : cz >= 0) theta = 2 * Math.PI - theta;

  const sinTheta = Math.sin(theta);
  if (Math.abs(sinTheta) < 1e-8 || 1 - Math.cos(theta) < 1e-12) {
    return { ok: false, reason: 'geometria-degenerada', message: 'Posições colineares (0° ou 180°): o plano da transferência fica indefinido.' };
  }
  const A = sinTheta * Math.sqrt((R1 * R2) / (1 - Math.cos(theta)));
  const sqrtMu = Math.sqrt(mu);

  const y = (z: number) => R1 + R2 + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  /** F(z) = t(z) − tof; y < 0 corresponde a tempos menores que o mínimo da família. */
  const F = (z: number) => {
    const yz = y(z);
    if (yz < 0) return -Infinity;
    return (yz / stumpffC(z)) ** 1.5 * stumpffS(z) + A * Math.sqrt(yz) - sqrtMu * tof;
  };

  let lo = -4;
  // Perto de z = 4π², C(z) perde precisão (1 − cos √z → 0); recua até obter F finito.
  let hi = Z_MAX * (1 - 1e-9);
  for (const delta of [1e-8, 1e-7, 1e-6, 1e-5, 1e-4]) {
    if (F(hi) > 0 && Number.isFinite(F(hi))) break;
    hi = Z_MAX * (1 - delta);
  }
  let guard = 0;
  while (F(lo) > 0 && guard++ < 60) lo *= 2; // hipérboles rápidas
  if (F(lo) > 0 || F(hi) < 0) return { ok: false, reason: 'sem-convergencia', message: 'Não há transferência de revolução única para esse tempo de voo.' };

  let z = 0;
  let iterations = 0;
  for (; iterations < 200; iterations++) {
    z = (lo + hi) / 2;
    const value = F(z);
    if (value > 0) hi = z;
    else lo = z;
    if (hi - lo < 1e-11 * Math.max(1, Math.abs(z))) break;
  }
  const yz = y(z);
  if (!(yz > 0)) return { ok: false, reason: 'sem-convergencia', message: 'Solução de Lambert não convergiu.' };

  const f = 1 - yz / R1;
  const g = A * Math.sqrt(yz / mu);
  const gdot = 1 - yz / R2;
  const v1 = scale(sub(r2, scale(r1, f)), 1 / g);
  const v2 = scale(sub(scale(r2, gdot), r1), 1 / g);
  if (![...v1, ...v2].every(Number.isFinite)) return { ok: false, reason: 'sem-convergencia', message: 'Solução numérica inválida.' };
  return { ok: true, v1, v2, transferAngle: theta, z, iterations };
}

// Referência didática herdada do projeto original: órbitas circulares e coplanares (Hohmann).
// Serve para COMPARAÇÃO com a solução geral de Lambert; não é usada para planejar a trajetória.
// Unidades SI (m, s), como no módulo original js/physics/orbit.js.
import { AU_KM, MU } from '../../domain/units';

const TAU = 2 * Math.PI;
export const MU_SUN_SI = MU.sun * 1e9;
export const MU_EARTH_SI = MU.earth * 1e9;
export const MU_MARS_SI = MU.mars * 1e9;
export const AU_M = AU_KM * 1000;
/** Semieixos médios (UA) usados no modelo circular original. */
export const A_EARTH_AU = 1.0;
export const A_MARS_AU = 1.52371;

/** v = √(GM/r). */
export const circularSpeed = (mu: number, r: number) => Math.sqrt(mu / r);
/** v² = GM(2/r − 1/a). */
export const visViva = (mu: number, r: number, a: number) => Math.sqrt(mu * (2 / r - 1 / a));
/** T = 2π√(a³/GM). */
export const period = (mu: number, a: number) => TAU * Math.sqrt((a * a * a) / mu);

export function hohmann(mu: number, r1: number, r2: number) {
  const a = (r1 + r2) / 2;
  return { a, dv1: visViva(mu, r1, a) - circularSpeed(mu, r1), dv2: circularSpeed(mu, r2) - visViva(mu, r2, a), time: period(mu, a) / 2 };
}

/** φ = 180° − 360°·(t_viagem/T_Marte). */
export function idealPhaseAngle() {
  const r1 = A_EARTH_AU * AU_M;
  const r2 = A_MARS_AU * AU_M;
  return 180 - 360 * (hohmann(MU_SUN_SI, r1, r2).time / period(MU_SUN_SI, r2));
}

/** Δv de saída de órbita circular com excesso v∞: √(v∞² + 2GM/r) − √(GM/r). */
export const escapeBurn = (mu: number, r: number, vInf: number) => Math.sqrt(vInf * vInf + (2 * mu) / r) - circularSpeed(mu, r);

/** Δv de captura numa elipse (rp, ra) chegando com v∞. */
export const captureBurn = (mu: number, rp: number, ra: number, vInf: number) => Math.sqrt(vInf * vInf + (2 * mu) / rp) - visViva(mu, rp, (rp + ra) / 2);

/** Hohmann Terra→Marte em C3 (km²/s²) e tempo (dias), para comparar com Lambert. */
export function hohmannEarthMars() {
  const h = hohmann(MU_SUN_SI, A_EARTH_AU * AU_M, A_MARS_AU * AU_M);
  return { c3: (h.dv1 / 1000) ** 2, vInfArr: h.dv2 / 1000, days: h.time / 86400 };
}

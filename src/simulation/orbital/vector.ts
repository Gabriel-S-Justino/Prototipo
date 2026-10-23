// Álgebra vetorial 3D mínima, funções puras.
export type Vec3 = readonly [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  if (n === 0) throw new RangeError('Vetor nulo não tem direção.');
  return scale(a, 1 / n);
};
/** Ângulo entre vetores (rad), estável numericamente. */
export const angleBetween = (a: Vec3, b: Vec3) => Math.atan2(norm(cross(a, b)), dot(a, b));

export interface StateVector {
  /** Posição (km). */
  r: Vec3;
  /** Velocidade (km/s). */
  v: Vec3;
}

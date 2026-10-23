// Inserção em órbita de Marte (MOI): queima no periapse da hipérbole de chegada.
import { MU, RADIUS } from '../../domain/units';

export type CaptureOrbitId = 'eliptica' | 'circular';

export const CAPTURE_ORBITS: Record<CaptureOrbitId, { name: string; periAltKm: number; apoAltKm: number; sunlitFraction: number; description: string }> = {
  eliptica: {
    name: 'Elíptica 300 × 33.000 km', periAltKm: 300, apoAltKm: 33000, sunlitFraction: 0.93,
    description: 'Captura barata. Boa para estudar a atmosfera alta e o vento solar; imagens ficam menos nítidas.',
  },
  circular: {
    name: 'Circular baixa 400 km', periAltKm: 400, apoAltKm: 400, sunlitFraction: 0.62,
    description: 'Ótima para mapear a superfície, mas a captura custa mais que o dobro de Δv e há eclipse a cada volta.',
  },
};

/** Δv da captura (m/s) chegando com v∞ (km/s) e periapse rp (km) numa elipse com apoapse ra (km). */
export function captureDeltaV(vInf: number, rp: number, ra: number): number {
  const vHyp = Math.sqrt(vInf * vInf + (2 * MU.mars) / rp);
  const vEll = Math.sqrt(MU.mars * (2 / rp - 2 / (rp + ra)));
  return (vHyp - vEll) * 1000;
}

export function plannedCaptureDeltaV(vInf: number, orbit: CaptureOrbitId) {
  const o = CAPTURE_ORBITS[orbit];
  return captureDeltaV(vInf, RADIUS.mars + o.periAltKm, RADIUS.mars + o.apoAltKm);
}

/** Parâmetro de impacto (km) que produz um periapse rp (km) para v∞ (km/s): B = rp·√(1 + 2μ/(rp·v∞²)). */
export function impactParameterFor(rp: number, vInf: number) {
  return rp * Math.sqrt(1 + (2 * MU.mars) / (rp * vInf * vInf));
}

/** Periapse (km) resultante de um parâmetro de impacto B (km). */
export function periapsisFromB(B: number, vInf: number) {
  const k = MU.mars / (vInf * vInf);
  return k * (Math.sqrt(1 + (B / k) ** 2) - 1);
}

// Constantes físicas reais (CODATA / IAU / NASA Planetary Fact Sheet). Unidades SI.
export const G0 = 9.80665; // m/s², gravidade padrão
export const AU = 1.495978707e11; // m, unidade astronômica
export const C = 299792458; // m/s, velocidade da luz
export const DAY = 86400; // s
export const MU_SUN = 1.32712440018e20; // m³/s², GM do Sol

// Instante J2000 (01/01/2000 12:00) e data inicial do jogo, em ms (Date.UTC).
export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const START_MS = Date.UTC(2026, 9, 13);

/** Segundos desde J2000 para uma data em ms. */
export function secondsSinceJ2000(ms) {
  return (ms - J2000_MS) / 1000;
}

/** Data (objeto Date) para um instante em segundos desde J2000. */
export function dateFromSeconds(t) {
  return new Date(J2000_MS + t * 1000);
}

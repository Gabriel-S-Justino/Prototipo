// Constantes físicas e conversões de unidades. Convenção do projeto:
// - mecânica orbital: km, s, km/s, km³/s² (C3 em km²/s²);
// - foguetes: kg, N, s, m/s;
// - tempo: Data Juliana (JD) em escala TDB aproximada por UTC (diferença ≈ 69 s, desprezível aqui).

/** Gravidade padrão (m/s²), definição CGPM. */
export const G0 = 9.80665;
/** Unidade astronômica (km), IAU 2012. */
export const AU_KM = 149_597_870.7;
/** Velocidade da luz (km/s). */
export const C_KM_S = 299_792.458;
export const DAY_S = 86_400;
/** JD da época J2000.0 (2000-01-01 12:00 TT). */
export const JD_J2000 = 2_451_545.0;
/** Constante de Boltzmann (J/K). */
export const BOLTZMANN = 1.380649e-23;

/** Parâmetros gravitacionais (km³/s²), JPL DE440 / NASA Planetary Fact Sheet. */
export const MU = {
  sun: 1.32712440018e11,
  earth: 398_600.4418,
  mars: 42_828.37,
} as const;

/** Raios equatoriais médios (km), NASA Planetary Fact Sheet. */
export const RADIUS = {
  sun: 695_700,
  earth: 6_378.137,
  mars: 3_396.2,
} as const;

export const DEG = Math.PI / 180;

export const kmToAu = (km: number) => km / AU_KM;
export const auToKm = (au: number) => au * AU_KM;
/** AU/dia → km/s. */
export const auPerDayToKmS = (v: number) => (v * AU_KM) / DAY_S;
export const kmsToMs = (v: number) => v * 1000;
export const msToKms = (v: number) => v / 1000;

/** Data JavaScript (UTC) → Data Juliana. */
export function dateToJd(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Data Juliana → Date (UTC). */
export function jdToDate(jd: number): Date {
  return new Date((jd - 2_440_587.5) * 86_400_000);
}

/** 'AAAA-MM-DD' → JD às 00:00 UTC. Lança erro para datas inválidas. */
export function isoToJd(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError(`Data inválida: ${iso}`);
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw new RangeError(`Data inválida: ${iso}`);
  return dateToJd(date);
}

export function jdToIso(jd: number): string {
  return jdToDate(jd).toISOString().slice(0, 10);
}

/** Formata JD como "31 out. 2026". */
export function formatJd(jd: number): string {
  return jdToDate(jd).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Número formatado em pt-BR. */
export function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

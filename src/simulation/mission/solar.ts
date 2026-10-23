// Eventos solares (ejeções de massa coronal, CMEs) e exposição da sonda.
// Modelo simplificado e documentado: a CME se propaga radialmente a partir do Sol, com velocidade constante,
// num cone de meia-largura w em torno de uma longitude eclíptica. A sonda está exposta se, no instante em que a
// frente da CME atinge a distância heliocêntrica da sonda, a direção da sonda estiver dentro do cone.
// Como as datas de cruzeiro estão no futuro, NÃO há eventos reais para elas: os eventos do jogo são cenários
// de treinamento identificados como simulados. Dados reais da NASA DONKI, quando disponíveis, só calibram a
// frequência e as velocidades dos eventos sorteados.
import { AU_KM, DAY_S } from '../../domain/units';
import type { StateVector } from '../orbital/vector';
import { createRng, subSeed, type Rng } from './rng';

export interface SolarCalibration {
  /** CMEs relevantes (≥ 500 km/s) por dia. */
  ratePerDay: number;
  speeds: number[];
  source: 'donki' | 'padrao';
  description: string;
}

export const DEFAULT_CALIBRATION: SolarCalibration = {
  ratePerDay: 1 / 40,
  speeds: [500, 650, 800, 950, 1200, 1500],
  source: 'padrao',
  description: 'Taxa padrão didática: 1 CME rápida a cada ~40 dias (ordem de grandeza perto do máximo solar).',
};

export type SolarResponse = 'manter' | 'protecao' | 'replanejar';

export interface SolarEvent {
  id: string;
  /** Detecção da CME (JD). */
  detectJd: number;
  speedKmS: number;
  /** Longitude eclíptica heliocêntrica do eixo da CME (graus). */
  lonDeg: number;
  halfWidthDeg: number;
  scenario: 'treinamento';
  /** Preenchidos quando o evento é avaliado. */
  arrivalJd?: number;
  exposed?: boolean;
  separationDeg?: number;
  response?: SolarResponse;
  damage?: string | null;
}

const lonOf = (s: StateVector) => (Math.atan2(s.r[1], s.r[0]) * 180) / Math.PI;
const wrap = (deg: number) => ((deg + 540) % 360) - 180;

/** Sorteia os eventos de treinamento do cruzeiro (determinístico pela semente). */
export function generateSolarEvents(seed: number, launchJd: number, arrivalJd: number, probeAt: (jd: number) => StateVector, calibration: SolarCalibration = DEFAULT_CALIBRATION): SolarEvent[] {
  const rng: Rng = createRng(subSeed(seed, 'solar'));
  const events: SolarEvent[] = [];
  let jd = launchJd + 15;
  let n = 0;
  while (true) {
    jd += -Math.log(Math.max(rng(), 1e-9)) / calibration.ratePerDay;
    if (jd > arrivalJd - 15 || n >= 4) break;
    const probeLon = lonOf(probeAt(jd));
    events.push({
      id: `cme-${++n}`,
      detectJd: jd,
      speedKmS: calibration.speeds[Math.floor(rng() * calibration.speeds.length)],
      // Cenário didático: a direção é sorteada a até ±70° da sonda, para que a exposição seja uma dúvida real.
      lonDeg: wrap(probeLon + (rng() * 140 - 70)),
      halfWidthDeg: 15 + rng() * 30,
      scenario: 'treinamento',
    });
  }
  if (events.length === 0) {
    const mid = (launchJd + arrivalJd) / 2;
    events.push({ id: 'cme-1', detectJd: mid, speedKmS: 900, lonDeg: wrap(lonOf(probeAt(mid)) + 10), halfWidthDeg: 35, scenario: 'treinamento' });
  }
  return events;
}

/** Avalia geometricamente a exposição da sonda à CME. */
export function assessExposure(event: SolarEvent, probeAt: (jd: number) => StateVector) {
  let arrivalJd = event.detectJd;
  for (let k = 0; k < 4; k++) {
    const r = Math.hypot(...probeAt(arrivalJd).r);
    arrivalJd = event.detectJd + r / event.speedKmS / DAY_S;
  }
  const probe = probeAt(arrivalJd);
  const separationDeg = Math.abs(wrap(lonOf(probe) - event.lonDeg));
  return { arrivalJd, separationDeg, exposed: separationDeg <= event.halfWidthDeg, distanceAu: Math.hypot(...probe.r) / AU_KM };
}

/** Probabilidade de dano à eletrônica se a sonda for atingida operando normalmente. */
export function damageProbability(speedKmS: number, shielded: boolean, response: SolarResponse) {
  if (response === 'protecao') return 0;
  const base = Math.min(0.7, Math.max(0.2, 0.25 + (speedKmS - 400) / 2000));
  return base * (shielded ? 0.4 : 1) * (response === 'replanejar' ? 0.5 : 1);
}

export const SOLAR_RULES = {
  protectionDays: 2,
  replanPropellantKg: 2,
  instrumentDegradation: 0.6,
  resetChance: 0.3,
  safeModeDays: 3,
} as const;

// Enlace de rádio sonda → Terra (banda X) pela equação de Friis e um limiar de Eb/N0.
// Modelo didático: parâmetros da estação e de perdas fixos e documentados em docs/FISICA.md.
import { AMPLIFIERS, ANTENNAS } from '../../data/probe';
import { BOLTZMANN, C_KM_S } from '../../domain/units';

export const LINK = {
  frequencyHz: 8.42e9,
  /** Antena de 34 m da Deep Space Network, eficiência de abertura 0,6. */
  groundDiameter: 34,
  groundEfficiency: 0.6,
  spacecraftEfficiency: 0.55,
  /** Temperatura de ruído do sistema receptor (K). */
  systemNoiseK: 30,
  /** Perdas diversas: apontamento, polarização, circuitos (dB). */
  miscLossDb: 2,
  /** Eb/N0 exigido pela codificação (dB) e margem de projeto (dB). */
  requiredEbN0Db: 2.5,
  marginDb: 3,
  /** Taxa máxima do transponder (bit/s), limite didático. */
  maxRate: 6e6,
  /** Ângulo Sol–Terra–sonda abaixo do qual não há enlace (conjunção) e faixa degradada (graus). */
  conjunctionBlackoutDeg: 2,
  conjunctionDegradedDeg: 5,
} as const;

const db = (x: number) => 10 * Math.log10(x);
const fromDb = (x: number) => 10 ** (x / 10);
const wavelength = () => (C_KM_S * 1000) / LINK.frequencyHz;

/** Ganho de um refletor parabólico: G = η·(πD/λ)². */
export function dishGain(diameter: number, efficiency: number): number {
  return efficiency * ((Math.PI * diameter) / wavelength()) ** 2;
}

export type LinkState = 'ok' | 'degradado' | 'indisponivel';

export interface LinkBudget {
  distanceKm: number;
  eirpDbw: number;
  spacecraftGainDbi: number;
  groundGainDbi: number;
  pathLossDb: number;
  receivedPowerDbw: number;
  noiseDensityDbwHz: number;
  /** Taxa de dados sustentável (bit/s), já com o efeito da conjunção solar. */
  rate: number;
  /** Taxa limitada só pela potência recebida (bit/s). */
  rateNoConjunction: number;
  /** Atraso de propagação só de ida (s). */
  oneWayLightTime: number;
  sepDeg: number;
  state: LinkState;
  reason: string;
}

export function linkBudget(antennaId: string, amplifierId: string, distanceKm: number, sepDeg = 180, antennaDamaged = false): LinkBudget {
  const antenna = ANTENNAS[antennaId];
  const amp = AMPLIFIERS[amplifierId];
  if (!antenna || !amp) throw new Error('Antena ou amplificador desconhecido.');
  if (!(distanceKm > 0)) throw new RangeError('Distância do enlace deve ser positiva.');
  const gTx = antenna.diameter && !antennaDamaged ? dishGain(antenna.diameter, LINK.spacecraftEfficiency) : fromDb(ANTENNAS.lga.gainDbi ?? 7);
  const gRx = dishGain(LINK.groundDiameter, LINK.groundEfficiency);
  const lambda = wavelength();
  const d = distanceKm * 1000;
  const pathLoss = ((4 * Math.PI * d) / lambda) ** 2;
  const prx = (amp.rfWatts * gTx * gRx) / pathLoss / fromDb(LINK.miscLossDb);
  const n0 = BOLTZMANN * LINK.systemNoiseK;
  const rateNoConjunction = Math.min(LINK.maxRate, prx / n0 / fromDb(LINK.requiredEbN0Db + LINK.marginDb));
  let state: LinkState = 'ok';
  let reason = 'Enlace nominal.';
  let rate = rateNoConjunction;
  if (sepDeg < LINK.conjunctionBlackoutDeg) {
    state = 'indisponivel';
    reason = `Conjunção solar: o Sol está a ${sepDeg.toFixed(1)}° da sonda vista da Terra; o plasma solar impede o enlace.`;
    rate = 0;
  } else if (sepDeg < LINK.conjunctionDegradedDeg) {
    state = 'degradado';
    reason = `Perto da conjunção (${sepDeg.toFixed(1)}°): cintilação do plasma solar reduz a taxa útil.`;
    rate = rateNoConjunction * 0.25;
  } else if (rate < 1000) {
    state = 'degradado';
    reason = 'Sinal fraco: a taxa útil está abaixo de 1 kbit/s.';
  }
  return {
    distanceKm,
    eirpDbw: db(amp.rfWatts * gTx),
    spacecraftGainDbi: db(gTx),
    groundGainDbi: db(gRx),
    pathLossDb: db(pathLoss),
    receivedPowerDbw: db(prx),
    noiseDensityDbwHz: db(n0),
    rate,
    rateNoConjunction,
    oneWayLightTime: distanceKm / C_KM_S,
    sepDeg,
    state,
    reason,
  };
}

// Operações científicas em órbita de Marte, por turnos de 30 sóis.
// Cada turno: balanço de energia → instrumentos ativos por prioridade → dados gerados → gravador →
// enlace (distância e conjunção reais pelas efemérides) → dados entregues → ciência por tema.
import { INSTRUMENTS, type ProbeConfig, type ScienceTheme } from '../../data/probe';
import { AU_KM } from '../../domain/units';
import type { Ephemeris } from '../orbital/ephemeris';
import { DSN_COST_PER_HOUR_TURN } from './budget';
import { CAPTURE_ORBITS, type CaptureOrbitId } from './capture';
import { linkBudget } from './comms';
import { earthMarsGeometry } from './geometry';
import { probeStats } from './probe';
import { powerGeneration } from './power';
import { createRng, subSeed } from './rng';

export const SOL_HOURS = 24.66;
export const SOLS_PER_TURN = 30;
export const TURN_DAYS = (SOLS_PER_TURN * SOL_HOURS) / 24;
export const TOTAL_TURNS = 8;
export const DSN_OPTIONS = [4, 8, 12] as const;

/** Metas científicas da missão (pontos por tema, escala do jogo). */
export const OBJECTIVES: { theme: ScienceTheme; label: string; target: number }[] = [
  { theme: 'superficie', label: 'Mapear minerais e relevo da superfície', target: 250 },
  { theme: 'subsolo', label: 'Procurar gelo no subsolo', target: 200 },
  { theme: 'atmosfera', label: 'Medir a perda da atmosfera alta', target: 220 },
  { theme: 'campo-magnetico', label: 'Mapear campos magnéticos crustais', target: 150 },
];

export interface TurnPlan {
  /** Instrumentos ligados, em ordem de prioridade (o primeiro é o último a ser desligado). */
  active: string[];
  dsnHoursPerDay: number;
}

export interface TurnReport {
  turn: number;
  startJd: number;
  distanceAu: number;
  sepDegMin: number;
  blackoutDays: number;
  generationW: number;
  energyAvailableWh: number;
  energyNeededWh: number;
  safeMode: boolean;
  shed: string[];
  ran: string[];
  dataGeneratedGbit: number;
  downlinkCapacityGbit: number;
  deliveredGbit: number;
  lostGbit: number;
  recorderGbit: number;
  science: Record<ScienceTheme, number>;
  dsnCost: number;
  dustStorm: boolean;
  events: string[];
}

export interface OpsState {
  turn: number;
  startJd: number;
  jd: number;
  orbit: CaptureOrbitId;
  periAltKm: number;
  /** Dados a bordo por instrumento (Gbit). */
  recorder: Record<string, number>;
  science: Record<ScienceTheme, number>;
  deliveredGbit: number;
  lostGbit: number;
  energyUsedWh: number;
  dsnCost: number;
  degraded: Record<string, number>;
  antennaDamaged: boolean;
  /** Tempestade de poeira (cenário de treinamento): turnos afetados. */
  dustStormTurns: number[];
  history: TurnReport[];
  done: boolean;
}

export const DUST_STORM = { solarAttenuation: 0.55, surfaceScience: 0.4 } as const;

export function startOperations(params: { jd: number; orbit: CaptureOrbitId; periAltKm: number; degraded: Record<string, number>; antennaDamaged: boolean; seed: number }): OpsState {
  const rng = createRng(subSeed(params.seed, 'poeira'));
  const start = 2 + Math.floor(rng() * 4);
  return {
    turn: 0,
    startJd: params.jd,
    jd: params.jd,
    orbit: params.orbit,
    periAltKm: params.periAltKm,
    recorder: {},
    science: { superficie: 0, subsolo: 0, atmosfera: 0, 'campo-magnetico': 0 },
    deliveredGbit: 0,
    lostGbit: 0,
    energyUsedWh: 0,
    dsnCost: 0,
    degraded: params.degraded,
    antennaDamaged: params.antennaDamaged,
    dustStormTurns: [start, start + 1],
    history: [],
    done: false,
  };
}

/** Prévia do balanço de energia de um turno, para a interface (mesma regra de runTurn). */
export function energyBalance(probe: ProbeConfig, orbit: CaptureOrbitId, marsSunAu: number, plan: TurnPlan, dust: boolean) {
  const stats = probeStats(probe);
  const generationW = powerGeneration(probe.powerId, marsSunAu, dust ? DUST_STORM.solarAttenuation : 1);
  const available = generationW * CAPTURE_ORBITS[orbit].sunlitFraction * SOL_HOURS;
  const busWh = stats.busPower * SOL_HOURS;
  const commsWh = stats.commsPower * plan.dsnHoursPerDay;
  const ran: string[] = [];
  const shed: string[] = [];
  let need = busWh + commsWh;
  const safeMode = available < busWh;
  for (const id of plan.active) {
    const inst = INSTRUMENTS[id];
    if (!inst || !probe.instruments.includes(id)) continue;
    const wh = inst.power * inst.hoursPerSol;
    if (!safeMode && need + wh <= available) {
      need += wh;
      ran.push(id);
    } else shed.push(id);
  }
  return { generationW, available, needed: safeMode ? busWh : need, ran, shed, safeMode, commsLimited: !safeMode && busWh + commsWh > available };
}

export function runTurn(ops: OpsState, probe: ProbeConfig, eph: Ephemeris, plan: TurnPlan): OpsState {
  if (ops.done) throw new Error('As operações já terminaram.');
  const turn = ops.turn + 1;
  const dust = ops.dustStormTurns.includes(turn);
  const geo0 = earthMarsGeometry(eph, ops.jd + TURN_DAYS / 2);
  const marsSunAu = geo0.marsSunKm / AU_KM;
  const balance = energyBalance(probe, ops.orbit, marsSunAu, plan, dust);
  const events: string[] = [];
  if (dust) events.push('Tempestade de poeira regional (cenário de treinamento): painéis rendem 55% e imagens da superfície perdem qualidade.');
  if (balance.safeMode) events.push('Energia insuficiente até para o barramento: a sonda passa o turno em modo seguro.');
  if (balance.shed.length && !balance.safeMode) events.push(`Instrumentos desligados por falta de energia: ${balance.shed.map((id) => INSTRUMENTS[id].name).join(', ')}.`);

  const stats = probeStats(probe);
  const recorder = { ...ops.recorder };
  let generated = 0;
  for (const id of balance.ran) {
    const g = INSTRUMENTS[id].dataPerSol * SOLS_PER_TURN;
    recorder[id] = (recorder[id] ?? 0) + g;
    generated += g;
  }

  // Enlace dia a dia (distância e ângulo Sol–Terra–Marte variam ao longo do turno).
  let capacity = 0;
  let sepMin = Infinity;
  let blackout = 0;
  const hours = balance.safeMode ? 1 : balance.commsLimited ? Math.max(1, plan.dsnHoursPerDay / 2) : plan.dsnHoursPerDay;
  for (let d = 0; d < Math.round(TURN_DAYS); d++) {
    const g = earthMarsGeometry(eph, ops.jd + d + 0.5);
    sepMin = Math.min(sepMin, g.sepDeg);
    const link = linkBudget(probe.antennaId, probe.amplifierId, g.distanceKm, g.sepDeg, ops.antennaDamaged);
    if (link.state === 'indisponivel') blackout++;
    capacity += (link.rate * hours * 3600) / 1e9;
  }
  if (blackout > 0) events.push(`Conjunção solar: ${blackout} dia(s) sem enlace com a Terra (ângulo mínimo ${sepMin.toFixed(1)}°).`);

  // Descarga por prioridade.
  let delivered = 0;
  const science = { ...ops.science };
  const order = [...plan.active.filter((id) => recorder[id]), ...Object.keys(recorder).filter((id) => !plan.active.includes(id))];
  let left = capacity;
  for (const id of order) {
    const send = Math.min(left, recorder[id] ?? 0);
    if (send <= 0) continue;
    recorder[id] -= send;
    left -= send;
    delivered += send;
    const inst = INSTRUMENTS[id];
    const quality = inst.orbitFactor[ops.orbit] * (ops.degraded[id] ?? 1) * (dust && inst.theme === 'superficie' ? DUST_STORM.surfaceScience : 1);
    science[inst.theme] += send * inst.sciencePerGbit * quality;
  }
  // Gravador cheio: descarta dados da menor prioridade.
  let stored = Object.values(recorder).reduce((s, v) => s + v, 0);
  let lost = 0;
  for (const id of [...order].reverse()) {
    if (stored <= stats.recorderGbit) break;
    const drop = Math.min(recorder[id] ?? 0, stored - stats.recorderGbit);
    recorder[id] -= drop;
    stored -= drop;
    lost += drop;
  }
  if (lost > 0) events.push(`Gravador cheio: ${lost.toFixed(1)} Gbit descartados.`);
  const dsnCost = plan.dsnHoursPerDay * DSN_COST_PER_HOUR_TURN;
  const report: TurnReport = {
    turn, startJd: ops.jd, distanceAu: geo0.distanceKm / AU_KM, sepDegMin: sepMin, blackoutDays: blackout,
    generationW: balance.generationW, energyAvailableWh: balance.available, energyNeededWh: balance.needed,
    safeMode: balance.safeMode, shed: balance.shed, ran: balance.ran, dataGeneratedGbit: generated,
    downlinkCapacityGbit: capacity, deliveredGbit: delivered, lostGbit: lost, recorderGbit: stored,
    science: Object.fromEntries(Object.entries(science).map(([k, v]) => [k, v - ops.science[k as ScienceTheme]])) as Record<ScienceTheme, number>,
    dsnCost, dustStorm: dust, events,
  };
  return {
    ...ops, turn, jd: ops.jd + TURN_DAYS, recorder, science,
    deliveredGbit: ops.deliveredGbit + delivered, lostGbit: ops.lostGbit + lost,
    energyUsedWh: ops.energyUsedWh + balance.needed * SOLS_PER_TURN, dsnCost: ops.dsnCost + dsnCost,
    history: [...ops.history, report], done: turn >= TOTAL_TURNS,
  };
}

export function objectivesStatus(science: Record<ScienceTheme, number>) {
  return OBJECTIVES.map((o) => ({ ...o, value: science[o.theme], done: science[o.theme] >= o.target }));
}

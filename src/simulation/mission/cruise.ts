// Cruzeiro interplanetário: propagação de dois corpos (Sol), correções de trajetória (TCM) calculadas por
// Lambert até o ponto de mira em Marte, eventos solares e chegada (plano B e periapse).
import { DAY_S, MU, RADIUS } from '../../domain/units';
import type { Ephemeris } from '../orbital/ephemeris';
import { propagate } from '../orbital/kepler';
import { solveLambert } from '../orbital/lambert';
import { add, cross, norm, scale, sub, unit, type StateVector, type Vec3 } from '../orbital/vector';
import { CAPTURE_ORBITS, captureDeltaV, impactParameterFor, periapsisFromB, type CaptureOrbitId } from './capture';
import { linkBudget, LINK } from './comms';
import { sunEarthProbeAngle } from './geometry';
import { deltaVAvailable, propellantFor } from './probe';
import { createRng, gaussian, subSeed } from './rng';
import { assessExposure, damageProbability, generateSolarEvents, SOLAR_RULES, type SolarCalibration, type SolarEvent, type SolarResponse } from './solar';

export const MARS_SOI_KM = 577_000;
/**
 * Viés de proteção planetária: o lançador mira um ponto afastado de Marte para que o estágio superior,
 * que não é esterilizado, não atinja o planeta. A primeira correção remove esse viés (prática de missões reais).
 */
export const PLANETARY_PROTECTION_BIAS_KM = 250_000;
export const ATMOSPHERE_LIMIT_KM = 80;
export const TRACK_STEP_DAYS = 2;
export const MIN_LINK_DISTANCE_KM = RADIUS.earth + 200;

export interface TcmSlot {
  id: string;
  label: string;
  jd: number;
  status: 'pendente' | 'executada' | 'ignorada';
  deltaV?: number;
  propellant?: number;
}

export type CruiseDecision = { kind: 'tcm'; id: string } | { kind: 'solar'; id: string } | { kind: 'chegada' };

export interface CruiseState {
  jd: number;
  launchJd: number;
  plannedArrivalJd: number;
  sc: StateVector;
  dryMass: number;
  propellant: number;
  isp: number;
  captureOrbit: CaptureOrbitId;
  /** Parâmetro de impacto desejado (km) e direção do ponto de mira no plano B. */
  bTarget: number;
  bDirection: Vec3;
  tcms: TcmSlot[];
  solarEvents: SolarEvent[];
  pending: CruiseDecision | null;
  safeModeUntil: number;
  degraded: Record<string, number>;
  instruments: string[];
  shielded: boolean;
  computerResets: number;
  antennaId: string;
  amplifierId: string;
  antennaDamaged: boolean;
  seed: number;
  totalTcmDeltaV: number;
  notes: { jd: number; title: string; text: string; ok: boolean }[];
  /** Rastro percorrido (posições heliocêntricas a cada ~2 dias), para visualização e relatório. */
  track: Vec3[];
}

export interface CruiseInit {
  launchJd: number;
  plannedArrivalJd: number;
  departure: StateVector;
  plannedVInfArr: Vec3;
  dryMass: number;
  propellant: number;
  isp: number;
  captureOrbit: CaptureOrbitId;
  instruments: string[];
  shielded: boolean;
  antennaId: string;
  amplifierId: string;
  antennaDamaged: boolean;
  seed: number;
  calibration?: SolarCalibration;
}

/** Velocidade heliocêntrica de injeção: Lambert até o ponto enviesado de proteção planetária + erro do lançador. */
export function injectionVelocity(eph: Ephemeris, departureJd: number, arrivalJd: number, plannedVInfArr: Vec3, injectionError: Vec3): Vec3 {
  const earth = eph.state('earth', departureJd);
  const mars = eph.state('mars', arrivalJd);
  const b = unit(cross(plannedVInfArr, [0, 0, 1]));
  const sol = solveLambert({ r1: earth.r, r2: add(mars.r, scale(b, PLANETARY_PROTECTION_BIAS_KM)), tof: (arrivalJd - departureJd) * DAY_S, mu: MU.sun });
  if (!sol.ok) throw new Error('Não foi possível calcular a injeção enviesada.');
  return add(sol.v1, injectionError);
}

export function startCruise(init: CruiseInit): CruiseState {
  const orbit = CAPTURE_ORBITS[init.captureOrbit];
  const rpTarget = RADIUS.mars + orbit.periAltKm;
  const vInf = norm(init.plannedVInfArr);
  const bTarget = impactParameterFor(rpTarget, vInf);
  const bDirection = unit(cross(init.plannedVInfArr, [0, 0, 1]));
  const tof = init.plannedArrivalJd - init.launchJd;
  const probeAt = (jd: number) => propagate(init.departure, (jd - init.launchJd) * DAY_S, MU.sun);
  return {
    jd: init.launchJd,
    launchJd: init.launchJd,
    plannedArrivalJd: init.plannedArrivalJd,
    sc: init.departure,
    dryMass: init.dryMass,
    propellant: init.propellant,
    isp: init.isp,
    captureOrbit: init.captureOrbit,
    bTarget,
    bDirection,
    tcms: [
      { id: 'tcm-1', label: 'TCM-1', jd: init.launchJd + 10, status: 'pendente' },
      { id: 'tcm-2', label: 'TCM-2', jd: init.launchJd + Math.round(tof * 0.25), status: 'pendente' },
      { id: 'tcm-3', label: 'TCM-3', jd: init.plannedArrivalJd - 45, status: 'pendente' },
      { id: 'tcm-4', label: 'TCM-4', jd: init.plannedArrivalJd - 8, status: 'pendente' },
    ],
    solarEvents: generateSolarEvents(init.seed, init.launchJd, init.plannedArrivalJd, probeAt, init.calibration),
    pending: null,
    safeModeUntil: 0,
    degraded: {},
    instruments: init.instruments,
    shielded: init.shielded,
    computerResets: 0,
    antennaId: init.antennaId,
    amplifierId: init.amplifierId,
    antennaDamaged: init.antennaDamaged,
    seed: init.seed,
    totalTcmDeltaV: 0,
    notes: [],
    track: [init.departure.r],
  };
}

/** Estado da sonda num instante (propagação a partir do estado atual). */
export function probeStateAt(state: CruiseState, jd: number): StateVector {
  return propagate(state.sc, (jd - state.jd) * DAY_S, MU.sun);
}

/** Avança até toJd ou até a próxima decisão (TCM, evento solar ou chegada). */
export function advanceCruise(state: CruiseState, toJd: number): CruiseState {
  if (state.pending) return state;
  const candidates: { jd: number; decision: CruiseDecision }[] = [
    ...state.tcms.filter((t) => t.status === 'pendente' && t.jd > state.jd - 1e-9).map((t) => ({ jd: t.jd, decision: { kind: 'tcm', id: t.id } as CruiseDecision })),
    ...state.solarEvents.filter((e) => !e.response && e.detectJd > state.jd - 1e-9).map((e) => ({ jd: e.detectJd, decision: { kind: 'solar', id: e.id } as CruiseDecision })),
    { jd: state.plannedArrivalJd, decision: { kind: 'chegada' } as CruiseDecision },
  ].sort((a, b) => a.jd - b.jd);
  const next = candidates[0];
  const target = Math.min(toJd, next.jd);
  const sc = probeStateAt(state, target);
  const track = [...state.track];
  const lastJd = state.launchJd + (track.length - 1) * TRACK_STEP_DAYS;
  for (let jd = lastJd + TRACK_STEP_DAYS; jd <= target; jd += TRACK_STEP_DAYS) track.push(probeStateAt(state, jd).r);
  return { ...state, jd: target, sc, track, pending: target >= next.jd - 1e-9 ? next.decision : null };
}

/** Ponto de mira heliocêntrico em Marte no instante de chegada planejado. */
export function aimPoint(state: CruiseState, eph: Ephemeris): Vec3 {
  const mars = eph.state('mars', state.plannedArrivalJd).r;
  return add(mars, scale(state.bDirection, state.bTarget));
}

/** Δv necessário para corrigir a trajetória a partir de um estado num instante (Lambert até o ponto de mira). */
export function correctionFrom(state: CruiseState, eph: Ephemeris, sc: StateVector, jd: number) {
  const tof = (state.plannedArrivalJd - jd) * DAY_S;
  const sol = solveLambert({ r1: sc.r, r2: aimPoint(state, eph), tof, mu: MU.sun });
  if (!sol.ok) return null;
  const dv = sub(sol.v1, sc.v);
  return { dvVec: dv, deltaV: norm(dv) * 1000 };
}

/** Prévia didática: corrigir agora × na próxima oportunidade (mesma dinâmica, outra geometria). */
export function tcmPreview(state: CruiseState, eph: Ephemeris) {
  const now = correctionFrom(state, eph, state.sc, state.jd);
  const nextSlot = state.tcms.find((t) => t.status === 'pendente' && t.jd > state.jd + 0.5);
  let later: { label: string; deltaV: number } | null = null;
  if (nextSlot) {
    const c = correctionFrom(state, eph, probeStateAt(state, nextSlot.jd), nextSlot.jd);
    if (c) later = { label: nextSlot.label, deltaV: c.deltaV };
  }
  const miss = predictArrival(state, eph);
  return { now, later, miss, available: deltaVAvailable(state.dryMass, state.propellant, state.isp) };
}

export function commsAt(state: CruiseState, eph: Ephemeris, jd = state.jd, sc = state.sc) {
  const earth = eph.state('earth', jd).r;
  // Nas cônicas remendadas a sonda parte do centro da Terra: perto dela, usa a distância mínima da órbita de estacionamento.
  const distance = norm(sub(sc.r, earth));
  const near = distance < MIN_LINK_DISTANCE_KM;
  const sep = near ? 180 : sunEarthProbeAngle(earth, sc.r);
  return linkBudget(state.antennaId, state.amplifierId, Math.max(distance, MIN_LINK_DISTANCE_KM), sep, state.antennaDamaged);
}

export function executeTcm(state: CruiseState, eph: Ephemeris, id: string): CruiseState {
  const slot = state.tcms.find((t) => t.id === id);
  if (!slot || slot.status !== 'pendente') throw new Error('Correção não está disponível.');
  const notes = [...state.notes];
  if (state.jd < state.safeModeUntil) throw new Error('A sonda está em modo seguro: comandos de manobra estão suspensos.');
  const link = commsAt(state, eph);
  if (link.state === 'indisponivel') throw new Error(`Sem enlace com a Terra: ${link.reason}`);
  const corr = correctionFrom(state, eph, state.sc, state.jd);
  if (!corr) throw new Error('Não há solução de Lambert para corrigir a trajetória a partir daqui.');
  const rng = createRng(subSeed(state.seed, id));
  const sigmaMag = 0.01 * (state.computerResets > 0 ? 2 : 1);
  const sigmaPoint = (0.3 * Math.PI) / 180 * (state.computerResets > 0 ? 2 : 1);
  const available = deltaVAvailable(state.dryMass, state.propellant, state.isp);
  const wanted = corr.deltaV;
  const commanded = Math.min(wanted, available);
  const dir = unit(corr.dvVec);
  const perp1 = unit(cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const perp2 = cross(dir, perp1);
  const actualDir = unit(add(dir, add(scale(perp1, gaussian(rng) * sigmaPoint), scale(perp2, gaussian(rng) * sigmaPoint))));
  const actualMag = (commanded / 1000) * (1 + gaussian(rng) * sigmaMag);
  const propellant = propellantFor(commanded, state.dryMass + state.propellant, state.isp);
  const sc = { r: state.sc.r, v: add(state.sc.v, scale(actualDir, actualMag)) };
  const ok = commanded >= wanted - 1e-6;
  notes.push({ jd: state.jd, title: slot.label, text: ok ? `Correção de ${commanded.toFixed(2)} m/s executada (${propellant.toFixed(1)} kg de propelente).` : `Propelente insuficiente: só ${commanded.toFixed(1)} de ${wanted.toFixed(1)} m/s.`, ok });
  return {
    ...state,
    sc,
    propellant: state.propellant - propellant,
    totalTcmDeltaV: state.totalTcmDeltaV + commanded,
    tcms: state.tcms.map((t) => (t.id === id ? { ...t, status: 'executada', deltaV: commanded, propellant } : t)),
    pending: null,
    notes,
  };
}

export function skipTcm(state: CruiseState, id: string): CruiseState {
  const slot = state.tcms.find((t) => t.id === id);
  if (!slot) return state;
  return {
    ...state,
    tcms: state.tcms.map((t) => (t.id === id ? { ...t, status: 'ignorada' } : t)),
    pending: null,
    notes: [...state.notes, { jd: state.jd, title: slot.label, text: 'Correção dispensada pela equipe de navegação.', ok: true }],
  };
}

export function evaluateSolarEvent(state: CruiseState, id: string) {
  const event = state.solarEvents.find((e) => e.id === id);
  if (!event) throw new Error('Evento solar desconhecido.');
  return { event, ...assessExposure(event, (jd) => probeStateAt(state, jd)) };
}

export function respondSolarEvent(state: CruiseState, id: string, response: SolarResponse): CruiseState {
  const { event, arrivalJd, exposed, separationDeg } = evaluateSolarEvent(state, id);
  const rng = createRng(subSeed(state.seed, `${id}-${response}`));
  let damage: string | null = null;
  let degraded = state.degraded;
  let computerResets = state.computerResets;
  let safeModeUntil = state.safeModeUntil;
  let propellant = state.propellant;
  let tcms = state.tcms;
  if (response === 'protecao') {
    safeModeUntil = Math.max(safeModeUntil, arrivalJd + SOLAR_RULES.protectionDays / 2);
  }
  if (response === 'replanejar') propellant = Math.max(0, propellant - SOLAR_RULES.replanPropellantKg);
  // TCMs que cairiam dentro do modo seguro/passagem da CME são reagendadas para depois.
  if (response !== 'manter') {
    const until = arrivalJd + SOLAR_RULES.protectionDays;
    tcms = tcms.map((t) => (t.status === 'pendente' && t.jd >= state.jd && t.jd <= until && t.jd < state.plannedArrivalJd - 2 ? { ...t, jd: Math.min(until + 1, state.plannedArrivalJd - 2) } : t));
  }
  if (exposed) {
    const p = damageProbability(event.speedKmS, state.shielded, response);
    if (rng() < p) {
      if (rng() < SOLAR_RULES.resetChance || state.instruments.length === 0) {
        computerResets += 1;
        safeModeUntil = Math.max(safeModeUntil, arrivalJd + SOLAR_RULES.safeModeDays);
        damage = 'Partículas energéticas reiniciaram o computador de bordo: 3 dias em modo seguro e manobras seguintes menos precisas.';
      } else {
        const inst = state.instruments[Math.floor(rng() * state.instruments.length)];
        degraded = { ...degraded, [inst]: (degraded[inst] ?? 1) * SOLAR_RULES.instrumentDegradation };
        damage = `Dano por radiação no instrumento ${inst}: retorno científico reduzido a ${Math.round(SOLAR_RULES.instrumentDegradation * 100)}%.`;
      }
    }
  }
  const responseLabel = { manter: 'operações mantidas', protecao: 'modo de proteção', replanejar: 'replanejamento' }[response];
  const text = exposed
    ? `A CME (${event.speedKmS} km/s) atingiu a sonda em ${responseLabel}. ${damage ?? 'Nenhum dano registrado.'}`
    : `A CME passou a ${separationDeg.toFixed(0)}° da sonda (cone de ±${event.halfWidthDeg.toFixed(0)}°): sem exposição. Resposta: ${responseLabel}.`;
  return {
    ...state,
    degraded, computerResets, safeModeUntil, propellant, tcms,
    solarEvents: state.solarEvents.map((e) => (e.id === id ? { ...e, response, arrivalJd, exposed, separationDeg, damage } : e)),
    pending: null,
    notes: [...state.notes, { jd: state.jd, title: 'Evento solar (cenário de treinamento)', text, ok: !damage }],
  };
}

export interface ArrivalPrediction {
  closestJd: number;
  /** Distância de máxima aproximação no referencial heliocêntrico ≈ parâmetro de impacto B (km). */
  B: number;
  vInf: number;
  periapsisKm: number;
  periapsisAltKm: number;
  bTarget: number;
  outcome: 'captura-possivel' | 'impacto' | 'longe';
}

/** Previsão de chegada propagando o estado atual (cônicas remendadas: Marte não perturba antes da SOI). */
export function predictArrival(state: CruiseState, eph: Ephemeris): ArrivalPrediction {
  const dist = (jd: number) => {
    const sc = probeStateAt(state, jd);
    const m = eph.state('mars', jd);
    return { d: norm(sub(sc.r, m.r)), vInf: norm(sub(sc.v, m.v)) };
  };
  let bestJd = state.plannedArrivalJd;
  let best = dist(bestJd).d;
  for (let jd = state.plannedArrivalJd - 6; jd <= state.plannedArrivalJd + 6; jd += 0.05) {
    if (jd < state.jd) continue;
    const d = dist(jd).d;
    if (d < best) { best = d; bestJd = jd; }
  }
  let a = bestJd - 0.05;
  let b = bestJd + 0.05;
  for (let k = 0; k < 40; k++) {
    const c = b - 0.618 * (b - a);
    const d = a + 0.618 * (b - a);
    if (dist(c).d < dist(d).d) b = d; else a = c;
  }
  const closestJd = (a + b) / 2;
  const { d: B, vInf } = dist(closestJd);
  const periapsisKm = periapsisFromB(B, vInf);
  const periapsisAltKm = periapsisKm - RADIUS.mars;
  const outcome = B > MARS_SOI_KM ? 'longe' : periapsisAltKm < ATMOSPHERE_LIMIT_KM ? 'impacto' : 'captura-possivel';
  return { closestJd, B, vInf, periapsisKm, periapsisAltKm, bTarget: state.bTarget, outcome };
}

export interface CaptureResult {
  ok: boolean;
  reason: string;
  deltaV: number;
  propellant: number;
  periAltKm: number;
  apoAltKm: number;
  arrival: ArrivalPrediction;
}

/** Δv de inserção para o periapse previsto (NaN se não há captura possível) e Δv disponível. */
export function captureRequirement(state: CruiseState, eph: Ephemeris) {
  const arrival = predictArrival(state, eph);
  const orbit = CAPTURE_ORBITS[state.captureOrbit];
  const ra = Math.max(arrival.periapsisKm, RADIUS.mars + orbit.apoAltKm);
  const deltaV = arrival.outcome === 'captura-possivel' ? captureDeltaV(arrival.vInf, arrival.periapsisKm, ra) : NaN;
  return { arrival, ra, deltaV, available: deltaVAvailable(state.dryMass, state.propellant, state.isp) };
}

/** Inserção em órbita de Marte com o periapse efetivamente alcançado. */
export function executeCapture(state: CruiseState, eph: Ephemeris): { cruise: CruiseState; capture: CaptureResult } {
  const { arrival, ra, deltaV: dv, available } = captureRequirement(state, eph);
  const none = { deltaV: 0, propellant: 0, periAltKm: arrival.periapsisAltKm, apoAltKm: NaN, arrival };
  if (arrival.outcome === 'longe') return { cruise: { ...state, pending: null }, capture: { ok: false, reason: `A sonda passou a ${Math.round(arrival.B).toLocaleString('pt-BR')} km de Marte, fora da esfera de influência: não há captura possível.`, ...none } };
  if (arrival.outcome === 'impacto') return { cruise: { ...state, pending: null }, capture: { ok: false, reason: `O periapse ficou a ${Math.round(arrival.periapsisAltKm)} km de altitude, dentro da atmosfera: a sonda reentra e se perde.`, ...none } };
  if (available < dv) {
    return { cruise: { ...state, pending: null }, capture: { ok: false, reason: `A captura exigia ${Math.round(dv)} m/s e restavam ${Math.round(available)} m/s: a sonda segue numa hipérbole e deixa Marte.`, ...none } };
  }
  const propellant = propellantFor(dv, state.dryMass + state.propellant, state.isp);
  return {
    cruise: { ...state, propellant: state.propellant - propellant, pending: null, notes: [...state.notes, { jd: state.jd, title: 'Inserção orbital', text: `Queima de ${Math.round(dv)} m/s no periapse a ${Math.round(arrival.periapsisAltKm)} km.`, ok: true }] },
    capture: { ok: true, reason: 'Sonda capturada em órbita de Marte.', deltaV: dv, propellant, periAltKm: arrival.periapsisAltKm, apoAltKm: ra - RADIUS.mars, arrival },
  };
}

export const CONJUNCTION_RULE = LINK;

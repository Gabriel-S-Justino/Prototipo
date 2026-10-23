// Estado global da missão e suas transições explícitas (reducer puro, testável sem interface).
import { PRESETS, type VehicleConfig } from '../data/launchers';
import { DEFAULT_PROBE, type ProbeConfig } from '../data/probe';
import { isoToJd } from '../domain/units';
import { ephemerisFrom, type Ephemeris, type EphemerisDescriptor } from '../simulation/orbital/ephemeris';
import type { CaptureOrbitId } from '../simulation/mission/capture';
import {
  advanceCruise, executeCapture, executeTcm, injectionVelocity, respondSolarEvent, skipTcm, startCruise,
  type CaptureResult, type CruiseState,
} from '../simulation/mission/cruise';
import { simulateLaunch, type LaunchResult } from '../simulation/mission/launch';
import { DSN_OPTIONS, runTurn, startOperations, type OpsState, type TurnPlan } from '../simulation/mission/marsOps';
import { derivePlan, type MissionDesign, type MissionPlan, type TrajectorySelection } from '../simulation/mission/plan';
import { buildReport, type MissionLogEntry, type MissionReport, type PlanSnapshot } from '../simulation/mission/report';
import { DEFAULT_CALIBRATION, type SolarCalibration, type SolarResponse } from '../simulation/mission/solar';

export type Phase = 'centro' | 'hangar' | 'planejamento' | 'checklist' | 'lancamento' | 'cruzeiro' | 'marte' | 'relatorio';

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'centro', label: 'Centro de missões' },
  { id: 'hangar', label: 'Hangar' },
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'lancamento', label: 'Lançamento' },
  { id: 'cruzeiro', label: 'Cruzeiro' },
  { id: 'marte', label: 'Operações em Marte' },
  { id: 'relatorio', label: 'Relatório' },
];

export interface MissionState {
  phase: Phase;
  seed: number;
  design: MissionDesign;
  selection: TrajectorySelection;
  ephemeris: EphemerisDescriptor;
  solarCalibration: SolarCalibration;
  advanced: boolean;
  launch: LaunchResult | null;
  planSnapshot: PlanSnapshot | null;
  cruise: CruiseState | null;
  capture: CaptureResult | null;
  ops: OpsState | null;
  turnPlan: TurnPlan;
  log: MissionLogEntry[];
  failureReason: string | null;
  report: MissionReport | null;
  /** Mensagem para o jogador quando uma ação é recusada pelas regras. */
  notice: string | null;
}

/** Data e tempo de voo iniciais: a referência de validação de 31/10/2026 (ver docs/FISICA.md). */
export const INITIAL_SELECTION: TrajectorySelection = { departureJd: isoToJd('2026-10-31'), tofDays: 293 };

export function createMissionState(seed = 20261031): MissionState {
  return {
    phase: 'centro',
    seed,
    design: { vehicle: { ...PRESETS['atlas-401'].config }, probe: { ...DEFAULT_PROBE, instruments: [...DEFAULT_PROBE.instruments] }, captureOrbit: 'eliptica' },
    selection: { ...INITIAL_SELECTION },
    ephemeris: { kind: 'standish' },
    solarCalibration: DEFAULT_CALIBRATION,
    advanced: false,
    launch: null,
    planSnapshot: null,
    cruise: null,
    capture: null,
    ops: null,
    turnPlan: { active: [...DEFAULT_PROBE.instruments], dsnHoursPerDay: 8 },
    log: [],
    failureReason: null,
    report: null,
    notice: null,
  };
}

export type MissionAction =
  | { type: 'ir'; phase: Phase }
  | { type: 'veiculo'; patch: Partial<VehicleConfig> }
  | { type: 'preset'; id: string }
  | { type: 'sonda'; patch: Partial<ProbeConfig> }
  | { type: 'instrumento'; id: string }
  | { type: 'orbita-captura'; orbit: CaptureOrbitId }
  | { type: 'trajetoria'; selection: TrajectorySelection }
  | { type: 'efemerides'; descriptor: EphemerisDescriptor }
  | { type: 'calibracao-solar'; calibration: SolarCalibration }
  | { type: 'modo-avancado'; value: boolean }
  | { type: 'lancar'; forced: boolean }
  | { type: 'iniciar-cruzeiro' }
  | { type: 'avancar'; days: number }
  | { type: 'tcm'; id: string; execute: boolean }
  | { type: 'resposta-solar'; id: string; response: SolarResponse }
  | { type: 'captura' }
  | { type: 'plano-turno'; plan: Partial<TurnPlan> }
  | { type: 'turno' }
  | { type: 'encerrar' }
  | { type: 'aviso'; message: string | null }
  | { type: 'reiniciar' };

const ephCache = new WeakMap<EphemerisDescriptor, Ephemeris>();
export function ephemerisOf(state: Pick<MissionState, 'ephemeris'>): Ephemeris {
  let eph = ephCache.get(state.ephemeris);
  if (!eph) {
    eph = ephemerisFrom(state.ephemeris);
    ephCache.set(state.ephemeris, eph);
  }
  return eph;
}

export function planOf(state: MissionState): MissionPlan {
  return derivePlan(state.design, state.selection, ephemerisOf(state));
}

const DESIGN_PHASES: Phase[] = ['centro', 'hangar', 'planejamento', 'checklist'];

/** Fases que o jogador pode abrir agora. */
export function reachablePhases(state: MissionState): Phase[] {
  if (state.report) return ['relatorio'];
  if (!state.launch) return DESIGN_PHASES;
  if (state.phase === 'lancamento') return ['lancamento'];
  if (state.ops) return ['marte'];
  if (state.cruise) return ['cruzeiro'];
  return [state.phase];
}

function log(state: MissionState, jd: number, title: string, text: string, ok: boolean): MissionLogEntry[] {
  return [...state.log, { jd, phase: state.phase, title, text, ok }];
}

function snapshot(state: MissionState, plan: MissionPlan, forced: boolean): PlanSnapshot {
  const v = plan.vehicle;
  return {
    vehicleName: Object.values(PRESETS).find((p) => JSON.stringify(p.config) === JSON.stringify(state.design.vehicle))?.name ?? 'Configuração personalizada',
    stack: [
      `${v.core.name} (${v.core.engineCount}× ${v.coreEngine.name})`,
      v.booster ? `${v.config.boosterCount}× ${v.booster.name}` : 'Sem propulsores laterais',
      `${v.upper.name} (${v.config.upperEngineCount}× ${v.upperEngine.name})`,
      v.fairing.name,
    ],
    departureJd: state.selection.departureJd,
    arrivalJd: plan.arrivalJd,
    tofDays: state.selection.tofDays,
    c3: plan.transfer.ok ? plan.transfer.c3 : NaN,
    vInfArr: plan.transfer.ok ? plan.transfer.vInfArr : NaN,
    dlaDeg: plan.transfer.ok ? plan.transfer.dlaDeg : NaN,
    capacity: plan.capacity,
    launchMass: plan.probe.launchMass,
    captureDeltaV: plan.captureDeltaV,
    probeDeltaV: plan.probe.deltaV,
    budgetTotal: plan.budget.total,
    budgetLimit: plan.budget.limit,
    ephemerisLabel: ephemerisOf(state).label,
    checklist: plan.checklist.map((c) => ({ label: c.label, status: c.status })),
    forced,
  };
}

function finish(state: MissionState, failureReason: string | null): MissionState {
  const next = { ...state, failureReason, phase: 'relatorio' as Phase };
  return {
    ...next,
    report: buildReport({ plan: state.planSnapshot!, launch: state.launch, cruise: state.cruise, capture: state.capture, ops: state.ops, log: state.log, failureReason }),
  };
}

export function missionReducer(state: MissionState, action: MissionAction): MissionState {
  const locked = state.launch !== null;
  try {
    switch (action.type) {
      case 'ir':
        if (!reachablePhases(state).includes(action.phase)) return { ...state, notice: 'Essa etapa não está disponível agora.' };
        return { ...state, phase: action.phase, notice: null };
      case 'veiculo':
        if (locked) return state;
        return { ...state, design: { ...state.design, vehicle: { ...state.design.vehicle, ...action.patch } } };
      case 'preset':
        if (locked || !PRESETS[action.id]) return state;
        return { ...state, design: { ...state.design, vehicle: { ...PRESETS[action.id].config } } };
      case 'sonda':
        if (locked) return state;
        return { ...state, design: { ...state.design, probe: { ...state.design.probe, ...action.patch } } };
      case 'instrumento': {
        if (locked) return state;
        const list = state.design.probe.instruments;
        const instruments = list.includes(action.id) ? list.filter((i) => i !== action.id) : [...list, action.id];
        return { ...state, design: { ...state.design, probe: { ...state.design.probe, instruments } }, turnPlan: { ...state.turnPlan, active: instruments } };
      }
      case 'orbita-captura':
        if (locked) return state;
        return { ...state, design: { ...state.design, captureOrbit: action.orbit } };
      case 'trajetoria':
        if (locked) return state;
        return { ...state, selection: { ...action.selection } };
      case 'efemerides':
        if (locked) return state;
        return { ...state, ephemeris: action.descriptor };
      case 'calibracao-solar':
        if (locked) return state;
        return { ...state, solarCalibration: action.calibration };
      case 'modo-avancado':
        return { ...state, advanced: action.value };
      case 'aviso':
        return { ...state, notice: action.message };
      case 'lancar': {
        if (locked) return state;
        const plan = planOf(state);
        if (!plan.goForLaunch && !action.forced) return { ...state, notice: 'Há itens NO-GO no checklist. Corrija-os ou use o lançamento forçado.' };
        const result = simulateLaunch(plan, { forced: action.forced, seed: state.seed });
        const withLaunch: MissionState = { ...state, launch: result, planSnapshot: snapshot(state, plan, action.forced && !plan.goForLaunch), phase: 'lancamento', notice: null };
        let entries = withLaunch.log;
        for (const e of result.events) entries = [...entries, { jd: state.selection.departureJd + e.t / 86400, phase: 'lancamento', title: 'Lançamento', text: e.label, ok: e.ok }];
        return { ...withLaunch, log: entries };
      }
      case 'iniciar-cruzeiro': {
        if (!state.launch || state.cruise) return state;
        if (state.launch.outcome === 'falha') return finish(state, state.launch.failure?.reason ?? 'Falha no lançamento.');
        const plan = planOf(state);
        if (!plan.transfer.ok) return finish(state, 'Trajetória inválida.');
        const eph = ephemerisOf(state);
        const v = injectionVelocity(eph, plan.transfer.departureJd, plan.arrivalJd, plan.transfer.vInfArrVec, state.launch.injectionError);
        const cruise = startCruise({
          launchJd: plan.transfer.departureJd,
          plannedArrivalJd: plan.arrivalJd,
          departure: { r: plan.transfer.earthAtDeparture.r, v },
          plannedVInfArr: plan.transfer.vInfArrVec,
          dryMass: plan.probe.dryMass,
          propellant: plan.probe.propellant - state.launch.probePropellantUsed,
          isp: plan.probe.isp,
          captureOrbit: state.design.captureOrbit,
          instruments: state.design.probe.instruments,
          shielded: state.design.probe.shield,
          antennaId: state.design.probe.antennaId,
          amplifierId: state.design.probe.amplifierId,
          antennaDamaged: state.launch.antennaDamaged,
          seed: state.seed,
          calibration: state.solarCalibration,
        });
        return { ...state, cruise: advanceCruise(cruise, cruise.jd), phase: 'cruzeiro', log: log(state, cruise.jd, 'Cruzeiro', 'Início do cruzeiro interplanetário.', true) };
      }
      case 'avancar': {
        if (!state.cruise) return state;
        return { ...state, cruise: advanceCruise(state.cruise, state.cruise.jd + action.days), notice: null };
      }
      case 'tcm': {
        if (!state.cruise) return state;
        const eph = ephemerisOf(state);
        const cruise = action.execute ? executeTcm(state.cruise, eph, action.id) : skipTcm(state.cruise, action.id);
        const note = cruise.notes.at(-1)!;
        return { ...state, cruise, notice: null, log: log(state, note.jd, note.title, note.text, note.ok) };
      }
      case 'resposta-solar': {
        if (!state.cruise) return state;
        const cruise = respondSolarEvent(state.cruise, action.id, action.response);
        const note = cruise.notes.at(-1)!;
        return { ...state, cruise, log: log(state, note.jd, note.title, note.text, note.ok) };
      }
      case 'captura': {
        if (!state.cruise || state.cruise.pending?.kind !== 'chegada') return { ...state, notice: 'A sonda ainda não chegou a Marte.' };
        const eph = ephemerisOf(state);
        const { cruise, capture } = executeCapture(state.cruise, eph);
        const next: MissionState = { ...state, cruise, capture, log: log(state, capture.arrival.closestJd, 'Chegada a Marte', capture.ok ? `Inserção orbital de ${Math.round(capture.deltaV)} m/s: órbita de ${Math.round(capture.periAltKm)} × ${Math.round(capture.apoAltKm)} km.` : capture.reason, capture.ok) };
        if (!capture.ok) return finish(next, capture.reason);
        const ops = startOperations({ jd: capture.arrival.closestJd, orbit: state.design.captureOrbit, periAltKm: capture.periAltKm, degraded: cruise.degraded, antennaDamaged: cruise.antennaDamaged, seed: state.seed });
        return { ...next, ops, phase: 'marte' };
      }
      case 'plano-turno': {
        const plan = { ...state.turnPlan, ...action.plan };
        if (!DSN_OPTIONS.includes(plan.dsnHoursPerDay as (typeof DSN_OPTIONS)[number])) return state;
        return { ...state, turnPlan: plan };
      }
      case 'turno': {
        if (!state.ops || state.ops.done) return state;
        const ops = runTurn(state.ops, state.design.probe, ephemerisOf(state), state.turnPlan);
        const r = ops.history.at(-1)!;
        const next = { ...state, ops, log: log(state, r.startJd, `Turno ${r.turn}`, `${r.deliveredGbit.toFixed(1)} Gbit entregues; ${r.events.length ? r.events.join(' ') : 'sem ocorrências.'}`, !r.safeMode) };
        return ops.done ? finish(next, null) : next;
      }
      case 'encerrar':
        if (!state.planSnapshot) return state;
        return finish(state, state.capture?.ok ? null : 'Missão encerrada antes da chegada a Marte.');
      case 'reiniciar':
        return createMissionState(state.seed + 1);
    }
  } catch (error) {
    return { ...state, notice: (error as Error).message };
  }
  return state;
}

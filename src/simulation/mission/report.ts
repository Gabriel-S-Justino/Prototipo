// Relatório final, construído exclusivamente a partir do histórico registrado da simulação.
import type { ScienceTheme } from '../../data/probe';
import type { CaptureResult, CruiseState } from './cruise';
import type { LaunchResult } from './launch';
import { objectivesStatus, type OpsState } from './marsOps';

export interface PlanSnapshot {
  vehicleName: string;
  stack: string[];
  departureJd: number;
  arrivalJd: number;
  tofDays: number;
  c3: number;
  vInfArr: number;
  dlaDeg: number;
  capacity: number;
  launchMass: number;
  captureDeltaV: number;
  probeDeltaV: number;
  budgetTotal: number;
  budgetLimit: number;
  ephemerisLabel: string;
  checklist: { label: string; status: string }[];
  forced: boolean;
}

export interface MissionLogEntry { jd: number; phase: string; title: string; text: string; ok: boolean }

export interface MissionReport {
  outcome: 'sucesso' | 'parcial' | 'falha';
  headline: string;
  plan: PlanSnapshot;
  launch: LaunchResult | null;
  tcms: { label: string; status: string; deltaV?: number }[];
  totalTcmDeltaV: number;
  solarEvents: { when: number; exposed?: boolean; response?: string; damage?: string | null; scenario: string }[];
  capture: CaptureResult | null;
  actualArrivalJd: number | null;
  ops: { turns: number; deliveredGbit: number; lostGbit: number; energyUsedWh: number; dsnCost: number; science: Record<ScienceTheme, number> } | null;
  objectives: ReturnType<typeof objectivesStatus>;
  budget: { planned: number; actual: number; limit: number; kind: 'ficticio-didatico' };
  propellantLeft: number | null;
  risks: string[];
  log: MissionLogEntry[];
}

export function buildReport(input: {
  plan: PlanSnapshot;
  launch: LaunchResult | null;
  cruise: CruiseState | null;
  capture: CaptureResult | null;
  ops: OpsState | null;
  log: MissionLogEntry[];
  failureReason: string | null;
}): MissionReport {
  const { plan, launch, cruise, capture, ops, log } = input;
  const science = ops?.science ?? { superficie: 0, subsolo: 0, atmosfera: 0, 'campo-magnetico': 0 };
  const objectives = objectivesStatus(science);
  const done = objectives.filter((o) => o.done).length;
  const captured = capture?.ok ?? false;
  const outcome: MissionReport['outcome'] = !captured ? 'falha' : done >= 2 ? 'sucesso' : 'parcial';
  const risks: string[] = [];
  if (plan.forced) risks.push('Lançamento forçado com itens NO-GO no checklist.');
  if (launch?.antennaDamaged) risks.push('Antena de alto ganho danificada na separação da coifa.');
  if (launch && launch.shortfallDeltaV > 0) risks.push(`O lançador entregou ${Math.round(launch.shortfallDeltaV)} m/s a menos; a sonda gastou ${Math.round(launch.probePropellantUsed)} kg de propelente para compensar.`);
  for (const e of cruise?.solarEvents ?? []) if (e.damage) risks.push(e.damage);
  for (const t of cruise?.tcms ?? []) if (t.status === 'ignorada') risks.push(`${t.label} foi dispensada.`);
  for (const r of ops?.history ?? []) for (const ev of r.events) risks.push(`Turno ${r.turn}: ${ev}`);
  if (input.failureReason) risks.unshift(input.failureReason);
  const extra = (ops?.dsnCost ?? 0);
  const headline = outcome === 'sucesso'
    ? `Missão cumprida: ${done} de ${objectives.length} objetivos científicos concluídos.`
    : outcome === 'parcial'
      ? `Sonda em órbita de Marte, mas só ${done} objetivo(s) científico(s) concluído(s).`
      : `Missão perdida: ${input.failureReason ?? 'a sonda não entrou em órbita de Marte.'}`;
  return {
    outcome,
    headline,
    plan,
    launch,
    tcms: (cruise?.tcms ?? []).map((t) => ({ label: t.label, status: t.status, deltaV: t.deltaV })),
    totalTcmDeltaV: cruise?.totalTcmDeltaV ?? 0,
    solarEvents: (cruise?.solarEvents ?? []).filter((e) => e.response).map((e) => ({ when: e.detectJd, exposed: e.exposed, response: e.response, damage: e.damage, scenario: e.scenario })),
    capture,
    actualArrivalJd: capture?.arrival.closestJd ?? null,
    ops: ops ? { turns: ops.turn, deliveredGbit: ops.deliveredGbit, lostGbit: ops.lostGbit, energyUsedWh: ops.energyUsedWh, dsnCost: ops.dsnCost, science } : null,
    objectives,
    budget: { planned: plan.budgetTotal, actual: plan.budgetTotal + extra, limit: plan.budgetLimit, kind: 'ficticio-didatico' },
    propellantLeft: cruise ? cruise.propellant : null,
    risks,
    log,
  };
}

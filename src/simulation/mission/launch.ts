// Simulação do lançamento: sequência de eventos derivada do modelo de desempenho e das regras de missão.
// A animação 3D consome esta sequência; ela nunca decide sozinha se uma separação deu certo.
import { G0 } from '../../domain/units';
import { add, type Vec3 } from '../orbital/vector';
import { c3FromDeparture, departureDeltaV, type BurnPhase } from '../rocket/performance';
import type { MissionPlan } from './plan';
import { propellantFor } from './probe';
import { createRng, gaussian, subSeed } from './rng';

export type LaunchOutcome = 'nominal' | 'subdesempenho' | 'falha';

export interface LaunchEvent {
  /** Tempo desde a ignição (s). */
  t: number;
  kind: 'ignicao' | 'decolagem' | 'separacao-boosters' | 'meco' | 'separacao-estagio' | 'coifa' | 'ignicao-superior' | 'seco-1' | 'estacionamento' | 'reignicao' | 'seco-2' | 'separacao-sonda' | 'propulsao-sonda' | 'dano' | 'falha';
  label: string;
  ok: boolean;
}

export interface LaunchResult {
  forced: boolean;
  outcome: LaunchOutcome;
  failure: { t: number; reason: string } | null;
  events: LaunchEvent[];
  phases: BurnPhase[];
  seco1: number;
  seco2: number;
  separationT: number;
  targetC3: number;
  achievedC3: number | null;
  /** Δv que faltou ao lançador e foi fornecido pela sonda (m/s). */
  shortfallDeltaV: number;
  probePropellantUsed: number;
  /** Erro de injeção (km/s, eclíptica) somado à velocidade planejada. */
  injectionError: Vec3;
  antennaDamaged: boolean;
  /** Velocidade heliocêntrica real da sonda na partida (km/s). */
  departureVelocity: Vec3 | null;
}

/** Erro de injeção padrão (1σ por eixo, km/s) para um lançamento nominal e para um forçado. */
export const INJECTION_SIGMA = { nominal: 0.002, forced: 0.004, probeCompleted: 0.005 } as const;
export const PARKING_COAST_S = 25 * 60;

function burnTimeFor(phase: BurnPhase, dv: number) {
  const flow = (phase.m0 - phase.mf) / phase.duration;
  return (phase.m0 / flow) * (1 - Math.exp(-dv / (phase.isp * G0)));
}

export function simulateLaunch(plan: MissionPlan, options: { forced: boolean; seed: number }): LaunchResult {
  const { forced, seed } = options;
  const perf = plan.performance;
  const events: LaunchEvent[] = [];
  const ev = (t: number, kind: LaunchEvent['kind'], label: string, ok = true) => events.push({ t, kind, label, ok });
  const targetC3 = plan.transfer.ok ? plan.transfer.c3 : 0;
  const base: LaunchResult = {
    forced, outcome: 'falha', failure: null, events, phases: perf.phases, seco1: 0, seco2: 0, separationT: 0,
    targetC3, achievedC3: null, shortfallDeltaV: 0, probePropellantUsed: 0, injectionError: [0, 0, 0], antennaDamaged: false, departureVelocity: null,
  };
  const fail = (t: number, reason: string): LaunchResult => {
    ev(t, 'falha', reason, false);
    return { ...base, outcome: 'falha', failure: { t, reason } };
  };

  if (!plan.goForLaunch && !forced) throw new Error('Lançamento normal bloqueado: há itens NO-GO no checklist.');
  if (!plan.transfer.ok) return fail(0, 'Sem trajetória calculada não há alvo de injeção: a contagem é abortada.');

  ev(0, 'ignicao', 'Ignição dos motores');
  if (perf.liftoffTWR <= 1) return fail(3, `Empuxo de ${Math.round(perf.liftoffThrust)} kN não vence o peso (TWR ${perf.liftoffTWR.toFixed(2)}): os motores são desligados na plataforma.`);
  ev(1, 'decolagem', `Decolagem com TWR ${perf.liftoffTWR.toFixed(2)}`);

  const issues = new Set(plan.vehicle.issues.filter((i) => i.severity === 'erro').map((i) => i.code));
  if (issues.has('booster-familia') || issues.has('booster-quantidade')) return fail(8, 'Propulsores laterais sem fixação qualificada geram cargas assimétricas: o veículo perde o controle.');
  if (issues.has('coifa-solidos')) return fail(62, 'Cargas estruturais acima do qualificado perto da pressão dinâmica máxima: falha estrutural.');

  let t = 0;
  for (let k = 0; k < perf.phases.length; k++) {
    const phase = perf.phases[k];
    t = phase.start + phase.duration;
    if (phase.id === 'boosters') ev(t, 'separacao-boosters', 'Esgotamento e separação dos propulsores laterais');
    if (phase.id === 'superior') break;
    const next = perf.phases[k + 1];
    if (next?.id === 'superior') {
      ev(t, 'meco', 'Corte do motor principal (MECO)');
      if (issues.has('interface-estagio')) return fail(t + 3, 'Interestágio incompatível: o estágio superior não se separa do núcleo.');
      ev(t + 3, 'separacao-estagio', 'Separação do primeiro estágio');
      ev(t + 10, 'ignicao-superior', `Ignição do ${plan.vehicle.upper.name}`);
      if (issues.has('coifa-diametro') || issues.has('coifa-familia')) return fail(t + 18, 'A coifa não se separa: a massa extra impede o veículo de atingir a órbita.');
      ev(t + 18, 'coifa', 'Separação da coifa');
      if (plan.probe.envelope > plan.vehicle.fairing.innerDiameter) {
        base.antennaDamaged = true;
        ev(t + 18, 'dano', 'A antena de alto ganho foi danificada pelo contato com a coifa: a sonda terá só a antena de baixo ganho.', false);
      }
    }
  }

  const upper = perf.phases[perf.phases.length - 1];
  const upperStart = upper.start + 10;
  const before = perf.phases.slice(0, -1).reduce((s, p) => s + p.deltaV, 0);
  const upperForLeo = perf.leoRequirement - before;
  if (upperForLeo > upper.deltaV) {
    return fail(upperStart + upper.duration, 'O estágio superior esgota o propelente antes de atingir a órbita: o veículo reentra na atmosfera.');
  }
  const seco1 = upperStart + Math.max(0, burnTimeFor(upper, Math.max(0, upperForLeo)));
  ev(seco1, 'seco-1', 'Corte do estágio superior: órbita de estacionamento a 200 km');
  ev(seco1 + 1, 'estacionamento', `Costeio de ${PARKING_COAST_S / 60} min até o ponto de injeção`);
  const restart = seco1 + PARKING_COAST_S;
  ev(restart, 'reignicao', 'Reignição para a injeção interplanetária');

  const remaining = upper.deltaV - Math.max(0, upperForLeo);
  const needed = departureDeltaV(targetC3);
  const burnUsed = Math.min(remaining, needed);
  const mAfterLeo = upper.m0 * Math.exp(-Math.max(0, upperForLeo) / (upper.isp * G0));
  const flow = (upper.m0 - upper.mf) / upper.duration;
  const seco2 = restart + (mAfterLeo / flow) * (1 - Math.exp(-burnUsed / (upper.isp * G0)));
  const achievedByLauncher = c3FromDeparture(burnUsed);
  const shortfall = Math.max(0, needed - remaining);
  ev(seco2, 'seco-2', shortfall > 0 ? `Estágio superior esgotado com C3 ${achievedByLauncher.toFixed(2)} km²/s² (alvo ${targetC3.toFixed(2)})` : `Injeção concluída: C3 ${targetC3.toFixed(2)} km²/s²`, shortfall === 0);
  const separationT = seco2 + 300;
  ev(separationT, 'separacao-sonda', 'Separação da sonda');

  const rng = createRng(subSeed(seed, 'injecao'));
  let sigma: number = forced ? INJECTION_SIGMA.forced : INJECTION_SIGMA.nominal;
  let probePropellantUsed = 0;
  let outcome: LaunchOutcome = 'nominal';
  if (shortfall > 0) {
    if (plan.probe.deltaV < shortfall) {
      return { ...fail(separationT + 60, `Faltaram ${Math.round(shortfall)} m/s e a sonda só tem ${Math.round(plan.probe.deltaV)} m/s: a trajetória não alcança Marte.`), seco1, seco2, separationT, achievedC3: achievedByLauncher, shortfallDeltaV: shortfall };
    }
    probePropellantUsed = propellantFor(shortfall, plan.probe.wetMass, plan.probe.isp);
    ev(separationT + 60, 'propulsao-sonda', `A sonda completa a injeção com a própria propulsão: ${Math.round(shortfall)} m/s e ${Math.round(probePropellantUsed)} kg de propelente.`, false);
    sigma = INJECTION_SIGMA.probeCompleted;
    outcome = 'subdesempenho';
  }
  if (forced && outcome === 'nominal') outcome = base.antennaDamaged ? 'subdesempenho' : 'nominal';
  if (base.antennaDamaged) outcome = 'subdesempenho';
  const injectionError: Vec3 = [gaussian(rng) * sigma, gaussian(rng) * sigma, gaussian(rng) * sigma];
  return {
    ...base, outcome, seco1, seco2, separationT, achievedC3: targetC3, shortfallDeltaV: shortfall, probePropellantUsed,
    injectionError, departureVelocity: add(plan.transfer.departureState.v, injectionError),
  };
}

export interface LaunchTelemetry {
  altitudeKm: number;
  /** Velocidade inercial aproximada (m/s). */
  speed: number;
  phaseLabel: string;
  /** Fração de propelente restante por fase de queima (0–1). */
  propellant: number[];
  /** Índice do estágio ativo (0 núcleo/propulsores, 1 superior, 2 sonda separada). */
  stage: number;
  boostersAttached: boolean;
  fairingAttached: boolean;
  engineOn: boolean;
  failed: boolean;
}

/** Telemetria no instante t (s). A velocidade vem do Δv acumulado menos as perdas rateadas no tempo;
 * o perfil de altitude é ilustrativo (o modelo não integra a trajetória de subida). */
export function launchTelemetry(result: LaunchResult, perf: { phases: BurnPhase[]; rotationBonus: number; gravityLoss: number; dragLoss: number; steeringLoss: number }, t: number): LaunchTelemetry {
  const failedAt = result.failure?.t ?? Infinity;
  const tt = Math.min(t, failedAt);
  const has = (kind: LaunchEvent['kind']) => result.events.some((e) => e.kind === kind && e.t <= tt);
  const upperStart = (perf.phases.at(-1)?.start ?? 0) + 10;
  let ideal = 0;
  let losses = 0;
  const propellant: number[] = [];
  for (const p of perf.phases) {
    const start = p.id === 'superior' ? upperStart : p.start;
    let burned = 0;
    if (p.id === 'superior') {
      const leoPart = result.seco1 > start ? Math.min(tt, result.seco1) - start : 0;
      const tliPart = tt > result.seco1 + PARKING_COAST_S ? Math.min(tt, result.seco2) - (result.seco1 + PARKING_COAST_S) : 0;
      burned = Math.max(0, leoPart) + Math.max(0, tliPart);
      if (!result.seco1) burned = Math.max(0, Math.min(tt - start, p.duration));
    } else burned = Math.max(0, Math.min(tt - start, p.duration));
    const flow = (p.m0 - p.mf) / p.duration;
    const m = p.m0 - flow * burned;
    ideal += burned > 0 ? p.isp * G0 * Math.log(p.m0 / m) : 0;
    losses += p.gravityLoss * Math.min(1, burned / p.duration);
    propellant.push(1 - burned / p.duration);
  }
  const atmo = perf.phases[0]?.duration ?? 1;
  losses += (perf.dragLoss + perf.steeringLoss) * Math.min(1, tt / atmo);
  const speed = Math.max(perf.rotationBonus, perf.rotationBonus + ideal - losses);
  const seco1 = result.seco1 || (perf.phases.at(-1)!.start + perf.phases.at(-1)!.duration);
  let altitudeKm = tt <= 0 ? 0 : tt < seco1 ? 200 * Math.sin((Math.PI / 2) * (tt / seco1)) ** 1.5 : 200;
  if (result.seco2 && tt > result.seco2) altitudeKm = 200 + (speed / 1000) * (tt - result.seco2) * 0.6;
  if (t > failedAt) altitudeKm = Math.max(0, altitudeKm - 0.5 * 0.00981 * (t - failedAt) ** 2);
  const phase = [...result.events].reverse().find((e) => e.t <= tt);
  return {
    altitudeKm,
    speed,
    phaseLabel: phase?.label ?? 'Contagem regressiva',
    propellant,
    stage: has('separacao-sonda') ? 2 : has('separacao-estagio') ? 1 : 0,
    boostersAttached: !has('separacao-boosters'),
    fairingAttached: !has('coifa'),
    engineOn: tt > 0 && tt < failedAt && !(tt > result.seco1 && tt < result.seco1 + PARKING_COAST_S && result.seco1 > 0) && !(result.seco2 > 0 && tt > result.seco2) && !(has('meco') && !has('ignicao-superior')),
    failed: t >= failedAt,
  };
}

import { describe, expect, it } from 'vitest';
import { AU_KM, MU, RADIUS, isoToJd } from '../../domain/units';
import { standishEphemeris } from '../orbital/ephemeris';
import { createMissionState, planOf } from '../../state/mission';
import { simulateLaunch } from './launch';
import { linkBudget, LINK } from './comms';
import { captureDeltaV, impactParameterFor, periapsisFromB, plannedCaptureDeltaV } from './capture';
import { computeBudget, BUDGET_LIMIT } from './budget';
import { assessExposure, damageProbability, generateSolarEvents } from './solar';
import { propagate } from '../orbital/kepler';
import { energyBalance, runTurn, startOperations, TOTAL_TURNS, OBJECTIVES, objectivesStatus } from './marsOps';
import { DEFAULT_PROBE } from '../../data/probe';
import { earthMarsGeometry } from './geometry';
import { createRng, subSeed } from './rng';
import { powerGeneration, solarIrradiance } from './power';
import type { MissionPlan } from './plan';
import { departureDeltaV } from '../rocket/performance';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} ≈ ${b} ± ${tol}`).toBeLessThanOrEqual(tol);
const basePlan = () => planOf(createMissionState());

describe('lançamento', () => {
  it('nominal: eventos em ordem e C3 atingida', () => {
    const r = simulateLaunch(basePlan(), { forced: false, seed: 1 });
    expect(r.outcome).toBe('nominal');
    const ts = r.events.map((e) => e.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(r.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['decolagem', 'meco', 'coifa', 'seco-1', 'reignicao', 'seco-2', 'separacao-sonda']));
    expect(r.shortfallDeltaV).toBe(0);
    expect(Math.hypot(...r.injectionError)).toBeLessThan(0.02);
  });
  it('lançamento normal com NO-GO é recusado', () => {
    const plan = { ...basePlan(), goForLaunch: false };
    expect(() => simulateLaunch(plan, { forced: false, seed: 1 })).toThrow();
  });
  it('TWR ≤ 1 falha na plataforma', () => {
    const p = basePlan();
    const plan: MissionPlan = { ...p, performance: { ...p.performance, liftoffTWR: 0.95 } };
    const r = simulateLaunch(plan, { forced: true, seed: 1 });
    expect(r.outcome).toBe('falha');
    expect(r.failure?.reason).toMatch(/TWR/);
  });
  it('déficit pequeno é completado pela sonda; sem Δv na sonda, falha', () => {
    const p = basePlan();
    const needed = departureDeltaV(p.transfer.ok ? p.transfer.c3 : 0);
    // Tira do estágio superior a sobra de Δv e mais 100 m/s: o lançador termina 100 m/s abaixo do alvo.
    const cut = p.performance.departureDeltaVAvailable - needed + 100;
    const short: MissionPlan = { ...p, performance: { ...p.performance, phases: p.performance.phases.map((ph, i, a) => (i === a.length - 1 ? { ...ph, deltaV: ph.deltaV - cut } : ph)) } };
    const r = simulateLaunch(short, { forced: true, seed: 1 });
    expect(r.outcome).toBe('subdesempenho');
    near(r.shortfallDeltaV, 100, 1);
    expect(r.probePropellantUsed).toBeGreaterThan(0);
    const weakProbe: MissionPlan = { ...short, probe: { ...short.probe, deltaV: 50 } };
    expect(simulateLaunch(weakProbe, { forced: true, seed: 1 }).outcome).toBe('falha');
  });
  it('antena maior que a coifa é danificada', () => {
    const p = basePlan();
    const plan: MissionPlan = { ...p, probe: { ...p.probe, envelope: 10 } };
    const r = simulateLaunch(plan, { forced: false, seed: 1 });
    expect(r.antennaDamaged).toBe(true);
    expect(r.outcome).toBe('subdesempenho');
  });
});

describe('captura em Marte', () => {
  it('B → periapse é inversa de periapse → B', () => {
    for (const rp of [RADIUS.mars + 300, RADIUS.mars + 400]) near(periapsisFromB(impactParameterFor(rp, 2.7), 2.7), rp, 1e-6);
  });
  it('circular baixa custa mais que a elíptica', () => {
    expect(plannedCaptureDeltaV(2.7, 'circular')).toBeGreaterThan(2 * plannedCaptureDeltaV(2.7, 'eliptica') * 0.9);
  });
  it('Δv de captura cresce com v∞', () => {
    expect(captureDeltaV(3, RADIUS.mars + 300, RADIUS.mars + 33000)).toBeGreaterThan(captureDeltaV(2.5, RADIUS.mars + 300, RADIUS.mars + 33000));
    near(captureDeltaV(0, RADIUS.mars + 300, Infinity), 0, 1e-6);
  });
  it('MU de Marte coerente', () => expect(MU.mars).toBeCloseTo(42828.37, 1));
});

describe('comunicação e conjunção', () => {
  it('a taxa cai com o quadrado da distância', () => {
    const a = linkBudget('hga-3', 'twta', 1e8);
    const b = linkBudget('hga-3', 'twta', 2e8);
    if (a.rateNoConjunction < LINK.maxRate) near(a.rateNoConjunction / b.rateNoConjunction, 4, 0.01);
    expect(b.oneWayLightTime).toBeCloseTo(2e8 / 299792.458, 3);
  });
  it('antena de alto ganho supera a de baixo ganho', () => {
    expect(linkBudget('hga-3', 'twta', 3e8).rate).toBeGreaterThan(100 * linkBudget('lga', 'twta', 3e8).rate);
  });
  it('conjunção: sem enlace abaixo de 2°, degradado abaixo de 5°', () => {
    expect(linkBudget('hga-3', 'twta', 3.5e8, 1).state).toBe('indisponivel');
    expect(linkBudget('hga-3', 'twta', 3.5e8, 1).rate).toBe(0);
    expect(linkBudget('hga-3', 'twta', 3.5e8, 3.5).state).toBe('degradado');
    expect(linkBudget('hga-3', 'twta', 3.5e8, 30).state).toBe('ok');
  });
  it('antena danificada usa só a de baixo ganho', () => {
    expect(linkBudget('hga-3', 'twta', 3e8, 90, true).rate).toBeLessThan(linkBudget('hga-3', 'twta', 3e8, 90).rate);
  });
  it('rejeita distância inválida e peça inexistente', () => {
    expect(() => linkBudget('hga-3', 'twta', 0)).toThrow();
    expect(() => linkBudget('x', 'twta', 1e8)).toThrow();
  });
});

describe('energia', () => {
  it('irradiância cai com 1/r²', () => near(solarIrradiance(1.5), 1361 / 2.25, 1e-9));
  it('RTG não depende da distância; solar sim', () => {
    expect(powerGeneration('rtg', 1)).toBe(powerGeneration('rtg', 1.6));
    expect(powerGeneration('solar-20', 1.6)).toBeLessThan(powerGeneration('solar-20', 1));
  });
});

describe('orçamento (fictício e didático)', () => {
  it('soma as linhas e marca o tipo', () => {
    const plan = basePlan();
    const b = computeBudget(plan.vehicle, plan.probe, 293, [{ id: 'x', label: 'Extra', value: 10 }]);
    near(b.total, b.lines.reduce((s, l) => s + l.value, 0), 1e-9);
    expect(b.limit).toBe(BUDGET_LIMIT);
    expect(b.kind).toBe('ficticio-didatico');
    expect(b.total).toBeGreaterThan(plan.budget.total);
  });
});

describe('eventos solares (cenários de treinamento)', () => {
  const launch = isoToJd('2026-10-31');
  const sc = { r: [AU_KM, 0, 0] as const, v: [0, 32.5, 0] as const };
  const probeAt = (jd: number) => propagate(sc, (jd - launch) * 86400, MU.sun);
  it('são determinísticos e rotulados como treinamento', () => {
    const a = generateSolarEvents(5, launch, launch + 293, probeAt);
    expect(generateSolarEvents(5, launch, launch + 293, probeAt)).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(4);
    for (const e of a) expect(e.scenario).toBe('treinamento');
  });
  it('CME apontada para a sonda a expõe; oposta, não', () => {
    const lon = (jd: number) => (Math.atan2(probeAt(jd).r[1], probeAt(jd).r[0]) * 180) / Math.PI;
    const jd = launch + 50;
    const hit = assessExposure({ id: 'a', detectJd: jd, speedKmS: 1000, lonDeg: lon(jd + 1.7), halfWidthDeg: 30, scenario: 'treinamento' }, probeAt);
    expect(hit.exposed).toBe(true);
    const miss = assessExposure({ id: 'b', detectJd: jd, speedKmS: 1000, lonDeg: lon(jd) + 180, halfWidthDeg: 30, scenario: 'treinamento' }, probeAt);
    expect(miss.exposed).toBe(false);
  });
  it('proteção zera o risco; blindagem reduz', () => {
    expect(damageProbability(1500, false, 'protecao')).toBe(0);
    expect(damageProbability(1500, true, 'manter')).toBeLessThan(damageProbability(1500, false, 'manter'));
  });
});

describe('operações em Marte', () => {
  const jd = isoToJd('2027-08-20');
  const ops0 = startOperations({ jd, orbit: 'eliptica', periAltKm: 300, degraded: {}, antennaDamaged: false, seed: 3 });
  const plan = { active: [...DEFAULT_PROBE.instruments], dsnHoursPerDay: 8 };
  it('8 turnos terminam as operações e acumulam ciência', () => {
    let ops = ops0;
    for (let i = 0; i < TOTAL_TURNS; i++) ops = runTurn(ops, DEFAULT_PROBE, standishEphemeris, plan);
    expect(ops.done).toBe(true);
    expect(ops.history).toHaveLength(TOTAL_TURNS);
    expect(ops.deliveredGbit).toBeGreaterThan(0);
    expect(() => runTurn(ops, DEFAULT_PROBE, standishEphemeris, plan)).toThrow();
    expect(ops.history.some((h) => h.dustStorm)).toBe(true);
    expect(objectivesStatus(ops.science)).toHaveLength(OBJECTIVES.length);
  });
  it('mais horas de DSN entregam mais dados e custam mais', () => {
    const a = runTurn(ops0, DEFAULT_PROBE, standishEphemeris, { ...plan, dsnHoursPerDay: 4 });
    const b = runTurn(ops0, DEFAULT_PROBE, standishEphemeris, { ...plan, dsnHoursPerDay: 12 });
    expect(b.history[0].downlinkCapacityGbit).toBeGreaterThan(a.history[0].downlinkCapacityGbit);
    expect(b.dsnCost).toBeGreaterThan(a.dsnCost);
  });
  it('sem energia, instrumentos de menor prioridade são desligados', () => {
    const weak = { ...DEFAULT_PROBE, powerId: 'solar-10', instruments: ['hirescam', 'radar', 'spectrometer'] };
    const e = energyBalance(weak, 'circular', 1.6, { active: weak.instruments, dsnHoursPerDay: 12 }, true);
    expect(e.shed.length).toBeGreaterThan(0);
    expect(e.ran.length + e.shed.length).toBe(3);
  });
  it('a geometria Terra–Marte mostra distância crescente perto da conjunção', () => {
    const g1 = earthMarsGeometry(standishEphemeris, isoToJd('2027-09-01'));
    const g2 = earthMarsGeometry(standishEphemeris, isoToJd('2028-03-21'));
    expect(g2.distanceKm).toBeGreaterThan(g1.distanceKm);
    expect(g2.sepDeg).toBeLessThan(5);
  });
});

describe('gerador pseudoaleatório', () => {
  it('é reprodutível e uniforme em [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    near(xs.reduce((s, x) => s + x, 0) / 1000, 0.5, 0.05);
    expect(subSeed(1, 'a')).not.toBe(subSeed(1, 'b'));
  });
});

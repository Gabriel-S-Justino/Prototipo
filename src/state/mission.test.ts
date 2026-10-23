import { describe, expect, it } from 'vitest';
import { createMissionState, missionReducer, planOf, reachablePhases, type MissionAction, type MissionState } from './mission';
import { isoToJd } from '../domain/units';

const run = (s: MissionState, ...actions: MissionAction[]) => actions.reduce(missionReducer, s);

/** Conduz uma missão até o relatório com decisões fixas (executa TCMs, protege a sonda em eventos solares). */
export function flyMission(start: MissionState, opts: { executeTcms?: boolean; solar?: 'manter' | 'protecao' | 'replanejar' } = {}) {
  let s = run(start, { type: 'lancar', forced: false }, { type: 'iniciar-cruzeiro' });
  let guard = 0;
  while (s.cruise && !s.capture && !s.report && guard++ < 500) {
    const p = s.cruise.pending;
    if (!p) s = run(s, { type: 'avancar', days: 5 });
    else if (p.kind === 'tcm') s = run(s, { type: 'tcm', id: p.id, execute: opts.executeTcms ?? true });
    else if (p.kind === 'solar') s = run(s, { type: 'resposta-solar', id: p.id, response: opts.solar ?? 'protecao' });
    else s = run(s, { type: 'captura' });
  }
  while (s.ops && !s.report && guard++ < 600) s = run(s, { type: 'turno' });
  return s;
}

describe('estado da missão (fonte única de verdade)', () => {
  it('estado inicial: Atlas V 401, 31/10/2026, 293 dias e checklist liberado', () => {
    const s = createMissionState();
    expect(s.selection.departureJd).toBe(isoToJd('2026-10-31'));
    const plan = planOf(s);
    expect(plan.transfer.ok).toBe(true);
    expect(plan.goForLaunch).toBe(true);
    expect(plan.massMargin).toBeGreaterThan(0);
  });

  it('mudar a data recalcula C3, capacidade e checklist no mesmo plano', () => {
    const s0 = createMissionState();
    const s1 = run(s0, { type: 'trajetoria', selection: { departureJd: isoToJd('2027-03-01'), tofDays: 250 } });
    const a = planOf(s0);
    const b = planOf(s1);
    expect(b.transfer.ok && a.transfer.ok && b.transfer.c3 > a.transfer.c3 + 5).toBe(true);
    expect(b.capacity).toBeLessThan(a.capacity);
    expect(b.arrivalJd).toBe(isoToJd('2027-03-01') + 250);
  });

  it('peças incompatíveis geram NO-GO e bloqueiam o lançamento normal', () => {
    const s = run(createMissionState(), { type: 'veiculo', patch: { upperId: 'falcon-s2', upperEngineId: 'merlin-1d-vac' } });
    const plan = planOf(s);
    expect(plan.checklist.find((c) => c.id === 'compatibilidade')?.status).toBe('NO-GO');
    const after = run(s, { type: 'lancar', forced: false });
    expect(after.launch).toBeNull();
    expect(after.notice).toMatch(/NO-GO/);
  });

  it('lançamento forçado com interestágio incompatível falha e gera relatório de falha', () => {
    let s = run(createMissionState(), { type: 'veiculo', patch: { upperId: 'falcon-s2', upperEngineId: 'merlin-1d-vac' } }, { type: 'lancar', forced: true });
    expect(s.launch?.outcome).toBe('falha');
    expect(s.planSnapshot?.forced).toBe(true);
    s = run(s, { type: 'iniciar-cruzeiro' });
    expect(s.report?.outcome).toBe('falha');
    expect(reachablePhases(s)).toEqual(['relatorio']);
  });

  it('projeto fica travado depois do lançamento', () => {
    const s = run(createMissionState(), { type: 'lancar', forced: false });
    const t = run(s, { type: 'preset', id: 'falcon-heavy' });
    expect(t.design).toBe(s.design);
  });

  it('navegação respeita as fases disponíveis', () => {
    const s = run(createMissionState(), { type: 'ir', phase: 'cruzeiro' });
    expect(s.phase).toBe('centro');
    expect(s.notice).toBeTruthy();
    expect(run(s, { type: 'ir', phase: 'hangar' }).phase).toBe('hangar');
  });

  it('instrumentos entram e saem do plano de operações', () => {
    const s = run(createMissionState(), { type: 'instrumento', id: 'radar' });
    expect(s.design.probe.instruments).toContain('radar');
    expect(s.turnPlan.active).toContain('radar');
    expect(run(s, { type: 'instrumento', id: 'radar' }).design.probe.instruments).not.toContain('radar');
  });

  it('missão nominal completa: cruzeiro, captura, 8 turnos e relatório', () => {
    const s = flyMission(createMissionState());
    expect(s.capture?.ok, s.capture?.reason).toBe(true);
    expect(s.ops?.history.length).toBe(8);
    expect(s.report).not.toBeNull();
    expect(s.report!.outcome).not.toBe('falha');
    expect(s.report!.ops!.deliveredGbit).toBeGreaterThan(0);
    expect(s.report!.tcms.some((t) => t.status === 'executada')).toBe(true);
    expect(s.report!.budget.kind).toBe('ficticio-didatico');
    expect(s.log.length).toBeGreaterThan(10);
  }, 60_000);

  it('é determinística para a mesma semente', () => {
    const a = flyMission(createMissionState(7));
    const b = flyMission(createMissionState(7));
    expect(a.report!.ops!.deliveredGbit).toBe(b.report!.ops!.deliveredGbit);
    expect(a.report!.totalTcmDeltaV).toBe(b.report!.totalTcmDeltaV);
  }, 60_000);

  it('sem nenhuma TCM a sonda não é capturada', () => {
    const s = flyMission(createMissionState(), { executeTcms: false });
    expect(s.capture?.ok).toBe(false);
    expect(s.report?.outcome).toBe('falha');
  }, 60_000);

  it('reiniciar cria um estado novo com outra semente', () => {
    const s = run(createMissionState(1), { type: 'lancar', forced: false }, { type: 'reiniciar' });
    expect(s.launch).toBeNull();
    expect(s.seed).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../data/launchers';
import { assembleVehicle, hasBlockingIssue } from './vehicle';
import { achievableC3, c3FromDeparture, departureDeltaV, parkingInclinationFor, payloadCapacity, rocketEquation, vehiclePerformance } from './performance';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} ≈ ${b} ± ${tol}`).toBeLessThanOrEqual(tol);
const preset = (id: string) => assembleVehicle(PRESETS[id].config);

describe('equação de Tsiolkovsky e injeção', () => {
  it('Δv = Isp·g0·ln(m0/mf)', () => near(rocketEquation(300, 1000, 368), 300 * 9.80665 * Math.log(1000 / 368), 1e-9));
  it('recusa massas inválidas', () => expect(() => rocketEquation(300, 100, 200)).toThrow());
  it('C3 ↔ Δv de partida são inversas', () => {
    for (const c3 of [0, 9, 16.4, 30]) near(c3FromDeparture(departureDeltaV(c3)), c3, 1e-9);
    near(departureDeltaV(0), 3229, 5); // escape a partir de 200 km
  });
  it('inclinação de estacionamento ≥ latitude do Cabo e ≥ |DLA|', () => {
    expect(parkingInclinationFor(5)).toBe(28.5);
    expect(parkingInclinationFor(-40)).toBe(40);
    expect(parkingInclinationFor(80)).toBe(57);
  });
});

describe('veículos de referência', () => {
  it('nenhum preset tem incompatibilidades', () => {
    for (const id of Object.keys(PRESETS)) expect(preset(id).issues, id).toEqual([]);
  });
  it('TWR de decolagem entre 1,1 e 1,8', () => {
    for (const id of Object.keys(PRESETS)) {
      const twr = vehiclePerformance(preset(id), 2000).liftoffTWR;
      expect(twr, id).toBeGreaterThan(1.1);
      expect(twr, id).toBeLessThan(1.8);
    }
  });
  it('capacidade cai com a C3', () => {
    for (const id of Object.keys(PRESETS)) {
      const v = preset(id);
      const caps = [0, 9, 16, 25].map((c3) => payloadCapacity(v, c3));
      for (let i = 1; i < caps.length; i++) expect(caps[i], id).toBeLessThan(caps[i - 1]);
    }
  });
  // Limites inferiores a partir de missões reais (massa lançada ≤ capacidade real do veículo naquela C3).
  it('Atlas V 401 leva a MRO (2180 kg, C3 ≈ 16,4)', () => expect(payloadCapacity(preset('atlas-401'), 16.4)).toBeGreaterThan(2180));
  it('Atlas V 401 leva a InSight (694 kg, C3 ≈ 8,2) com folga', () => expect(payloadCapacity(preset('atlas-401'), 8.2)).toBeGreaterThan(2000));
  it('Atlas V 541 leva a Perseverance (≈ 4050 kg, C3 ≈ 14,5)', () => expect(payloadCapacity(preset('atlas-541'), 14.5)).toBeGreaterThan(4050));
  it('ordem de desempenho: 401 < 541 < Vulcan < Falcon Heavy', () => {
    const c = (id: string) => payloadCapacity(preset(id), 9);
    expect(c('atlas-401')).toBeLessThan(c('atlas-541'));
    expect(c('atlas-541')).toBeLessThan(c('vulcan-vc4'));
    expect(c('vulcan-vc4')).toBeLessThan(c('falcon-heavy'));
  });
  it('fases de queima somam o Δv ideal e as perdas ficam explícitas', () => {
    const p = vehiclePerformance(preset('atlas-541'), 4000, 20);
    near(p.phases.reduce((s, x) => s + x.deltaV, 0), p.idealDeltaV, 1e-6);
    expect(p.gravityLoss).toBeGreaterThan(0);
    expect(p.dragLoss).toBe(150);
    near(p.rotationBonus, 465.1 * Math.cos(28.5 * Math.PI / 180), 0.1);
    const c3 = achievableC3(preset('atlas-541'), 4000, 20);
    expect(c3).not.toBeNull();
    near(c3!, c3FromDeparture(p.departureDeltaVAvailable), 1e-6);
  });
  it('carga impossível não atinge C3', () => expect(achievableC3(preset('atlas-401'), 20000)).toBeNull());
});

describe('compatibilidade no hangar', () => {
  const base = PRESETS['atlas-401'].config;
  const codes = (patch: Partial<typeof base>) => assembleVehicle({ ...base, ...patch }).issues.map((i) => i.code);
  it('estágio superior de outra família', () => expect(codes({ upperId: 'falcon-s2', upperEngineId: 'merlin-1d-vac' })).toContain('interface-estagio'));
  it('motor que o estágio não aceita', () => expect(codes({ upperEngineId: 'merlin-1d-vac' })).toContain('motor-incompativel'));
  it('quantidade de motores inválida', () => expect(codes({ upperEngineCount: 3 })).toContain('quantidade-motores'));
  it('propulsor de outra família', () => expect(codes({ boosterId: 'falcon-side', boosterCount: 2 })).toContain('booster-familia'));
  it('sólidos demais para a coifa de 4 m', () => expect(codes({ boosterId: 'aj-60a', boosterCount: 4 })).toContain('coifa-solidos'));
  it('coifa de outra família', () => expect(codes({ fairingId: 'falcon-5m' })).toContain('coifa-familia'));
  it('carregamento fora de 50–100% bloqueia; parcial só avisa', () => {
    expect(codes({ coreLoad: 0.3 })).toContain('carga-propelente');
    const partial = assembleVehicle({ ...base, upperLoad: 0.8 });
    expect(partial.issues.map((i) => i.code)).toEqual(['propelente-reduzido']);
    expect(hasBlockingIssue(partial)).toBe(false);
    expect(partial.grossMass).toBeLessThan(preset('atlas-401').grossMass);
  });
  it('peça inexistente lança erro', () => expect(() => assembleVehicle({ ...base, coreId: 'x' })).toThrow());
  it('custo cresce com propulsores', () => expect(preset('atlas-541').cost).toBeGreaterThan(preset('atlas-401').cost));
});

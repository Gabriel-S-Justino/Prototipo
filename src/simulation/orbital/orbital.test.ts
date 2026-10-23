import { describe, expect, it } from 'vitest';
import { AU_KM, DAY_S, MU, RADIUS, isoToJd } from '../../domain/units';
import { solveLambert } from './lambert';
import { elementsToState, propagate, solveKepler, stateToElements } from './kepler';
import { standishEphemeris, hermite, tableEphemeris, EphemerisRangeError, eclipticToEquatorial } from './ephemeris';
import { computeTransfer, bestTofForDeparture } from './transfer';
import { computePorkchop, validateParams, cacheKey } from './porkchop';
import { captureBurn, circularSpeed, escapeBurn, hohmann, hohmannEarthMars, idealPhaseAngle, period, AU_M, A_MARS_AU, MU_EARTH_SI, MU_MARS_SI, MU_SUN_SI } from './hohmann';
import { norm, sub, type StateVector } from './vector';
import { findConjunction } from '../mission/geometry';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} ≈ ${b} ± ${tol}`).toBeLessThanOrEqual(tol);

describe('referências do projeto original (Hohmann, SI)', () => {
  const rLeo = RADIUS.earth * 1000 + 200e3;
  const t = hohmann(MU_SUN_SI, AU_M, A_MARS_AU * AU_M);
  // O original usava raio terrestre médio (6371 km → 7788 m/s); aqui o raio equatorial WGS-84 (6378,137 km).
  it('velocidade em LEO ≈ 7784 m/s', () => near(circularSpeed(MU_EARTH_SI, rLeo), 7784, 1));
  it('período da Terra ≈ 365,25 dias', () => near(period(MU_SUN_SI, AU_M) / 86400, 365.25, 0.1));
  it('Hohmann Terra→Marte ≈ 258,9 dias', () => near(t.time / 86400, 258.9, 0.5));
  it('queima de partida da LEO ≈ 3613 m/s', () => near(escapeBurn(MU_EARTH_SI, rLeo, t.dv1), 3613, 2));
  it('captura elíptica 300 × 33 000 km ≈ 907 m/s', () => {
    const rp = RADIUS.mars * 1000 + 300e3;
    const ra = RADIUS.mars * 1000 + 33_000e3;
    near(captureBurn(MU_MARS_SI, rp, ra, t.dv2), 907, 3);
  });
  it('ângulo de fase ideal ≈ 44,35°', () => near(idealPhaseAngle(), 44.35, 0.1));
  it('C3 de Hohmann ≈ 8,7 km²/s²', () => near(hohmannEarthMars().c3, 8.7, 0.2));
});

describe('Kepler', () => {
  it('converge para e = 0,9', () => {
    const E = solveKepler(0.3, 0.9);
    near(E - 0.9 * Math.sin(E), 0.3, 1e-10);
  });
  it('estado → elementos → estado (ida e volta)', () => {
    const s = { r: [1.2 * AU_KM, 0.3 * AU_KM, 0.01 * AU_KM] as const, v: [-4, 31, 0.5] as const };
    const back = elementsToState(stateToElements(s, MU.sun), MU.sun);
    expect(norm(sub(back.r, s.r))).toBeLessThan(1e-3);
    expect(norm(sub(back.v, s.v))).toBeLessThan(1e-9);
  });
  it('propagação universal volta ao início após um período', () => {
    const s = { r: [AU_KM, 0, 0] as const, v: [0, 30, 1] as const };
    const el = stateToElements(s, MU.sun);
    const T = 2 * Math.PI * Math.sqrt(el.a ** 3 / MU.sun);
    const after = propagate(s, T, MU.sun);
    expect(norm(sub(after.r, s.r))).toBeLessThan(1);
  });
  it('propaga hipérboles sem perder energia', () => {
    const s: StateVector = { r: [7000, 0, 0], v: [0, 12, 0] };
    const energy = (x: StateVector) => norm(x.v) ** 2 / 2 - MU.earth / norm(x.r);
    near(energy(propagate(s, 20 * 3600, MU.earth)), energy(s), 1e-8);
  });
});

describe('Lambert', () => {
  it('reproduz o exemplo 5.2 de Curtis', () => {
    const sol = solveLambert({ r1: [5000, 10000, 2100], r2: [-14600, 2500, 7000], tof: 3600, mu: 398600 });
    expect(sol.ok).toBe(true);
    if (!sol.ok) return;
    near(sol.v1[0], -5.9925, 1e-3); near(sol.v1[1], 1.9254, 1e-3); near(sol.v1[2], 3.2456, 1e-3);
    near(sol.v2[0], -3.3125, 1e-3); near(sol.v2[1], -4.1966, 1e-3); near(sol.v2[2], -0.38529, 1e-3);
  });
  it('a solução, propagada, chega em r2 no tempo pedido', () => {
    const r1 = [AU_KM, 0, 0] as const;
    const r2 = [-0.5 * AU_KM, 1.4 * AU_KM, 0.03 * AU_KM] as const;
    const tof = 230 * DAY_S;
    const sol = solveLambert({ r1, r2, tof, mu: MU.sun });
    expect(sol.ok).toBe(true);
    if (!sol.ok) return;
    const end = propagate({ r: r1, v: sol.v1 }, tof, MU.sun);
    expect(norm(sub(end.r, r2))).toBeLessThan(1);
    expect(norm(sub(end.v, sol.v2))).toBeLessThan(1e-6);
  });
  it('recusa tempo de voo inválido e geometria colinear', () => {
    expect(solveLambert({ r1: [1, 0, 0], r2: [0, 1, 0], tof: -1, mu: 1 }).ok).toBe(false);
    const col = solveLambert({ r1: [AU_KM, 0, 0], r2: [-1.5 * AU_KM, 0, 0], tof: 200 * DAY_S, mu: MU.sun });
    expect(col.ok).toBe(false);
    if (!col.ok) expect(col.reason).toBe('geometria-degenerada');
  });
});

describe('efemérides', () => {
  it('Terra a ~1 UA e Marte entre 1,38 e 1,67 UA', () => {
    for (let jd = isoToJd('2026-01-01'); jd < isoToJd('2030-01-01'); jd += 37) {
      near(norm(standishEphemeris.state('earth', jd).r) / AU_KM, 1, 0.02);
      const rm = norm(standishEphemeris.state('mars', jd).r) / AU_KM;
      expect(rm).toBeGreaterThan(1.37);
      expect(rm).toBeLessThan(1.68);
    }
  });
  it('periélio da Terra no início de janeiro de 2027', () => {
    let best = { jd: 0, r: Infinity };
    for (let jd = isoToJd('2026-12-01'); jd < isoToJd('2027-02-01'); jd += 0.5) {
      const r = norm(standishEphemeris.state('earth', jd).r);
      if (r < best.r) best = { jd, r };
    }
    near(best.jd, isoToJd('2027-01-03'), 3);
  });
  it('oposição de Marte em 19/02/2027 (distância mínima Terra–Marte em ±4 dias)', () => {
    let best = { jd: 0, d: Infinity };
    for (let jd = isoToJd('2027-01-01'); jd < isoToJd('2027-04-01'); jd += 0.5) {
      const d = norm(sub(standishEphemeris.state('mars', jd).r, standishEphemeris.state('earth', jd).r));
      if (d < best.d) best = { jd, d };
    }
    near(best.jd, isoToJd('2027-02-19'), 4);
  });
  it('conjunção solar de Marte em março de 2028', () => {
    const c = findConjunction(standishEphemeris, isoToJd('2027-10-01'), isoToJd('2028-08-01'));
    near(c.jd, isoToJd('2028-03-21'), 5);
    expect(c.sepDeg).toBeLessThan(2);
  });
  it('fora de 1800–2050 lança EphemerisRangeError', () => {
    expect(() => standishEphemeris.state('earth', isoToJd('2060-01-01'))).toThrow(EphemerisRangeError);
  });
  it('Hermite reproduz a efeméride analítica a partir de amostras diárias', () => {
    const t0 = isoToJd('2026-10-01');
    const samples = Array.from({ length: 20 }, (_, i) => ({ jd: t0 + i, ...standishEphemeris.state('earth', t0 + i) }));
    const jd = t0 + 7.37;
    const exact = standishEphemeris.state('earth', jd);
    const interp = hermite(samples, jd);
    expect(norm(sub(interp.r, exact.r))).toBeLessThan(5);
    const eph = tableEphemeris({ earth: samples, mars: samples }, '2026-10-23T00:00:00Z');
    expect(eph.kind).toBe('horizons');
    expect(() => eph.state('earth', t0 + 30)).toThrow(EphemerisRangeError);
  });
  it('eclíptica → equador preserva o módulo e gira em torno de x', () => {
    const v = eclipticToEquatorial([0, 0, 1]);
    near(norm(v), 1, 1e-12);
    near(v[0], 0, 1e-12);
    near(Math.acos(v[2]) * 180 / Math.PI, 23.439, 1e-3);
  });
});

describe('transferência Terra→Marte (validação de 2026)', () => {
  const dep = isoToJd('2026-10-31');
  it('31/10/2026 + 293 dias dá C3 ≈ 9,1 km²/s² (Standish)', () => {
    const t = computeTransfer(standishEphemeris, dep, 293);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    near(t.c3, 9.14, 0.3);
    expect(t.vInfArr).toBeGreaterThan(2);
    expect(t.vInfArr).toBeLessThan(4);
    expect(Math.abs(t.dlaDeg)).toBeLessThan(60);
  });
  it('a nave propagada passa perto de Marte na chegada', () => {
    const t = computeTransfer(standishEphemeris, dep, 293);
    if (!t.ok) throw new Error(t.reason);
    const end = propagate(t.departureState, 293 * DAY_S, MU.sun);
    expect(norm(sub(end.r, t.marsAtArrival.r))).toBeLessThan(10);
  });
  it('melhor tempo de voo para a data tem C3 menor ou igual', () => {
    const best = bestTofForDeparture(standishEphemeris, dep)!;
    expect(best.c3).toBeLessThanOrEqual(9.15);
  });
  it('fora do intervalo das efemérides devolve falha explicada', () => {
    const t = computeTransfer(standishEphemeris, isoToJd('2050-11-01'), 300);
    expect(t.ok).toBe(false);
  });
});

describe('porkchop', () => {
  const params = { depStartJd: isoToJd('2026-09-01'), depEndJd: isoToJd('2027-01-01'), tofMinDays: 150, tofMaxDays: 400, depSteps: 20, tofSteps: 20 };
  it('encontra o mínimo de C3 da janela de 2026 abaixo de 10 km²/s²', () => {
    const grid = computePorkchop(standishEphemeris, params);
    expect(grid.c3.length).toBe(400);
    expect(grid.valid + grid.invalid).toBe(400);
    expect(grid.best).not.toBeNull();
    expect(grid.best!.c3).toBeLessThan(10);
    expect(grid.best!.c3).toBeGreaterThan(7);
  });
  it('valida parâmetros e gera chaves de cache distintas', () => {
    expect(validateParams(params)).toBeNull();
    expect(validateParams({ ...params, tofMinDays: 500 })).not.toBeNull();
    expect(validateParams({ ...params, depSteps: 0 })).not.toBeNull();
    expect(cacheKey(params, 'a')).not.toBe(cacheKey({ ...params, depSteps: 21 }, 'a'));
    expect(cacheKey(params, 'a')).not.toBe(cacheKey(params, 'b'));
  });
});

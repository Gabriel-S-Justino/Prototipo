import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AU, DAY, MU_SUN, START_MS, secondsSinceJ2000 } from '../js/data/constants.js';
import { EARTH, MARS } from '../js/data/planets.js';
import {
  captureBurn, circularSpeed, closestApproach, escapeBurn, hohmann, idealPhaseAngle, length, period,
  phaseAngle, planetState, positionAt, solveKepler, stateToElements, sub, velocityAt,
} from '../js/physics/orbit.js';
import { near } from './fixtures.js';

const rLeo = EARTH.radius + 200e3;
const transfer = hohmann(MU_SUN, AU, MARS.a * AU);

test('velocidade orbital em LEO ≈ 7.788 m/s', () => near(circularSpeed(EARTH.mu, rLeo), 7788, 1));

test('período da Terra ≈ 365,25 dias', () => near(period(MU_SUN, AU) / DAY, 365.25, 0.1));

test('Hohmann Terra→Marte leva ≈ 259 dias', () => near(transfer.time / DAY, 258.9, 0.5));

test('queima de partida da LEO ≈ 3.613 m/s', () => near(escapeBurn(EARTH.mu, rLeo, transfer.dv1), 3613, 2));

test('captura elíptica em Marte ≈ 907 m/s', () => {
  const rp = MARS.radius + 300e3;
  const ra = MARS.radius + 33000e3;
  near(captureBurn(MARS.mu, rp, ra, transfer.dv2), 907, 2);
});

test('ângulo de fase ideal ≈ 44,3°', () => near(idealPhaseAngle(), 44.35, 0.1));

test('na data inicial o ângulo de fase é ≈ 60°', () => near(phaseAngle(secondsSinceJ2000(START_MS)), 60.07, 0.1));

test('Kepler converge para e = 0,9', () => {
  const E = solveKepler(0.3, 0.9);
  near(E - 0.9 * Math.sin(E), 0.3, 1e-10);
});

test('estado → elementos → estado (ida e volta)', () => {
  const t = 1e8;
  const r = [1.2 * AU, 0.3 * AU];
  const v = [-4000, 31000];
  const el = stateToElements(r, v, MU_SUN, t);
  assert.ok(length(sub(positionAt(el, t), r)) < 1000);
  assert.ok(length(sub(velocityAt(el, t), v)) < 0.01);
  const later = t + 50 * DAY;
  const back = stateToElements(positionAt(el, later), velocityAt(el, later), MU_SUN, later);
  near(back.a, el.a, 1000);
  near(back.e, el.e, 1e-9);
});

test('órbita circular da Terra volta ao início após um período', () => {
  const s = planetState(EARTH, 0);
  const el = stateToElements(s.r, s.v, MU_SUN, 0);
  assert.ok(el.e < 1e-6);
  assert.ok(length(sub(positionAt(el, el.a && period(MU_SUN, el.a)), s.r)) < 1000);
});

test('trajetória de Hohmann na janela encontra Marte', () => {
  const t0 = secondsSinceJ2000(START_MS);
  let t = t0;
  while (phaseAngle(t) > idealPhaseAngle()) t += 600;
  const earth = planetState(EARTH, t);
  const dir = scale(earth.v, 1 / length(earth.v));
  const el = stateToElements(earth.r, [earth.v[0] + dir[0] * transfer.dv1, earth.v[1] + dir[1] * transfer.dv1], MU_SUN, t);
  const best = closestApproach(el, MARS, t, t + 400 * DAY);
  assert.ok(best.dist < MARS.soi, `passou a ${best.dist / 1e9} milhões de km`);
  near((best.t - t) / DAY, 259, 3);
});

function scale(a, k) {
  return [a[0] * k, a[1] * k];
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRocket, burn, stageStats, totalDeltaV } from '../js/physics/rocket.js';
import { REFERENCE_DESIGN, near } from './fixtures.js';

const rocket = buildRocket(REFERENCE_DESIGN.stages, 0.835);

test('Δv por estágio do foguete de referência', () => {
  const stats = stageStats(rocket);
  near(stats[0].deltaV, 3269, 2);
  near(stats[1].deltaV, 4825, 2);
  near(stats[2].deltaV, 7689, 2);
  near(totalDeltaV(rocket), 15784, 3);
});

test('TWR na decolagem ≈ 1,55', () => near(stageStats(rocket)[0].twr, 1.55, 0.01));

test('com 2 motores principais o TWR cai para ≈ 1,05', () => {
  const weak = buildRocket([REFERENCE_DESIGN.stages[0].slice(0, 5), ...REFERENCE_DESIGN.stages.slice(1)], 0.835);
  near(stageStats(weak)[0].twr, 1.05, 0.01);
});

test('queimar atravessa estágios e conserva o Δv total', () => {
  const first = burn(rocket, 9400);
  assert.equal(first.missing, 0);
  assert.equal(first.dropped, 2);
  near(totalDeltaV(first.rocket), 15784 - 9400, 3);
  const rest = burn(first.rocket, 7000);
  assert.ok(rest.missing > 600);
  assert.equal(rest.rocket.stages.length, 0);
});

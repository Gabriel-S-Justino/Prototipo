import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHorizonsVectors } from '../api/horizons-utils.js';

test('interpreta vetores heliocêntricos CSV do JPL Horizons', () => {
  const payload = { result: 'header\n$$SOE\n2461327.500000000, A.D. 2026-Oct-23 00:00:00.0000, 1.000, 0.100, 0.000, -0.001, 0.017, 0.000\n$$EOE\nfooter' };
  assert.deepEqual(parseHorizonsVectors(payload), {
    jd: 2461327.5,
    timestamp: 'A.D. 2026-Oct-23 00:00:00.0000',
    positionAu: [1, 0.1, 0],
    velocityAuPerDay: [-0.001, 0.017, 0],
  });
});

test('falha de forma explícita quando Horizons retorna erro', () => {
  assert.throws(() => parseHorizonsVectors({ error: 'bad command' }), /bad command/);
  assert.throws(() => parseHorizonsVectors({ result: 'sem bloco de vetores' }), /não retornou vetores/i);
});

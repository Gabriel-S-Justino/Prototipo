import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY } from '../js/data/constants.js';
import {
  advance, availableDeltaV, capture, createState, deltaVMap, executeCorrection, executeDeparture, launch,
  previewDeparture, runOperationsTurn, validateDesign,
} from '../js/game/mission.js';
import { REFERENCE_DESIGN, near } from './fixtures.js';

function ready(design = REFERENCE_DESIGN) {
  const state = createState();
  state.design = structuredClone(design);
  return state;
}

function waitWindow(state) {
  while (state.phase === 'leo' && advance(state, 5 * DAY) !== 'window');
  return state;
}

function cruiseToMars(state) {
  while (state.phase === 'cruise') advance(state, 5 * DAY);
  return state;
}

test('mapa de Δv soma ≈ 13.920 m/s', () => {
  const map = deltaVMap();
  near(map.departure, 3613, 2);
  near(map.capture, 907, 2);
  near(map.total, 13920, 5);
});

test('foguete de referência é válido e cabe no orçamento', () => {
  assert.deepEqual(validateDesign(REFERENCE_DESIGN), []);
});

test('validação aponta problemas de montagem', () => {
  const codes = (d) => validateDesign(d).map((i) => i.code);
  assert.ok(codes({ stages: [['tank-l'], [], []], probe: ['probe-core', 'camera'] }).includes('no-engine'));
  assert.ok(codes({ stages: [['engine-main'], [], []], probe: ['probe-core', 'camera'] }).includes('no-tank'));
  assert.ok(codes({ stages: [['tank-l', 'engine-main', 'engine-upper'], [], []], probe: ['probe-core', 'camera'] }).includes('mixed-engines'));
  assert.ok(codes({ ...REFERENCE_DESIGN, probe: ['camera'] }).includes('no-core'));
  assert.ok(codes({ ...REFERENCE_DESIGN, probe: ['probe-core'] }).includes('no-instrument'));
  assert.ok(codes({ ...REFERENCE_DESIGN, probe: [...REFERENCE_DESIGN.probe, 'laser', 'rtg'] }).includes('budget'));
  const weak = { ...REFERENCE_DESIGN, stages: [REFERENCE_DESIGN.stages[0].slice(0, 5), ...REFERENCE_DESIGN.stages.slice(1)] };
  assert.ok(codes(weak).includes('twr'));
});

test('TWR baixo não decola', () => {
  const s = ready({ ...REFERENCE_DESIGN, stages: [REFERENCE_DESIGN.stages[0].slice(0, 5), ...REFERENCE_DESIGN.stages.slice(1)] });
  launch(s);
  assert.equal(s.result.reason, 'no-liftoff');
  assert.equal(s.result.outcome, 'failure');
});

test('sem Δv para a órbita o foguete cai', () => {
  const s = ready({ ...REFERENCE_DESIGN, stages: [REFERENCE_DESIGN.stages[0], [], []] });
  launch(s);
  assert.equal(s.result.reason, 'no-orbit');
});

test('missão de referência: janela, Hohmann, captura e ciência', () => {
  const s = ready();
  launch(s);
  assert.equal(s.phase, 'leo');
  waitWindow(s);
  const plan = previewDeparture(s, deltaVMap().departure);
  assert.ok(plan.hits);
  executeDeparture(s, deltaVMap().departure);
  assert.equal(s.phase, 'cruise');
  cruiseToMars(s);
  assert.equal(s.phase, 'encounter');
  capture(s);
  assert.equal(s.phase, 'operations');
  while (s.phase === 'operations') runOperationsTurn(s);
  assert.equal(s.result.outcome, 'success');
  assert.ok(s.result.lessons.length > 0);
});

test('partir 60 dias antes da janela erra Marte', () => {
  const s = ready();
  launch(s);
  executeDeparture(s, deltaVMap().departure);
  cruiseToMars(s);
  assert.equal(s.result.reason, 'lost');
});

test('sem Δv para frear vira sobrevoo', () => {
  const s = ready();
  launch(s);
  waitWindow(s);
  executeDeparture(s, deltaVMap().departure);
  executeCorrection(s, 0, 0);
  s.rocket.stages[s.rocket.stages.length - 1].prop = 0.01;
  cruiseToMars(s);
  capture(s);
  assert.equal(s.result.reason, 'flyby');
});

test('Δv é consumido pela partida', () => {
  const s = ready();
  launch(s);
  const before = availableDeltaV(s);
  waitWindow(s);
  executeDeparture(s, 3613);
  near(availableDeltaV(s), before - 3613, 1);
});

test('operações são determinísticas', () => {
  const run = () => {
    const s = ready();
    launch(s);
    waitWindow(s);
    executeDeparture(s, deltaVMap().departure);
    cruiseToMars(s);
    capture(s);
    while (s.phase === 'operations') runOperationsTurn(s);
    return s.result;
  };
  assert.deepEqual(run(), run());
});

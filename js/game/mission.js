// Regras da missão: montagem, lançamento, manobras, encontro, captura e operações. Sem DOM.
import { AU, C, DAY, MU_SUN, START_MS, secondsSinceJ2000 } from '../data/constants.js';
import { MISSION } from '../data/mission.js';
import { PROBE_PARTS, probePart, rocketPart } from '../data/parts.js';
import { EARTH, MARS } from '../data/planets.js';
import {
  add, captureBurn, closestApproach, escapeBurn, excessAfterBurn, hohmann, idealPhaseAngle, length, phaseAngle,
  planetState, positionAt, scale, stateToElements, sub, velocityAt,
} from '../physics/orbit.js';
import { buildRocket, burn, stageStats, totalDeltaV } from '../physics/rocket.js';
import { buildLessons } from './lessons.js';
import { calculateScore } from './scoring.js';

export const R_LEO = EARTH.radius + MISSION.leoAltitude;
export const R_CAPTURE_PERI = MARS.radius + MISSION.capturePeriAlt;
export const R_CAPTURE_APO = MARS.radius + MISSION.captureApoAlt;
export const ENCOUNTER_ZONE = MISSION.encounterSoiFactor * MARS.soi;
const PREDICTION_DAYS = 450;
const STEP = DAY / 4;

/** Mapa de Δv da viagem (m/s), calculado com a física real. */
export function deltaVMap() {
  const transfer = hohmann(MU_SUN, EARTH.a * AU, MARS.a * AU);
  const departure = escapeBurn(EARTH.mu, R_LEO, transfer.dv1);
  const capture = captureBurn(MARS.mu, R_CAPTURE_PERI, R_CAPTURE_APO, transfer.dv2);
  const captureCircular = captureBurn(MARS.mu, R_CAPTURE_PERI, R_CAPTURE_PERI, transfer.dv2);
  return {
    ascent: MISSION.ascentDeltaV,
    departure,
    capture,
    captureCircular,
    total: MISSION.ascentDeltaV + departure + capture,
    transferDays: transfer.time / DAY,
  };
}

/** Resumo da sonda: massa (kg), custo, energia em Marte, comunicação e ciência. */
export function probeStats(probeIds) {
  const parts = probeIds.map(probePart).filter(Boolean);
  const sum = (fn) => parts.reduce((s, p) => s + fn(p), 0);
  const instruments = parts.filter((p) => p.category === 'instrument');
  return {
    parts,
    mass: sum((p) => p.mass),
    cost: sum((p) => p.cost),
    generation: sum((p) => (p.power > 0 ? (p.solar ? p.power / (MARS.a * MARS.a) : p.power) : 0)),
    generationAt1AU: sum((p) => Math.max(0, p.power)),
    battery: sum((p) => p.battery ?? 0),
    consumption: sum((p) => (p.power < 0 ? -p.power : 0)),
    rateAt1AU: sum((p) => p.rate ?? 0),
    sciencePerTurn: sum((p) => p.science ?? 0),
    dataPerTurn: sum((p) => p.data ?? 0),
    instruments: instruments.length,
  };
}

export function designStats(design) {
  const probe = probeStats(design.probe);
  const rocket = buildRocket(design.stages, probe.mass / 1000);
  const stages = stageStats(rocket);
  const rocketCost = rocket.stages.reduce((s, st) => s + st.cost, 0);
  return {
    probe,
    rocket,
    stages,
    totalDeltaV: totalDeltaV(rocket),
    requiredDeltaV: deltaVMap().total,
    liftoffTWR: stages.length ? stages[0].twr : 0,
    totalMass: stages.length ? stages[0].m0 : probe.mass / 1000,
    cost: rocketCost + probe.cost,
    budget: MISSION.budget,
  };
}

export function validateDesign(design) {
  const issues = [];
  const error = (code, message) => issues.push({ code, message, severity: 'error' });
  const warning = (code, message) => issues.push({ code, message, severity: 'warning' });
  const stats = designStats(design);

  if (!design.probe.includes('probe-core')) error('no-core', 'A sonda precisa de um núcleo.');
  for (const part of PROBE_PARTS) {
    const n = design.probe.filter((id) => id === part.id).length;
    if (n > (part.max ?? 1)) error('copies', `${part.name}: no máximo ${part.max ?? 1}.`);
  }
  if (stats.probe.instruments === 0) error('no-instrument', 'Leve pelo menos um instrumento científico.');

  const used = design.stages.filter((s) => s.length > 0);
  if (used.length === 0) error('no-stage', 'Monte pelo menos um estágio de foguete.');
  design.stages.forEach((ids, i) => {
    if (ids.length === 0) return;
    const parts = ids.map(rocketPart);
    const tanks = parts.filter((p) => p.kind === 'tank').length;
    const engines = parts.filter((p) => p.kind === 'engine');
    const label = `Estágio ${i + 1}`;
    if (tanks === 0) error('no-tank', `${label}: falta um tanque.`);
    if (engines.length === 0) error('no-engine', `${label}: falta um motor.`);
    if (new Set(engines.map((p) => p.id)).size > 1) error('mixed-engines', `${label}: use um só tipo de motor.`);
    if (tanks > 4) error('too-many-tanks', `${label}: no máximo 4 tanques.`);
    if (engines.length > 3) error('too-many-engines', `${label}: no máximo 3 motores.`);
  });

  if (stats.cost > stats.budget) error('budget', `Orçamento estourado: US$ ${fmt(stats.cost)} M de ${fmt(stats.budget)} M.`);

  if (used.length && stats.liftoffTWR < MISSION.minLiftoffTWR) {
    warning('twr', `TWR na decolagem ${fmt(stats.liftoffTWR, 2)}: abaixo de ${fmt(MISSION.minLiftoffTWR, 1)} o foguete não sai do chão.`);
  }
  if (used.length && stats.totalDeltaV < stats.requiredDeltaV) {
    warning('deltav', `Δv total ${fmt(stats.totalDeltaV)} m/s, a viagem pede ${fmt(stats.requiredDeltaV)} m/s.`);
  }
  if (!stats.probe.parts.some((p) => p.category === 'comms')) warning('no-comms', 'Sem antena, nenhum dado chega à Terra.');
  if (stats.probe.generation + stats.probe.battery < stats.probe.consumption) {
    warning('power', `Em Marte a sonda gera ${fmt(stats.probe.generation)} W e consome ${fmt(stats.probe.consumption)} W.`);
  }
  return issues;
}

export function canLaunch(issues) {
  return !issues.some((i) => i.severity === 'error');
}

export function createState() {
  return {
    phase: 'briefing',
    t: secondsSinceJ2000(START_MS),
    warp: 0,
    view: 'sun',
    design: { stages: [[], [], []], probe: ['probe-core'] },
    rocket: null,
    ship: null,
    departure: null,
    encounter: null,
    ops: null,
    log: [],
    timeline: [],
    result: null,
  };
}

function log(state, title, text, ok) {
  state.log.push({ t: state.t, phase: state.phase, title, text, ok });
}

export function launch(state) {
  const stats = designStats(state.design);
  state.launchStats = { liftoffTWR: stats.liftoffTWR, totalDeltaV: stats.totalDeltaV, cost: stats.cost };
  if (stats.liftoffTWR < MISSION.minLiftoffTWR) {
    log(state, 'Decolagem', `Empuxo menor que o necessário: TWR ${fmt(stats.liftoffTWR, 2)}. O foguete não sai da plataforma.`, false);
    return finish(state, 'no-liftoff');
  }
  const ascent = burn(stats.rocket, MISSION.ascentDeltaV);
  state.rocket = ascent.rocket;
  if (ascent.dropped) log(state, 'Separação', `${ascent.dropped} estágio(s) esgotado(s) e descartado(s) na subida.`, true);
  if (ascent.missing > 0) {
    log(state, 'Subida', `Faltaram ${fmt(ascent.missing)} m/s para chegar à órbita. O foguete caiu de volta.`, false);
    return finish(state, 'no-orbit');
  }
  state.phase = 'leo';
  state.ship = { frame: 'earth' };
  log(state, 'Órbita baixa', `Nave em órbita a 200 km, a ${fmt(Math.sqrt(EARTH.mu / R_LEO))} m/s. Restam ${fmt(totalDeltaV(state.rocket))} m/s de Δv.`, true);
  return state;
}

export function availableDeltaV(state) {
  return state.rocket ? totalDeltaV(state.rocket) : 0;
}

function predict(el, t) {
  const approach = closestApproach(el, MARS, t, t + PREDICTION_DAYS * DAY);
  return { el, approach, hits: approach.dist < ENCOUNTER_ZONE };
}

/** Prévia da queima de partida (não altera o estado). */
export function previewDeparture(state, dv) {
  const vInf = excessAfterBurn(EARTH.mu, R_LEO, dv);
  if (vInf === null) return { escapes: false, dv };
  const earth = planetState(EARTH, state.t);
  const dir = scale(earth.v, 1 / length(earth.v));
  const el = stateToElements(earth.r, add(earth.v, scale(dir, vInf)), MU_SUN, state.t);
  return { escapes: true, dv, vInf, ...predict(el, state.t) };
}

export function executeDeparture(state, dv) {
  const result = burn(state.rocket, Math.min(dv, availableDeltaV(state)));
  state.rocket = result.rocket;
  const plan = previewDeparture(state, result.achieved);
  if (!plan.escapes) {
    log(state, 'Queima de partida', `${fmt(result.achieved)} m/s não bastam para escapar da Terra: só para atingir a velocidade de escape são ${fmt(escapeBurn(EARTH.mu, R_LEO, 0))} m/s.`, false);
    return state;
  }
  state.departure = { t: state.t, phase: phaseAngle(state.t), dv: result.achieved, vInf: plan.vInf };
  state.ship = { frame: 'sun', el: plan.el };
  state.phase = 'cruise';
  state.warp = 0;
  log(
    state,
    'Partida',
    `Queima de ${fmt(result.achieved)} m/s. A nave sai da Terra com ${fmt(plan.vInf)} m/s de sobra (v∞). Ângulo de fase na partida: ${fmt(state.departure.phase, 1)}° (ideal ${fmt(idealPhaseAngle(), 1)}°).`,
    true,
  );
  return state;
}

function correctedVelocity(state, prograde, radial) {
  const r = positionAt(state.ship.el, state.t);
  const v = velocityAt(state.ship.el, state.t);
  const along = scale(v, 1 / length(v));
  const out = scale(r, 1 / length(r));
  return { r, v: add(v, add(scale(along, prograde), scale(out, radial))) };
}

/** Prévia de uma correção de meio de curso. */
export function previewCorrection(state, prograde, radial) {
  const { r, v } = correctedVelocity(state, prograde, radial);
  return predict(stateToElements(r, v, MU_SUN, state.t), state.t);
}

export function executeCorrection(state, prograde, radial) {
  const dv = Math.hypot(prograde, radial);
  if (dv === 0) return state;
  const result = burn(state.rocket, Math.min(dv, availableDeltaV(state)));
  state.rocket = result.rocket;
  const k = result.achieved / dv;
  const { r, v } = correctedVelocity(state, prograde * k, radial * k);
  state.ship.el = stateToElements(r, v, MU_SUN, state.t);
  log(state, 'Correção de curso', `Queima de ${fmt(result.achieved)} m/s (prograde ${fmt(prograde * k)}, radial ${fmt(radial * k)}).`, true);
  return state;
}

export function currentPrediction(state) {
  return state.phase === 'cruise' ? predict(state.ship.el, state.t) : null;
}

/** Avança o tempo; para sozinho na janela de lançamento, no encontro com Marte ou se a nave se perder. */
export function advance(state, seconds) {
  const end = state.t + seconds;
  while (state.t < end && (state.phase === 'leo' || state.phase === 'cruise')) {
    const before = phaseAngle(state.t);
    state.t = Math.min(end, state.t + STEP);
    if (state.phase === 'leo') {
      const after = phaseAngle(state.t);
      const ideal = idealPhaseAngle();
      if (before >= ideal && after < ideal && before - after < 10) {
        state.warp = 0;
        log(state, 'Janela de lançamento', `Ângulo de fase chegou a ${fmt(ideal, 1)}°: é a hora de partir para Marte.`, true);
        return 'window';
      }
    } else {
      const ship = positionAt(state.ship.el, state.t);
      const mars = planetState(MARS, state.t);
      if (length(sub(ship, mars.r)) < ENCOUNTER_ZONE) {
        const vInf = length(sub(velocityAt(state.ship.el, state.t), mars.v));
        const required = captureBurn(MARS.mu, R_CAPTURE_PERI, R_CAPTURE_APO, vInf);
        state.encounter = { t: state.t, vInf, required };
        state.phase = 'encounter';
        state.warp = 0;
        state.view = 'mars';
        log(state, 'Encontro com Marte', `A nave entrou na esfera de influência de Marte a ${fmt(vInf)} m/s (v∞). Captura exige ${fmt(required)} m/s.`, true);
        return 'encounter';
      }
      if (state.t - state.departure.t > MISSION.maxCruiseDays * DAY) {
        log(state, 'Perdida', `${MISSION.maxCruiseDays} dias sem encontrar Marte. A nave segue orbitando o Sol para sempre.`, false);
        finish(state, 'lost');
        return 'lost';
      }
    }
  }
  return null;
}

export function capture(state) {
  const result = burn(state.rocket, state.encounter.required);
  state.rocket = result.rocket;
  if (result.missing > 0) {
    log(state, 'Captura', `Faltaram ${fmt(result.missing)} m/s: a nave passou por Marte e seguiu viagem.`, false);
    return finish(state, 'flyby');
  }
  const a = (R_CAPTURE_PERI + R_CAPTURE_APO) / 2;
  state.ship = {
    frame: 'mars',
    el: {
      a,
      e: (R_CAPTURE_APO - R_CAPTURE_PERI) / (R_CAPTURE_APO + R_CAPTURE_PERI),
      omega: 0,
      dir: 1,
      mu: MARS.mu,
      n: Math.sqrt(MARS.mu / (a * a * a)),
      M0: 0,
      t0: state.t,
    },
  };
  state.phase = 'operations';
  state.ops = { turn: 0, buffer: { data: 0, science: 0 }, delivered: 0, dataLost: 0, safeTurns: 0, shed: 0 };
  log(state, 'Captura', `Queima de ${fmt(state.encounter.required)} m/s: a nave está em órbita de Marte (300 × 33.000 km).`, true);
  return state;
}

export function earthMarsDistance(t) {
  return length(sub(planetState(EARTH, t).r, planetState(MARS, t).r));
}

/** Um turno de operações científicas (30 dias). */
export function runOperationsTurn(state) {
  const ops = state.ops;
  const probe = probeStats(state.design.probe);
  ops.turn += 1;
  state.t += MISSION.turnDays * DAY;
  const distAU = earthMarsDistance(state.t) / AU;

  const available = probe.generation + probe.battery;
  const core = -probePart('probe-core').power;
  const comms = probe.parts.filter((p) => p.category === 'comms');
  const commsDraw = comms.reduce((s, p) => s - p.power, 0);
  const safe = available < core;
  let remaining = safe ? 0 : available - core;
  const commsOn = !safe && comms.length > 0 && commsDraw <= remaining;
  if (commsOn) remaining -= commsDraw;

  const instruments = safe ? [] : probe.parts.filter((p) => p.category === 'instrument').sort((x, y) => x.power - y.power);
  const shed = [];
  while (instruments.length && instruments.reduce((s, p) => s - p.power, 0) > remaining) shed.push(instruments.shift().name);
  if (safe) {
    ops.safeTurns += 1;
    log(state, 'Modo seguro', `A sonda tem ${fmt(available)} W e precisa de ${fmt(core)} W só para o computador.`, false);
  }
  if (shed.length) {
    ops.shed += 1;
    log(state, 'Energia insuficiente', `Desligados: ${shed.join(', ')}.`, false);
  }

  ops.buffer.science += instruments.reduce((s, p) => s + p.science, 0);
  ops.buffer.data += instruments.reduce((s, p) => s + p.data, 0);
  const downlink = commsOn ? comms.reduce((s, p) => s + p.rate, 0) / (distAU * distAU) : 0;
  const sent = Math.min(ops.buffer.data, downlink);
  if (sent > 0) {
    const share = sent / ops.buffer.data;
    ops.delivered += ops.buffer.science * share;
    ops.buffer.science -= ops.buffer.science * share;
    ops.buffer.data -= sent;
  }
  if (ops.buffer.data > MISSION.bufferMax) {
    ops.dataLost += ops.buffer.data - MISSION.bufferMax;
    ops.buffer.science *= MISSION.bufferMax / ops.buffer.data;
    ops.buffer.data = MISSION.bufferMax;
  }

  const consumption = safe ? Math.min(core, available) : core + (commsOn ? commsDraw : 0) + instruments.reduce((s, p) => s - p.power, 0);
  state.timeline.push({
    turn: ops.turn,
    t: state.t,
    distAU,
    delay: (distAU * AU) / C,
    generation: probe.generation,
    consumption,
    downlink: sent,
    science: ops.delivered,
  });
  if (ops.turn >= MISSION.operationsTurns) finish(state, 'complete');
  return state;
}

export function finish(state, reason) {
  state.phase = 'report';
  state.warp = 0;
  const stats = designStats(state.design);
  const science = state.ops ? Math.round(state.ops.delivered * 10) / 10 : 0;
  const deltaVLeft = availableDeltaV(state);
  const score = calculateScore({
    captured: reason === 'complete',
    science,
    target: MISSION.scienceTarget,
    budget: MISSION.budget,
    budgetLeft: MISSION.budget - stats.cost,
    deltaVLeft,
    multiplier: MISSION.difficultyMultiplier,
    safeTurns: state.ops?.safeTurns ?? 0,
  });
  state.result = { reason, science, budgetLeft: MISSION.budget - stats.cost, deltaVLeft, ...score };
  state.result.lessons = buildLessons(state, stats);
  return state;
}

export function fmt(value, digits = 0) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}


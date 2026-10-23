// Briefing, tela de voo (controles de tempo e manobras) e Painel de Física.
import { dateFromSeconds } from '../data/constants.js';
import { CONCEPTS, CONCEPTS_BY_PHASE, SIMPLIFICATIONS } from '../data/concepts.js';
import { MISSION } from '../data/mission.js';
import {
  availableDeltaV, capture, deltaVMap, executeCorrection, executeDeparture, runOperationsTurn,
} from '../game/mission.js';
import { idealPhaseAngle, phaseAngle, phaseRateDegPerDay } from '../physics/orbit.js';
import { el, fmt } from './dom.js';
import { NASA_RESOURCES } from '../data/nasa-resources.js';

export const formatDate = (t) => dateFromSeconds(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function renderBriefing(act) {
  const map = deltaVMap();
  const steps = [
    ['Subida até a órbita baixa', map.ascent, '#94a3b8'],
    ['Partida para Marte', map.departure, '#fb923c'],
    ['Captura em Marte', map.capture, '#f87171'],
  ];
  const width = 520;
  let x = 0;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} 56`);
  svg.setAttribute('class', 'dvmap');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Mapa de delta-v da viagem');
  for (const [, dv, color] of steps) {
    const w = (dv / map.total) * width;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x, y: 8, width: w - 2, height: 40, rx: 6, fill: color }).forEach(([k, v]) => rect.setAttribute(k, v));
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    Object.entries({ x: x + w / 2, y: 33, 'text-anchor': 'middle', 'font-size': 13, fill: '#0f172a', 'font-weight': 600 }).forEach(([k, v]) => text.setAttribute(k, v));
    text.textContent = `${fmt(dv)} m/s`;
    svg.append(rect, text);
    x += w;
  }
  return el('section', { class: 'briefing' },
    el('p', { class: 'eyebrow' }, 'Missão'),
    el('h2', {}, MISSION.name),
    el('p', {}, MISSION.briefing),
    el('h3', {}, `Mapa de Δv: ${fmt(map.total)} m/s no total`),
    svg,
    el('ul', { class: 'legend' }, steps.map(([name, dv, color]) => el('li', {}, el('span', { class: 'dot', style: `background:${color}` }), `${name}: ${fmt(dv)} m/s`))),
    el('p', { class: 'muted' }, `Uma órbita circular baixa em Marte custaria ${fmt(map.captureCircular)} m/s em vez de ${fmt(map.capture)}. A viagem de Hohmann leva ${fmt(map.transferDays)} dias.`),
    el('dl', { class: 'facts' },
      el('div', {}, el('dt', {}, 'Orçamento'), el('dd', {}, `US$ ${fmt(MISSION.budget)} M`)),
      el('div', {}, el('dt', {}, 'Meta de ciência'), el('dd', {}, `${MISSION.scienceTarget} pontos`)),
      el('div', {}, el('dt', {}, 'Operações'), el('dd', {}, `${MISSION.operationsTurns} × ${MISSION.turnDays} dias`))),
    el('button', { type: 'button', class: 'btn primary', onclick: () => act((s) => (s.phase = 'hangar')) }, 'Ir ao hangar'));
}

function slider(id, labelText, min, max, value, onInput) {
  return el('label', { class: 'slider' },
    el('span', {}, labelText, ' ', el('output', { id: `${id}-out` }, `${fmt(value)} m/s`)),
    el('input', { id, type: 'range', min, max, step: 10, value, oninput: (e) => onInput(Number(e.target.value)) }));
}

function warpButtons(state, act) {
  const options = [[0, '⏸'], [1, '1×'], [10, '10×'], [50, '50×']];
  return el('div', { class: 'row warp', role: 'group', 'aria-label': 'Aceleração do tempo (dias por segundo)' },
    options.map(([v, text]) => el('button', { type: 'button', class: state.warp === v ? 'btn small on' : 'btn small', onclick: () => act((s) => (s.warp = v)) }, text)),
    el('span', { class: 'muted' }, 'dias/s'));
}

function phaseControls(state, ui, act) {
  if (state.phase === 'leo') {
    return el('div', { class: 'panel' },
      el('h3', {}, 'Partida para Marte'),
      el('p', { id: 'window-info', class: 'muted' }),
      slider('dv', 'Queima prograde:', 0, 4500, ui.dv, (v) => act((s, u) => { u.dv = v; u.preview = null; }, false)),
      el('p', { id: 'preview-info' }),
      el('button', { type: 'button', class: 'btn primary', onclick: () => act((s, u) => { executeDeparture(s, u.dv); u.preview = null; u.prediction = null; s.view = 'sun'; }) }, 'Executar queima de partida'));
  }
  if (state.phase === 'cruise') {
    return el('div', { class: 'panel' },
      el('h3', {}, 'Cruzeiro'),
      el('p', { id: 'preview-info' }),
      slider('pg', 'Prograde:', -300, 300, ui.pg, (v) => act((s, u) => { u.pg = v; u.preview = null; }, false)),
      slider('rad', 'Radial (para fora):', -300, 300, ui.rad, (v) => act((s, u) => { u.rad = v; u.preview = null; }, false)),
      el('button', { type: 'button', class: 'btn', disabled: ui.pg === 0 && ui.rad === 0, onclick: () => act((s, u) => { executeCorrection(s, u.pg, u.rad); u.pg = 0; u.rad = 0; u.preview = null; u.prediction = null; }) }, 'Executar correção'));
  }
  if (state.phase === 'encounter') {
    const e = state.encounter;
    const enough = availableDeltaV(state) >= e.required;
    return el('div', { class: 'panel' },
      el('h3', {}, 'Encontro com Marte'),
      el('p', {}, `Velocidade de chegada em relação a Marte (v∞): ${fmt(e.vInf)} m/s.`),
      el('p', {}, `Queima de captura (retrograde no periapse, 300 km): ${fmt(e.required)} m/s.`),
      el('p', { class: enough ? 'good' : 'bad' }, `Δv disponível: ${fmt(availableDeltaV(state))} m/s.`),
      el('button', { type: 'button', class: 'btn primary', onclick: () => act((s) => capture(s)) }, 'Queima de captura'));
  }
  if (state.phase === 'operations') {
    const last = state.timeline.at(-1);
    return el('div', { class: 'panel' },
      el('h3', {}, `Operações científicas · turno ${state.ops.turn} de ${MISSION.operationsTurns}`),
      el('p', {}, `Ciência entregue: ${fmt(state.ops.delivered)} / ${MISSION.scienceTarget} · dados a bordo: ${fmt(state.ops.buffer.data, 1)} Gbit`),
      last ? el('p', { class: 'muted' }, `Último turno: Terra a ${fmt(last.distAU, 2)} UA, sinal leva ${fmt(last.delay / 60, 1)} min, ${fmt(last.downlink, 1)} Gbit enviados, ${fmt(last.consumption)} W de ${fmt(last.generation)} W.`) : null,
      el('button', { type: 'button', class: 'btn primary', onclick: () => act((s) => runOperationsTurn(s)) }, `Próximos ${MISSION.turnDays} dias`));
  }
  return null;
}

export function renderFlight(state, ui, act, onSyncHorizons = () => {}) {
  const views = [['sun', 'Sistema Solar'], ['earth', 'Terra'], ['mars', 'Marte']];
  return el('section', { class: 'flight' },
    el('div', { class: 'map-wrap' },
      el('div', { class: 'map-mode-toggle', role: 'group', 'aria-label': 'Modo de visualização' },
        el('button', { type: 'button', class: ui.mapMode !== '2d' ? 'btn small on' : 'btn small', 'data-map-mode': '3d', 'aria-pressed': String(ui.mapMode !== '2d') }, 'Sistema Solar 3D'),
        el('button', { type: 'button', class: ui.mapMode === '2d' ? 'btn small on' : 'btn small', 'data-map-mode': '2d', 'aria-pressed': String(ui.mapMode === '2d') }, 'Mapa de missão 2D')),
      el('div', { id: 'solar-3d', class: 'solar-3d-view', hidden: ui.mapMode === '2d', 'aria-label': 'Sistema Solar 3D com texturas planetárias' }),
      el('canvas', { id: 'map', role: 'img', 'aria-label': 'Mapa orbital com os planetas e a trajetória da nave', style: ui.mapMode === '2d' ? '' : 'display:none' }),
      el('div', { class: 'row views' }, views.map(([v, text]) => el('button', { type: 'button', class: state.view === v ? 'btn small on' : 'btn small', onclick: () => act((s) => (s.view = v)) }, text))),
      el('div', { class: 'nasa-inline-links' },
        el('span', {}, 'Referência científica:'),
        el('a', { href: NASA_RESOURCES.eyesSolarSystem, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir NASA Eyes on the Solar System ↗')),
      el('div', { class: 'horizons-sync panel' },
        el('div', {}, el('strong', {}, 'Efemérides oficiais JPL'), el('p', { id: 'horizons-status', class: 'muted', 'aria-live': 'polite' }, 'Visualização usando o modelo orbital educacional até sincronizar com o JPL.')),
        el('button', { type: 'button', class: 'btn small', id: 'sync-horizons', onclick: onSyncHorizons }, 'Sincronizar Terra e Marte com JPL'))),
    el('div', { class: 'controls' },
      el('div', { class: 'panel' },
        el('p', { class: 'date' }, el('span', { id: 'date' }, formatDate(state.t))),
        state.phase === 'leo' || state.phase === 'cruise' ? warpButtons(state, act) : null,
        el('p', { id: 'dv-left' }, `Δv disponível: ${fmt(availableDeltaV(state))} m/s · estágios restantes: ${state.rocket?.stages.length ?? 0}`)),
      phaseControls(state, ui, act),
      el('div', { class: 'panel log' },
        el('h3', {}, 'Diário de bordo'),
        el('ol', {}, state.log.slice(-5).reverse().map((e) => el('li', { class: e.ok === false ? 'bad' : '' }, el('strong', {}, `${formatDate(e.t)} · ${e.title}: `), e.text))))));
}

/** Atualiza só os textos que mudam a cada quadro. */
export function updateFlightText(state, ui) {
  const set = (id, text, cls) => {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = text;
      if (cls !== undefined) node.className = cls;
    }
  };
  set('date', formatDate(state.t));
  if (state.phase === 'leo') {
    const now = phaseAngle(state.t);
    const ideal = idealPhaseAngle();
    let days = (now - ideal) / phaseRateDegPerDay();
    const open = Math.abs(days) < 3;
    if (days < 0) days += 360 / phaseRateDegPerDay();
    set('window-info', `Ângulo de fase: ${fmt(now, 1)}° (ideal ${fmt(ideal, 1)}°). ${open ? 'Janela aberta: parta agora!' : `Próxima janela em ${fmt(days)} dias. O tempo para sozinho quando ela abrir.`}`);
    set('dv-out', `${fmt(ui.dv)} m/s`);
    const p = ui.preview;
    if (p && !p.escapes) set('preview-info', 'Com essa queima a nave não escapa da Terra.', 'bad');
    else if (p) set('preview-info', `v∞ = ${fmt(p.vInf)} m/s. Aproximação máxima de Marte: ${fmt(p.approach.dist / 1e9, 2)} milhões de km em ${formatDate(p.approach.t)}. ${p.hits ? 'Encontro com Marte ✓' : 'Não encontra Marte.'}`, p.hits ? 'good' : 'bad');
  }
  if (state.phase === 'cruise') {
    set('pg-out', `${fmt(ui.pg)} m/s`);
    set('rad-out', `${fmt(ui.rad)} m/s`);
    const p = ui.preview ?? ui.prediction;
    if (p) set('preview-info', `${ui.preview ? 'Com a correção' : 'Trajetória atual'}: aproximação máxima de Marte ${fmt(p.approach.dist / 1e9, 2)} milhões de km em ${formatDate(p.approach.t)}. ${p.hits ? 'Encontro ✓' : 'Vai errar Marte.'}`, p.hits ? 'good' : 'bad');
  }
}

export function renderPhysics(state) {
  const ids = CONCEPTS_BY_PHASE[state.phase] ?? [];
  return el('div', {},
    el('h2', {}, 'Painel de Física'),
    ids.map((id) => {
      const c = CONCEPTS.find((x) => x.id === id);
      return el('article', { class: 'concept' },
        el('h3', {}, c.title),
        el('p', { class: 'formula' }, c.formula),
        el('p', {}, c.plain),
        el('p', { class: 'live', 'data-concept': c.id }, c.live(state)),
        el('p', { class: 'analogy' }, c.analogy));
    }),
    el('details', { class: 'concept' },
      el('summary', {}, 'Como o jogo simplifica'),
      el('ul', {}, SIMPLIFICATIONS.map((s) => el('li', {}, s)))));
}

/** Atualiza os números ao vivo do Painel de Física. */
export function updatePhysicsText(state) {
  for (const node of document.querySelectorAll('[data-concept]')) {
    const c = CONCEPTS.find((x) => x.id === node.dataset.concept);
    node.textContent = c.live(state);
  }
}


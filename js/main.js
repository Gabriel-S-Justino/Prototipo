// Ponto de entrada: guarda o estado, desenha a tela da fase atual e roda o relógio do jogo.
import { DAY } from './data/constants.js';
import { advance, createState, currentPrediction, previewCorrection, previewDeparture } from './game/mission.js';
import { renderHangar } from './ui/hangar.js';
import { drawMap } from './ui/map.js';
import { formatDate, renderBriefing, renderFlight, renderPhysics, updateFlightText, updatePhysicsText } from './ui/panels.js';
import { renderReport } from './ui/report.js';
import { mountSolar3D } from './ui/solar3d.js';
import { mountHangar3D } from './ui/hangar3d.js';
import { fetchHorizonsEphemerides } from './data/horizons-client.js';

const PHASE_NAMES = {
  briefing: 'Briefing',
  hangar: 'Hangar',
  leo: 'Órbita baixa da Terra',
  cruise: 'Cruzeiro',
  encounter: 'Encontro com Marte',
  operations: 'Operações em Marte',
  report: 'Relatório',
};
const FLIGHT = ['leo', 'cruise', 'encounter', 'operations'];

const state = createState();
const ui = { stage: 0, dv: 3600, pg: 0, rad: 0, preview: null, prediction: null, previewT: null, mapMode: '3d' };
const main = document.getElementById('main');
const physics = document.getElementById('physics');
let sceneMount = null;
let sceneView = null;
let currentHorizons = null;
let horizonsLoading = false;

/** Toda ação do jogador passa por aqui: muda o estado e redesenha a tela. */
function act(change, rerender = true) {
  change(state, ui);
  refreshPredictions(true);
  if (rerender) render();
  else updateFlightText(state, ui);
}

function render() {
  document.body.classList.toggle('hangar-active', state.phase === 'hangar');
  if (sceneMount) {
    sceneMount.dispose();
    sceneMount = null;
  }
  document.getElementById('phase').textContent = PHASE_NAMES[state.phase];
  document.getElementById('clock').textContent = formatDate(state.t);
  main.replaceChildren(
    state.phase === 'briefing' ? renderBriefing(act)
      : state.phase === 'hangar' ? renderHangar(state, ui, act)
        : state.phase === 'report' ? renderReport(state, act)
          : renderFlight(state, ui, act, syncHorizons));
  physics.replaceChildren(renderPhysics(state));
  if (state.phase === 'hangar') {
    const container = document.getElementById('hangar-3d');
    if (container) sceneMount = mountHangar3D(container, state.design);
  } else if (FLIGHT.includes(state.phase) && ui.mapMode === '3d') {
    const container = document.getElementById('solar-3d');
    if (container) { sceneMount = mountSolar3D(container, state.t, state.view, state); sceneView = state.view; if (currentHorizons) sceneMount.setEphemerides?.(currentHorizons); }
  }
  main.querySelectorAll('[data-map-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      ui.mapMode = button.dataset.mapMode;
      render();
    });
  });
  updateFlightText(state, ui);
  main.focus({ preventScroll: true });
}


async function syncHorizons() {
  const button = document.getElementById('sync-horizons');
  const status = document.getElementById('horizons-status');
  if (horizonsLoading || !button || !status) return;
  horizonsLoading = true;
  button.disabled = true;
  button.textContent = 'Consultando JPL…';
  status.textContent = 'Buscando vetores heliocêntricos da Terra e de Marte…';
  try {
    const date = new Date(Date.UTC(2000, 0, 1, 12) + state.t * 1000).toISOString().slice(0, 10);
    currentHorizons = await fetchHorizonsEphemerides(date);
    sceneMount?.setEphemerides?.(currentHorizons);
    status.textContent = `Dados JPL recebidos para ${currentHorizons.date}. Posições atualizadas na visualização 3D (AU, referencial eclíptico heliocêntrico). A física da nave continua usando o propagador educacional.`;
    status.className = 'good';
  } catch (error) {
    status.textContent = `${error.message} A visualização aproximada foi mantida.`;
    status.className = 'bad';
  } finally {
    horizonsLoading = false;
    const liveButton = document.getElementById('sync-horizons');
    if (liveButton) { liveButton.disabled = false; liveButton.textContent = 'Sincronizar Terra e Marte com JPL'; }
  }
}

/** Recalcula as trajetórias previstas quando o tempo ou a manobra mudam. */
function refreshPredictions(force) {
  if (!force && ui.previewT === state.t) return;
  ui.previewT = state.t;
  ui.prediction = currentPrediction(state);
  if (state.phase === 'leo') ui.preview = previewDeparture(state, ui.dv);
  else if (state.phase === 'cruise' && (ui.pg !== 0 || ui.rad !== 0)) ui.preview = previewCorrection(state, ui.pg, ui.rad);
  else ui.preview = null;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.warp > 0 && (state.phase === 'leo' || state.phase === 'cruise')) {
    const phase = state.phase;
    const event = advance(state, state.warp * DAY * dt);
    refreshPredictions(false);
    if (event || state.phase !== phase) render();
    else {
      updateFlightText(state, ui);
      updatePhysicsText(state);
      document.getElementById('clock').textContent = formatDate(state.t);
    }
  }
  if (sceneMount && FLIGHT.includes(state.phase) && ui.mapMode === '3d') {
    sceneMount.updateTime?.(state.t, state);
    if (sceneView !== state.view) { sceneMount.setView?.(state.view); sceneView = state.view; }
  }
  const canvas = document.getElementById('map');
  if (canvas && canvas.clientWidth > 0 && FLIGHT.includes(state.phase)) drawMap(canvas, state, state.view, ui.preview, ui.prediction);
  requestAnimationFrame(frame);
}

render();
requestAnimationFrame(frame);

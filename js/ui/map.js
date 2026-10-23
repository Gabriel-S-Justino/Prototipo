// Mapa orbital em canvas 2D: órbitas dos planetas, nave, trajetórias e ângulo de fase.
import { AU } from '../data/constants.js';
import { EARTH, MARS, PLANETS } from '../data/planets.js';
import { R_CAPTURE_APO, R_LEO } from '../game/mission.js';
import { apsides, period, phaseAngle, planetState, positionAt, trajectoryPoints } from '../physics/orbit.js';

const STARS = Array.from({ length: 160 }, (_, i) => [((i * 7919) % 1000) / 1000, ((i * 104729) % 997) / 997, (i % 3) * 0.4 + 0.4]);

export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  return dpr;
}

/** preview: { el, approach } da manobra planejada (tracejada); prediction: o mesmo para a trajetória atual. */
export function drawMap(canvas, state, view, preview, prediction) {
  const dpr = resizeCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#94a3b8';
  for (const [x, y, r] of STARS) ctx.fillRect(x * w, y * h, r * dpr, r * dpr);
  ctx.translate(w / 2, h / 2);
  ctx.lineWidth = dpr;
  ctx.font = `${12 * dpr}px system-ui, sans-serif`;
  const fit = (Math.min(w, h) / 2) * 0.92;
  if (view === 'earth') drawEarthView(ctx, state, fit, dpr);
  else if (view === 'mars') drawMarsView(ctx, state, fit, dpr);
  else drawSunView(ctx, state, fit, dpr, preview, prediction);
}

function toScreen(p, k) {
  return [p[0] * k, -p[1] * k];
}

function circle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function label(ctx, text, x, y, color, dpr) {
  ctx.fillStyle = color;
  const width = ctx.measureText(text).width;
  const left = x + 8 * dpr + width > ctx.canvas.width / 2;
  ctx.fillText(text, left ? x - 8 * dpr - width : x + 8 * dpr, y - 8 * dpr);
}

function path(ctx, points, k, color, dashed, dpr) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = toScreen(p, k);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.setLineDash(dashed ? [6 * dpr, 6 * dpr] : []);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * dpr;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = dpr;
}

function ship(ctx, x, y, dpr) {
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.moveTo(x, y - 7 * dpr);
  ctx.lineTo(x - 5 * dpr, y + 5 * dpr);
  ctx.lineTo(x + 5 * dpr, y + 5 * dpr);
  ctx.closePath();
  ctx.fill();
}

function apsisMarkers(ctx, el, k, dpr, color) {
  const a = apsides(el);
  const [px, py] = toScreen(a.periapsis, k);
  const [ax, ay] = toScreen(a.apoapsis, k);
  circle(ctx, px, py, 3 * dpr, color);
  label(ctx, `Pe ${(a.rp / AU).toFixed(2)} UA`, px, py + 26 * dpr, color, dpr);
  circle(ctx, ax, ay, 3 * dpr, color);
  label(ctx, `Ap ${(a.ra / AU).toFixed(2)} UA`, ax, ay, color, dpr);
}

function drawSunView(ctx, state, fit, dpr, preview, prediction) {
  const k = fit / (1.7 * AU);
  circle(ctx, 0, 0, 9 * dpr, '#fde047');
  for (const p of PLANETS) circle(ctx, 0, 0, p.a * AU * k, null, 'rgba(148,163,184,0.35)');

  const earth = planetState(EARTH, state.t);
  const mars = planetState(MARS, state.t);
  const [ex, ey] = toScreen(earth.r, k);
  const [mx, my] = toScreen(mars.r, k);

  if (state.phase === 'leo') {
    ctx.setLineDash([3 * dpr, 4 * dpr]);
    ctx.strokeStyle = 'rgba(250,204,21,0.6)';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(0, 0);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, `φ = ${phaseAngle(state.t).toFixed(1)}°`, 0, 0, '#facc15', dpr);
  }

  for (const p of PLANETS) {
    const [x, y] = toScreen(planetState(p, state.t).r, k);
    circle(ctx, x, y, p.size * dpr, p.color);
    label(ctx, p.name, x, y, '#cbd5e1', dpr);
  }

  if (prediction) {
    path(ctx, trajectoryPoints(prediction.el), k, '#22d3ee', false, dpr);
    apsisMarkers(ctx, prediction.el, k, dpr, '#67e8f9');
  }
  if (preview?.el) {
    path(ctx, trajectoryPoints(preview.el), k, '#fb923c', true, dpr);
    if (!prediction) apsisMarkers(ctx, preview.el, k, dpr, '#fdba74');
  }
  const target = preview?.el ? preview : prediction;
  if (target?.approach) {
    const ghostMars = toScreen(planetState(MARS, target.approach.t).r, k);
    const ghostShip = toScreen(positionAt(target.el, target.approach.t), k);
    circle(ctx, ghostMars[0], ghostMars[1], 7 * dpr, null, target.hits ? '#4ade80' : '#f87171');
    circle(ctx, ghostShip[0], ghostShip[1], 3 * dpr, '#fb923c');
    ctx.strokeStyle = target.hits ? '#4ade80' : '#f87171';
    ctx.beginPath();
    ctx.moveTo(ghostMars[0], ghostMars[1]);
    ctx.lineTo(ghostShip[0], ghostShip[1]);
    ctx.stroke();
    label(ctx, target.hits ? 'Encontro com Marte' : 'Marte estará aqui', ghostMars[0], ghostMars[1] + 22 * dpr, target.hits ? '#4ade80' : '#f87171', dpr);
  }

  if (state.phase === 'leo') ship(ctx, ex, ey - 10 * dpr, dpr);
  else if (state.ship?.frame === 'sun') {
    const [sx, sy] = toScreen(positionAt(state.ship.el, state.t), k);
    ship(ctx, sx, sy, dpr);
  }
  ctx.fillStyle = '#64748b';
  ctx.fillText('Planetas fora de escala', -fit, fit);
}

function drawEarthView(ctx, state, fit, dpr) {
  const k = fit / (R_LEO * 1.6);
  circle(ctx, 0, 0, EARTH.radius * k, '#1d4ed8');
  circle(ctx, 0, 0, R_LEO * k, null, '#22d3ee');
  const angle = ((state.t % period(EARTH.mu, R_LEO)) / period(EARTH.mu, R_LEO)) * Math.PI * 2;
  ship(ctx, Math.cos(angle) * R_LEO * k, -Math.sin(angle) * R_LEO * k, dpr);
  label(ctx, 'Terra (em escala)', 0, -EARTH.radius * k, '#cbd5e1', dpr);
  label(ctx, 'Órbita baixa: 200 km', R_LEO * k * 0.7, -R_LEO * k * 0.7, '#67e8f9', dpr);
}

function drawMarsView(ctx, state, fit, dpr) {
  const k = fit / (R_CAPTURE_APO * 1.05);
  ctx.translate(fit * 0.45, 0);
  circle(ctx, 0, 0, Math.max(MARS.radius * k, 4 * dpr), '#ea580c');
  label(ctx, 'Marte (em escala)', 0, -MARS.radius * k, '#cbd5e1', dpr);
  if (state.ship?.frame === 'mars') {
    path(ctx, trajectoryPoints(state.ship.el), k, '#22d3ee', false, dpr);
    const [x, y] = toScreen(positionAt(state.ship.el, state.t), k);
    ship(ctx, x, y, dpr);
    label(ctx, 'Órbita 300 × 33.000 km', -R_CAPTURE_APO * k * 0.9, -fit * 0.4, '#67e8f9', dpr);
  } else {
    const rp = MARS.radius + 300e3;
    const ra = R_CAPTURE_APO;
    const el = { a: (rp + ra) / 2, e: (ra - rp) / (ra + rp), omega: 0, dir: 1 };
    path(ctx, trajectoryPoints(el), k, '#fb923c', true, dpr);
    label(ctx, 'Órbita de captura planejada', -R_CAPTURE_APO * k * 0.9, -fit * 0.4, '#fdba74', dpr);
    ship(ctx, fit * 0.4, -fit * 0.6, dpr);
    label(ctx, 'Nave chegando', fit * 0.4, -fit * 0.6, '#67e8f9', dpr);
  }
}

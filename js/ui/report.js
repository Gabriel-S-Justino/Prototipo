// Relatório final da missão.
import { MISSION } from '../data/mission.js';
import { createState } from '../game/mission.js';
import { el, fmt } from './dom.js';
import { formatDate } from './panels.js';

const TITLE = { success: 'Missão cumprida', partial: 'Sucesso parcial', failure: 'Missão perdida' };

export function renderReport(state, act) {
  const r = state.result;
  return el('section', { class: 'report' },
    el('div', { class: `banner ${r.outcome}` },
      el('p', { class: 'eyebrow' }, `Relatório · ${MISSION.name}`),
      el('h2', {}, TITLE[r.outcome]),
      el('p', { class: 'stars', 'aria-label': `${r.stars} de 3 estrelas` }, '★'.repeat(r.stars), el('span', { class: 'off' }, '★'.repeat(3 - r.stars))),
      el('dl', { class: 'facts' },
        el('div', {}, el('dt', {}, 'Pontuação'), el('dd', {}, fmt(r.score))),
        el('div', {}, el('dt', {}, 'Ciência'), el('dd', {}, `${fmt(r.science)} / ${MISSION.scienceTarget}`)),
        el('div', {}, el('dt', {}, 'Orçamento sobrando'), el('dd', {}, `US$ ${fmt(r.budgetLeft)} M`)),
        el('div', {}, el('dt', {}, 'Δv sobrando'), el('dd', {}, `${fmt(r.deltaVLeft)} m/s`)))),
    el('div', { class: 'panel' },
      el('h3', {}, 'O que a física explica'),
      el('ul', {}, r.lessons.map((l) => el('li', {}, l)))),
    state.timeline.length
      ? el('div', { class: 'panel scroll' },
          el('h3', {}, 'Operações turno a turno'),
          el('table', { class: 'table' },
            el('thead', {}, el('tr', {}, ['Turno', 'Data', 'Terra–Marte', 'Atraso', 'Energia', 'Enviado', 'Ciência'].map((h) => el('th', {}, h)))),
            el('tbody', {}, state.timeline.map((t) => el('tr', {},
              el('td', {}, t.turn), el('td', {}, formatDate(t.t)), el('td', {}, `${fmt(t.distAU, 2)} UA`), el('td', {}, `${fmt(t.delay / 60, 1)} min`),
              el('td', {}, `${fmt(t.consumption)} / ${fmt(t.generation)} W`), el('td', {}, `${fmt(t.downlink, 1)} Gbit`), el('td', {}, fmt(t.science)))))))
      : null,
    el('div', { class: 'panel log' },
      el('h3', {}, 'Diário de bordo'),
      el('ol', {}, state.log.map((e) => el('li', { class: e.ok === false ? 'bad' : '' }, el('strong', {}, `${formatDate(e.t)} · ${e.title}: `), e.text)))),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn primary', onclick: () => act((s) => {
        const design = s.design;
        Object.assign(s, createState(), { design, phase: 'hangar' });
      }) }, 'Ajustar o foguete e tentar de novo')));
}

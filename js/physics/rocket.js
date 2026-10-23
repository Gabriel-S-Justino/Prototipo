// Foguete em estágios. Massas em toneladas, velocidades em m/s.
import { G0 } from '../data/constants.js';
import { DECOUPLER, rocketPart } from '../data/parts.js';

/** Equação do foguete de Tsiolkovsky: Δv = Isp·g0·ln(m0/mf). */
export function rocketEquation(isp, m0, mf) {
  return mf > 0 && m0 > mf ? isp * G0 * Math.log(m0 / mf) : 0;
}

/** Converte a lista de peças de um estágio em { wet, dry, isp, thrust, cost }. */
export function summarizeStage(partIds, hasDecoupler) {
  const parts = partIds.map(rocketPart).filter(Boolean);
  const engine = parts.find((p) => p.kind === 'engine');
  const extra = hasDecoupler ? DECOUPLER.mass : 0;
  return {
    wet: parts.reduce((s, p) => s + p.wet, 0) + extra,
    dry: parts.reduce((s, p) => s + p.dry, 0) + extra,
    isp: engine ? engine.isp : 0,
    thrust: parts.filter((p) => p.kind === 'engine').reduce((s, p) => s + p.thrust, 0),
    cost: parts.reduce((s, p) => s + p.cost, 0) + (hasDecoupler ? DECOUPLER.cost : 0),
  };
}

/** Monta o foguete: estágios não vazios, de baixo (0) para cima. Desacoplador em todos menos o de cima. */
export function buildRocket(stagePartIds, payloadT) {
  const used = stagePartIds.filter((s) => s.length > 0);
  const stages = used.map((ids, i) => {
    const s = summarizeStage(ids, i < used.length - 1);
    return { ...s, prop: s.wet - s.dry };
  });
  return { stages, payload: payloadT };
}

/** Massa total (t) do estágio i para cima. */
function massFrom(rocket, i) {
  let m = rocket.payload;
  for (let j = i; j < rocket.stages.length; j++) m += rocket.stages[j].dry + rocket.stages[j].prop;
  return m;
}

/** Δv e TWR de cada estágio (TWR com o estágio cheio, em relação à gravidade da Terra). */
export function stageStats(rocket) {
  return rocket.stages.map((s, i) => {
    const m0 = massFrom(rocket, i);
    const mf = m0 - s.prop;
    return { m0, mf, deltaV: rocketEquation(s.isp, m0, mf), twr: (s.thrust * 1000) / (m0 * 1000 * G0) };
  });
}

export function totalDeltaV(rocket) {
  return stageStats(rocket).reduce((sum, s) => sum + s.deltaV, 0);
}

/**
 * Queima Δv consumindo os estágios de baixo para cima; estágio vazio é descartado.
 * Retorna { rocket, achieved, missing, dropped }.
 */
export function burn(rocket, dv) {
  const next = { payload: rocket.payload, stages: rocket.stages.map((s) => ({ ...s })) };
  let remaining = dv;
  let dropped = 0;
  while (remaining > 1e-9 && next.stages.length > 0) {
    const s = next.stages[0];
    const m0 = massFrom(next, 0);
    const ve = s.isp * G0;
    const needed = ve > 0 ? m0 - m0 / Math.exp(remaining / ve) : Infinity;
    if (needed <= s.prop) {
      s.prop -= needed;
      remaining = 0;
    } else {
      remaining -= rocketEquation(s.isp, m0, m0 - s.prop);
      next.stages.shift();
      dropped += 1;
    }
  }
  return { rocket: next, achieved: dv - remaining, missing: remaining, dropped };
}

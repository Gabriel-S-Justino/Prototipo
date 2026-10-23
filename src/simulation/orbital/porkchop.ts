// Gráfico de oportunidades (porkchop plot): grade de soluções de Lambert por data de partida × tempo de voo.
// Métrica: C3 de partida (km²/s²). Células sem solução válida ficam marcadas como inválidas, nunca interpoladas.
import type { Ephemeris } from './ephemeris';
import { computeTransfer } from './transfer';

export interface PorkchopParams {
  depStartJd: number;
  depEndJd: number;
  tofMinDays: number;
  tofMaxDays: number;
  /** Número de colunas (datas de partida) e linhas (tempos de voo). */
  depSteps: number;
  tofSteps: number;
}

export interface PorkchopGrid {
  params: PorkchopParams;
  depJds: number[];
  tofs: number[];
  /** C3 por célula [linha tof][coluna partida]; NaN = sem solução. */
  c3: Float64Array;
  vInfArr: Float64Array;
  valid: number;
  invalid: number;
  best: { depJd: number; tofDays: number; c3: number } | null;
  elapsedMs: number;
}

export const DEFAULT_PORKCHOP: Omit<PorkchopParams, 'depStartJd' | 'depEndJd'> = { tofMinDays: 140, tofMaxDays: 440, depSteps: 94, tofSteps: 100 };

export function validateParams(p: PorkchopParams): string | null {
  if (!(p.depEndJd > p.depStartJd)) return 'A data final de partida deve ser posterior à inicial.';
  if (!(p.tofMaxDays > p.tofMinDays) || p.tofMinDays < 30) return 'Tempos de voo inválidos (mínimo de 30 dias).';
  if (p.depSteps < 2 || p.tofSteps < 2 || p.depSteps * p.tofSteps > 40000) return 'Resolução deve ter entre 2×2 e 40.000 células.';
  return null;
}

export function axis(start: number, end: number, steps: number) {
  return Array.from({ length: steps }, (_, i) => start + ((end - start) * i) / (steps - 1));
}

/** Calcula a grade em blocos de colunas, chamando onProgress a cada coluna (para Web Worker). */
export function computePorkchop(eph: Ephemeris, params: PorkchopParams, onProgress?: (done: number, total: number) => void): PorkchopGrid {
  const err = validateParams(params);
  if (err) throw new RangeError(err);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const depJds = axis(params.depStartJd, params.depEndJd, params.depSteps);
  const tofs = axis(params.tofMinDays, params.tofMaxDays, params.tofSteps);
  const n = depJds.length * tofs.length;
  const c3 = new Float64Array(n).fill(NaN);
  const vInfArr = new Float64Array(n).fill(NaN);
  let valid = 0;
  let best: PorkchopGrid['best'] = null;
  for (let i = 0; i < depJds.length; i++) {
    for (let j = 0; j < tofs.length; j++) {
      const t = computeTransfer(eph, depJds[i], tofs[j]);
      if (!t.ok) continue;
      const k = j * depJds.length + i;
      c3[k] = t.c3;
      vInfArr[k] = t.vInfArr;
      valid++;
      if (!best || t.c3 < best.c3) best = { depJd: depJds[i], tofDays: tofs[j], c3: t.c3 };
    }
    onProgress?.(i + 1, depJds.length);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { params, depJds, tofs, c3, vInfArr, valid, invalid: n - valid, best, elapsedMs: t1 - t0 };
}

export function cacheKey(params: PorkchopParams, ephemerisKey: string) {
  return `${ephemerisKey}|${params.depStartJd}|${params.depEndJd}|${params.tofMinDays}|${params.tofMaxDays}|${params.depSteps}|${params.tofSteps}`;
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { fmt, formatJd, jdToIso } from '../../domain/units';
import type { PorkchopGrid } from '../../simulation/orbital/porkchop';

const W = 760;
const H = 460;
const M = { left: 62, right: 16, top: 14, bottom: 52 };
const STOPS: [number, [number, number, number]][] = [
  [0, [253, 231, 37]], [0.25, [94, 201, 98]], [0.5, [33, 145, 140]], [0.75, [59, 82, 139]], [1, [68, 1, 84]],
];

/** Escala tipo viridis: valores baixos (melhores) claros, altos escuros. */
export function colorFor(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [p0, c0] = STOPS[i - 1];
      const [p1, c1] = STOPS[i];
      const k = (x - p0) / (p1 - p0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(',')})`;
    }
  }
  return 'rgb(68,1,84)';
}

export interface PorkchopProps {
  grid: PorkchopGrid;
  selected: { depJd: number; tofDays: number };
  onSelect: (depJd: number, tofDays: number) => void;
  /** Intervalo da escala de cores (km²/s²). */
  range?: [number, number];
}

export function Porkchop({ grid, selected, onSelect, range }: PorkchopProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const nx = grid.depJds.length;
  const ny = grid.tofs.length;
  const lo = range?.[0] ?? Math.floor(grid.best?.c3 ?? 0);
  const hi = range?.[1] ?? lo + 30;
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const cellW = pw / nx;
  const cellH = ph / ny;
  const xOf = (i: number) => M.left + i * cellW;
  const yOf = (j: number) => M.top + (ny - 1 - j) * cellH;
  const nearest = (arr: number[], v: number) => arr.reduce((b, x, k) => (Math.abs(x - v) < Math.abs(arr[b] - v) ? k : b), 0);
  const sel = { i: nearest(grid.depJds, selected.depJd), j: nearest(grid.tofs, selected.tofDays) };

  const image = useMemo(() => {
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#03060d';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const v = grid.c3[j * nx + i];
        if (Number.isNaN(v)) {
          ctx.fillStyle = '#1b2232';
          ctx.fillRect(xOf(i), yOf(j), cellW + 0.5, cellH + 0.5);
          ctx.strokeStyle = '#2b3448';
          ctx.beginPath();
          ctx.moveTo(xOf(i), yOf(j) + cellH);
          ctx.lineTo(xOf(i) + cellW, yOf(j));
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = v > hi ? '#2a0f35' : colorFor((v - lo) / (hi - lo));
        ctx.fillRect(xOf(i), yOf(j), cellW + 0.5, cellH + 0.5);
      }
    }
    // Isolinhas de C3 (bordas entre células que cruzam o nível).
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (const level of [10, 12, 15, 20, 30]) {
      ctx.beginPath();
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const v = grid.c3[j * nx + i];
        if (Number.isNaN(v)) continue;
        const r = i + 1 < nx ? grid.c3[j * nx + i + 1] : NaN;
        const u = j + 1 < ny ? grid.c3[(j + 1) * nx + i] : NaN;
        if (!Number.isNaN(r) && (v - level) * (r - level) < 0) { ctx.moveTo(xOf(i + 1), yOf(j)); ctx.lineTo(xOf(i + 1), yOf(j) + cellH); }
        if (!Number.isNaN(u) && (v - level) * (u - level) < 0) { ctx.moveTo(xOf(i), yOf(j)); ctx.lineTo(xOf(i) + cellW, yOf(j)); }
      }
      ctx.stroke();
    }
    // Eixos
    ctx.fillStyle = '#9aa8bf';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const xTicks = 6;
    for (let k = 0; k <= xTicks; k++) {
      const i = Math.round((k / xTicks) * (nx - 1));
      const x = xOf(i) + cellW / 2;
      ctx.fillText(new Date((grid.depJds[i] - 2440587.5) * 864e5).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }), x, H - M.bottom + 18);
    }
    ctx.fillText('Data de partida', M.left + pw / 2, H - 10);
    ctx.textAlign = 'right';
    for (let k = 0; k <= 6; k++) {
      const j = Math.round((k / 6) * (ny - 1));
      ctx.fillText(`${Math.round(grid.tofs[j])}`, M.left - 8, yOf(j) + cellH / 2 + 4);
    }
    ctx.save();
    ctx.translate(16, M.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Tempo de voo (dias)', 0, 0);
    ctx.restore();
    return off;
  }, [grid, lo, hi]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !image) return;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(image, 0, 0);
    const mark = (i: number, j: number, color: string, r: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xOf(i) + cellW / 2, yOf(j) + cellH / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    if (grid.best) {
      const bi = nearest(grid.depJds, grid.best.depJd);
      const bj = nearest(grid.tofs, grid.best.tofDays);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('★', xOf(bi) + cellW / 2, yOf(bj) + cellH / 2 + 5);
    }
    mark(sel.i, sel.j, '#5cc8ff', 8);
    mark(sel.i, sel.j, '#02040a', 10);
    if (hover) mark(hover.i, hover.j, 'rgba(255,255,255,0.8)', 5);
  }, [image, sel.i, sel.j, hover, grid.best]);

  const cellAt = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const y = ((event.clientY - rect.top) / rect.height) * H;
    const i = Math.floor((x - M.left) / cellW);
    const j = ny - 1 - Math.floor((y - M.top) / cellH);
    return i >= 0 && i < nx && j >= 0 && j < ny ? { i, j } : null;
  };
  const keyMove = (e: KeyboardEvent) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = Math.min(nx - 1, Math.max(0, sel.i + d[0]));
    const j = Math.min(ny - 1, Math.max(0, sel.j + d[1]));
    onSelect(grid.depJds[i], grid.tofs[j]);
  };
  const hv = hover ? grid.c3[hover.j * nx + hover.i] : NaN;
  const sv = grid.c3[sel.j * nx + sel.i];
  return (
    <div className="porkchop-wrap stack">
      <canvas
        ref={ref}
        width={W}
        height={H}
        tabIndex={0}
        role="img"
        aria-label={`Gráfico de oportunidades: C3 por data de partida e tempo de voo. Seleção: partida ${jdToIso(grid.depJds[sel.i])}, ${Math.round(grid.tofs[sel.j])} dias, C3 ${Number.isNaN(sv) ? 'sem solução' : fmt(sv, 2)}. Use as setas para mover a seleção.`}
        onMouseMove={(e) => setHover(cellAt(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { const c = cellAt(e); if (c) onSelect(grid.depJds[c.i], grid.tofs[c.j]); }}
        onKeyDown={keyMove}
      />
      <div className="spread small">
        <div className="row" style={{ minWidth: 260 }}>
          <span>C3 {fmt(lo)}</span>
          <div className="legend-bar" style={{ flex: 1, minWidth: 120, background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => colorFor(t)).join(',')})` }} aria-hidden="true" />
          <span>{fmt(hi)} km²/s²</span>
          <span className="muted">· ▨ sem solução · ★ melhor · ◯ seleção · linhas: C3 = 10, 12, 15, 20, 30</span>
        </div>
        <span className="muted" aria-live="polite">
          {hover ? `${formatJd(grid.depJds[hover.i])} · ${Math.round(grid.tofs[hover.j])} d · ${Number.isNaN(hv) ? 'sem solução de Lambert' : `C3 ${fmt(hv, 2)}`}` : 'Passe o mouse ou use as setas'}
        </span>
      </div>
    </div>
  );
}

// Executa o porkchop num Web Worker (com cache por parâmetros e fonte de efemérides).
// Sem suporte a Worker (ex.: testes), calcula em blocos assíncronos para não travar a interface.
import { ephemerisFrom, type EphemerisDescriptor } from '../simulation/orbital/ephemeris';
import { cacheKey, computePorkchop, type PorkchopGrid, type PorkchopParams } from '../simulation/orbital/porkchop';
import type { PorkchopMessage } from '../workers/porkchop.worker';

const cache = new Map<string, PorkchopGrid>();
let worker: Worker | null = null;
let seq = 0;

export function ephemerisKey(desc: EphemerisDescriptor) {
  return desc.kind === 'standish' ? 'standish' : `horizons:${desc.retrievedAt}`;
}

export function runPorkchop(descriptor: EphemerisDescriptor, params: PorkchopParams, onProgress: (fraction: number) => void): { promise: Promise<PorkchopGrid & { cached: boolean }>; cancel: () => void } {
  const key = cacheKey(params, ephemerisKey(descriptor));
  const hit = cache.get(key);
  if (hit) return { promise: Promise.resolve({ ...hit, cached: true }), cancel: () => {} };
  let cancelled = false;
  if (typeof Worker === 'undefined') {
    const promise = new Promise<PorkchopGrid & { cached: boolean }>((resolve, reject) => {
      setTimeout(() => {
        if (cancelled) return reject(new Error('cancelado'));
        try {
          const grid = computePorkchop(ephemerisFrom(descriptor), params, (d, t) => onProgress(d / t));
          cache.set(key, grid);
          resolve({ ...grid, cached: false });
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
    return { promise, cancel: () => { cancelled = true; } };
  }
  worker ??= new Worker(new URL('../workers/porkchop.worker.ts', import.meta.url), { type: 'module' });
  const id = ++seq;
  const w = worker;
  const promise = new Promise<PorkchopGrid & { cached: boolean }>((resolve, reject) => {
    const listener = (event: MessageEvent<PorkchopMessage>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (cancelled) return w.removeEventListener('message', listener);
      if (msg.type === 'progress') onProgress(msg.done / msg.total);
      else {
        w.removeEventListener('message', listener);
        if (msg.type === 'result') {
          cache.set(key, msg.grid);
          resolve({ ...msg.grid, cached: false });
        } else reject(new Error(msg.message));
      }
    };
    w.addEventListener('message', listener);
    w.postMessage({ id, descriptor, params });
  });
  return { promise, cancel: () => { cancelled = true; } };
}

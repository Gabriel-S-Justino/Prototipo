// Web Worker: calcula o porkchop fora da thread principal e reporta o progresso.
import { ephemerisFrom, type EphemerisDescriptor } from '../simulation/orbital/ephemeris';
import { computePorkchop, type PorkchopParams } from '../simulation/orbital/porkchop';

export type PorkchopRequest = { id: number; descriptor: EphemerisDescriptor; params: PorkchopParams };
export type PorkchopMessage =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; grid: ReturnType<typeof computePorkchop> }
  | { id: number; type: 'error'; message: string };

self.onmessage = (event: MessageEvent<PorkchopRequest>) => {
  const { id, descriptor, params } = event.data;
  try {
    const eph = ephemerisFrom(descriptor);
    let last = 0;
    const grid = computePorkchop(eph, params, (done, total) => {
      const now = Date.now();
      if (now - last > 50 || done === total) {
        last = now;
        (self as unknown as Worker).postMessage({ id, type: 'progress', done, total } satisfies PorkchopMessage);
      }
    });
    (self as unknown as Worker).postMessage({ id, type: 'result', grid } satisfies PorkchopMessage, [grid.c3.buffer, grid.vInfArr.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, type: 'error', message: (error as Error).message } satisfies PorkchopMessage);
  }
};

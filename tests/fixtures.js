// Foguete de referência de Arquitetura.md, seção 9.
export const REFERENCE_DESIGN = {
  stages: [
    ['tank-l', 'tank-l', 'tank-l', 'engine-main', 'engine-main', 'engine-main'],
    ['tank-m', 'tank-m', 'tank-m', 'engine-upper'],
    ['tank-s', 'tank-s', 'engine-vac'],
  ],
  probe: ['probe-core', 'solar-large', 'battery', 'antenna-high', 'camera', 'spectrometer', 'radar', 'magnetometer', 'shield-radiation', 'shield-mm'],
};

export function near(actual, expected, tolerance) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`esperado ${expected} ± ${tolerance}, veio ${actual}`);
  }
}

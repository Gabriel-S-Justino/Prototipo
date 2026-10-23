// Elementos keplerianos aproximados dos planetas — E. M. Standish (JPL/Caltech),
// "Keplerian Elements for Approximate Positions of the Major Planets", Tabela 1 (válida 1800–2050 d.C.).
// Referencial: eclíptica e equinócio médios J2000, heliocêntrico. Unidades: UA, graus, por século juliano (TDB).
// Para a Terra, a tabela descreve o baricentro Terra–Lua (diferença de ~4.700 km e ~12 m/s em relação à Terra).
// Fonte: https://ssd.jpl.nasa.gov/planets/approx_pos.html

export interface KeplerianSet {
  a: [number, number];
  e: [number, number];
  I: [number, number];
  L: [number, number];
  longPeri: [number, number];
  longNode: [number, number];
}

export type BodyId = 'earth' | 'mars';

export const STANDISH_1800_2050: Record<BodyId, KeplerianSet> = {
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    longPeri: [102.93768193, 0.32327364],
    longNode: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    longPeri: [-23.94362959, 0.44441088],
    longNode: [49.55953891, -0.29257343],
  },
};

/** Intervalo de validade da Tabela 1 (JD de 1800-01-01 a 2050-12-31). */
export const STANDISH_VALID_JD: [number, number] = [2_378_496.5, 2_470_171.5];

/** Códigos de corpo do JPL Horizons. */
export const HORIZONS_ID: Record<BodyId, string> = { earth: '399', mars: '499' };

export const BODY_NAME: Record<BodyId, string> = { earth: 'Terra', mars: 'Marte' };

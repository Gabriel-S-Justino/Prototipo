// Órbitas circulares e coplanares (simplificação do jogo).
// a, L0 e Ldot: JPL "Approximate Positions of the Planets" (Standish), tabela 1800–2050.
// mu, raio e SOI: NASA Planetary Fact Sheet. Cores e tamanhos de desenho são só visuais.
export const PLANETS = [
  { id: 'mercury', name: 'Mercúrio', a: 0.3871, L0: 252.25032, Ldot: 149472.67411, color: '#a8a29e', size: 3 },
  { id: 'venus', name: 'Vênus', a: 0.72333, L0: 181.9791, Ldot: 58517.81539, color: '#fcd34d', size: 5 },
  {
    id: 'earth', name: 'Terra', a: 1.0, L0: 100.46457, Ldot: 35999.37245, color: '#60a5fa', size: 6,
    mu: 3.986004418e14, radius: 6371e3, soi: 924e6,
  },
  {
    id: 'mars', name: 'Marte', a: 1.52371, L0: 355.44657, Ldot: 19140.30268, color: '#f97316', size: 5,
    mu: 4.282837e13, radius: 3389.5e3, soi: 577e6,
  },
];

export const EARTH = PLANETS.find((p) => p.id === 'earth');
export const MARS = PLANETS.find((p) => p.id === 'mars');

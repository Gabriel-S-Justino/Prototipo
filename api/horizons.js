// Proxy server-side para o JPL Horizons. A API JPL não deve ser chamada diretamente do browser.
const ALLOWED_DAYS = 2;
const CACHE_SECONDS = 3600;

import { parseHorizonsVectors } from './horizons-utils.js';

async function fetchBody(command, date) {
  const tomorrow = new Date(`${date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + ALLOWED_DAYS);
  const params = new URLSearchParams({
    format: 'json', COMMAND: command, OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', EPHEM_TYPE: 'VECTORS',
    CENTER: '@sun', START_TIME: `${date} 00:00`, STOP_TIME: `${tomorrow.toISOString().slice(0, 10)} 00:00`,
    STEP_SIZE: '1 d', VEC_TABLE: '2', OUT_UNITS: 'AU-D', REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF', VEC_CORR: 'NONE', CSV_FORMAT: 'YES'
  });
  const response = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`JPL Horizons respondeu HTTP ${response.status}.`);
  return parseHorizonsVectors(await response.json());
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const date = typeof req.query?.date === 'string' ? req.query.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return res.status(400).json({ error: 'Informe date no formato YYYY-MM-DD.' });
  }
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (parsedDate.toISOString().slice(0, 10) !== date || parsedDate.getUTCFullYear() < 1800 || parsedDate.getUTCFullYear() > 2050) {
    return res.status(400).json({ error: 'A data deve ser válida e estar entre 1800 e 2050.' });
  }
  try {
    const [earth, mars] = await Promise.all([fetchBody('399', date), fetchBody('499', date)]);
    return res.status(200).json({ source: 'NASA/JPL Horizons', date, units: { position: 'AU', velocity: 'AU/day' }, frame: 'heliocentric ecliptic J2000', earth, mars });
  } catch (error) {
    console.error('[horizons]', error?.message || error);
    return res.status(502).json({ error: 'Não foi possível obter efemérides do JPL agora. A simulação aproximada continua disponível.' });
  }
}

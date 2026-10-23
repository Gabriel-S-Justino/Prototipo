// Cliente para a função backend /api/horizons; nunca consulta o endpoint JPL diretamente.
const cache = new Map();

export async function fetchHorizonsEphemerides(date, { signal } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError('Data inválida para consulta de efemérides.');
  if (cache.has(date)) return cache.get(date);
  const response = await fetch(`/api/horizons?date=${encodeURIComponent(date)}`, {
    headers: { Accept: 'application/json' }, signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Falha ao consultar efemérides (HTTP ${response.status}).`);
  if (!payload.earth?.positionAu || !payload.mars?.positionAu) throw new Error('Resposta incompleta de efemérides.');
  cache.set(date, payload);
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return payload;
}

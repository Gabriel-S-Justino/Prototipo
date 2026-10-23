/** Converte o bloco CSV VECTORS do JPL Horizons em um estado heliocêntrico. */
export function parseHorizonsVectors(payload) {
  if (payload?.error) throw new Error(payload.error);
  const result = payload?.result;
  if (typeof result !== 'string') throw new Error('Resposta inesperada do JPL Horizons.');
  const section = result.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!section) throw new Error('O JPL não retornou vetores para esta data.');
  const rows = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of rows) {
    const cols = line.split(',').map((part) => part.trim());
    if (cols.length >= 8 && /^\d/.test(cols[0])) {
      const values = cols.slice(2, 8).map(Number);
      if (values.every(Number.isFinite)) {
        return { jd: Number(cols[0]), timestamp: cols[1], positionAu: values.slice(0, 3), velocityAuPerDay: values.slice(3, 6) };
      }
    }
  }
  throw new Error('Não foi possível interpretar os vetores do JPL Horizons.');
}

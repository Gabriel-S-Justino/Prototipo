// Validação científica: compara o modelo com valores de referência e IMPRIME os desvios.
// Rode com `npm run validate:science`. Os desvios do modelo de lançador são esperados e estão documentados
// em docs/FOGUETES.md; aqui eles ficam visíveis em vez de escondidos por tolerâncias frouxas.
import { afterAll, describe, expect, it } from 'vitest';
import { isoToJd } from '../../domain/units';
import { standishEphemeris } from '../orbital/ephemeris';
import { computeTransfer } from '../orbital/transfer';
import { hohmannEarthMars } from '../orbital/hohmann';
import { findConjunction } from '../mission/geometry';
import { PRESETS } from '../../data/launchers';
import { assembleVehicle } from '../rocket/vehicle';
import { payloadCapacity } from '../rocket/performance';

const rows: { item: string; modelo: string; referencia: string; desvio: string; fonte: string }[] = [];
const pct = (m: number, r: number) => `${(((m - r) / r) * 100).toFixed(1)}%`;

afterAll(() => {
  console.table(rows);
});

describe('validação científica', () => {
  it('Hohmann Terra–Marte (órbitas circulares)', () => {
    const h = hohmannEarthMars();
    rows.push({ item: 'Hohmann: duração (dias)', modelo: h.days.toFixed(1), referencia: '258,9', desvio: pct(h.days, 258.9), fonte: 'Cálculo analítico clássico (Curtis, cap. 8)' });
    expect(Math.abs(h.days - 258.9)).toBeLessThan(0.5);
  });

  it('C3 da janela de 2026 (31/10/2026, 293 dias)', () => {
    const t = computeTransfer(standishEphemeris, isoToJd('2026-10-31'), 293);
    if (!t.ok) throw new Error(t.reason);
    // Referência: o mesmo cálculo de Lambert; a comparação com vetores do Horizons não pôde ser feita
    // no ambiente de desenvolvimento (rede bloqueada). Ver docs/DADOS_NASA.md.
    rows.push({ item: 'C3 31/10/2026 + 293 d (km²/s²)', modelo: t.c3.toFixed(3), referencia: 'faixa 8,5–10 da janela de 2026', desvio: '—', fonte: 'Ordem de grandeza das janelas Terra–Marte (porkchops publicados da NASA)' });
    expect(t.c3).toBeGreaterThan(8.5);
    expect(t.c3).toBeLessThan(10);
  });

  it('conjunção solar de Marte de 2028', () => {
    const c = findConjunction(standishEphemeris, isoToJd('2027-10-01'), isoToJd('2028-08-01'));
    const ref = isoToJd('2028-03-21');
    rows.push({ item: 'Conjunção solar de Marte (dias de diferença)', modelo: (c.jd - ref).toFixed(1), referencia: '0 (≈ 21/03/2028)', desvio: `${(c.jd - ref).toFixed(1)} d`, fonte: 'Geometria Sol–Terra–Marte; conferir com o calendário de conjunções da NASA' });
    expect(Math.abs(c.jd - ref)).toBeLessThan(5);
  });

  it('capacidade dos lançadores para Marte (valores publicados)', () => {
    const cap = (id: string, c3: number) => payloadCapacity(assembleVehicle(PRESETS[id].config), c3);
    // SpaceX publica a capacidade "para Marte" sem a C3 exata; usamos C3 ≈ 9 km²/s² (janela típica).
    const f9 = cap('falcon-9', 9);
    const fh = cap('falcon-heavy', 9);
    rows.push({ item: 'Falcon 9 descartável → Marte (kg)', modelo: f9.toFixed(0), referencia: '4020', desvio: pct(f9, 4020), fonte: 'spacex.com/vehicles/falcon-9 (C3 não informada)' });
    rows.push({ item: 'Falcon Heavy descartável → Marte (kg)', modelo: fh.toFixed(0), referencia: '16800', desvio: pct(fh, 16800), fonte: 'spacex.com/vehicles/falcon-heavy (C3 não informada)' });
    const mro = cap('atlas-401', 16.4);
    const perse = cap('atlas-541', 14.5);
    rows.push({ item: 'Atlas V 401 a C3 16,4 ≥ MRO (kg)', modelo: mro.toFixed(0), referencia: '≥ 2180', desvio: mro >= 2180 ? 'ok' : 'abaixo', fonte: 'NASA, kit de imprensa da MRO (2005)' });
    rows.push({ item: 'Atlas V 541 a C3 14,5 ≥ Perseverance (kg)', modelo: perse.toFixed(0), referencia: '≥ 4050', desvio: perse >= 4050 ? 'ok' : 'abaixo', fonte: 'NASA, kit de imprensa Mars 2020' });
    // Só os limites inferiores de missões reais são obrigatórios; os desvios da SpaceX ficam registrados.
    expect(mro).toBeGreaterThan(2180);
    expect(perse).toBeGreaterThan(4050);
  });
});

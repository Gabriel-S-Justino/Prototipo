import { describe, expect, it, vi } from 'vitest';
import { buildHorizonsUrl, HorizonsError, parseHorizonsVectors, queryHorizons, validateQuery } from './horizonsCore';
import { buildDonkiUrl, calibrationFromCmes, DonkiError, parseDonkiCmeAnalysis, queryDonki } from './donkiCore';
import { loadDonkiCalibration, loadHorizonsEphemeris, ServiceUnavailable } from './client';
import { handleDonki, handleHorizons } from '../../../api/handlers';
import { HEADER, horizonsPayload, vectorLines } from './__fixtures__/horizons';
import { standishState } from '../../simulation/orbital/ephemeris';
import { isoToJd } from '../../domain/units';

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const status = (code: number, body: unknown = { error: 'x' }) => vi.fn(async () => new Response(JSON.stringify(body), { status: code })) as unknown as typeof fetch;
const kindOf = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as HorizonsError).kind);

describe('Horizons: consulta', () => {
  it('valida parâmetros', () => {
    expect(validateQuery({ body: 'mars', start: '2026-10-01', stop: '2026-11-01' })).toEqual({ body: 'mars', start: '2026-10-01', stop: '2026-11-01', stepDays: 1 });
    expect(() => validateQuery({ body: 'venus', start: '2026-10-01', stop: '2026-11-01' })).toThrow(HorizonsError);
    expect(() => validateQuery({ body: 'mars', start: '2026-11-01', stop: '2026-10-01' })).toThrow(/Intervalo/);
    expect(() => validateQuery({ body: 'mars', start: '01/10/2026', stop: '2026-11-01' })).toThrow(/formato/);
    expect(() => validateQuery({ body: 'mars', start: '2020-01-01', stop: '2026-01-01' })).toThrow(/máximo/);
    expect(() => validateQuery({ body: 'mars', start: '2026-10-01', stop: '2026-11-01', stepDays: 0.5 })).toThrow(/Passo/);
  });
  it('pede vetores heliocêntricos na eclíptica, km e km/s, CSV', () => {
    const url = new URL(buildHorizonsUrl({ body: 'mars', start: '2026-10-01', stop: '2026-11-01', stepDays: 1 }));
    expect(url.searchParams.get('COMMAND')).toBe("'499'");
    expect(url.searchParams.get('CENTER')).toBe("'500@10'");
    expect(url.searchParams.get('EPHEM_TYPE')).toBe('VECTORS');
    expect(url.searchParams.get('REF_PLANE')).toBe('ECLIPTIC');
    expect(url.searchParams.get('OUT_UNITS')).toBe('KM-S');
    expect(url.searchParams.get('CSV_FORMAT')).toBe('YES');
  });
});

describe('Horizons: interpretação da resposta (fixtures sintéticas)', () => {
  it('lê uma tabela válida sem alterar os números', () => {
    const samples = parseHorizonsVectors(horizonsPayload('earth'), 'earth');
    expect(samples).toHaveLength(10);
    const ref = standishState('earth', isoToJd('2026-10-01'));
    expect(samples[0].r[0]).toBeCloseTo(ref.r[0], 3);
    expect(samples[0].v[1]).toBeCloseTo(ref.v[1], 9);
  });
  it('rejeita JSON sem result, erro do Horizons e tabela ausente', () => {
    expect(() => parseHorizonsVectors(null, 'earth')).toThrow(/objeto/);
    expect(() => parseHorizonsVectors({}, 'earth')).toThrow(/result/);
    expect(() => parseHorizonsVectors({ error: 'No ephemeris for target' }, 'earth')).toThrow(/No ephemeris/);
    expect(() => parseHorizonsVectors({ result: HEADER }, 'earth')).toThrow(/SOE/);
  });
  it('rejeita cabeçalho com referencial ou unidades diferentes', () => {
    expect(() => parseHorizonsVectors(horizonsPayload('earth', '2026-10-01', 5, HEADER.replace('Ecliptic of J2000.0', 'Earth mean equator')), 'earth')).toThrow(/eclíptica/);
    expect(() => parseHorizonsVectors(horizonsPayload('earth', '2026-10-01', 5, HEADER.replace('KM-S', 'AU-D')), 'earth')).toThrow(/unidades/);
  });
  it('rejeita linha incompleta e valor não numérico', () => {
    const lines = vectorLines('earth', '2026-10-01', 5);
    expect(() => parseHorizonsVectors(horizonsPayload('earth', '', 0, HEADER, [...lines.slice(0, 3), '2461000.5, A.D. x, 1, 2']), 'earth')).toThrow(/incompleta/);
    expect(() => parseHorizonsVectors(horizonsPayload('earth', '', 0, HEADER, [...lines.slice(0, 3), lines[3].replace(/, -?\d\.\d+e[+-]\d+,$/, ', n/a,')]), 'earth')).toThrow(/numérico/);
  });
  it('rejeita valores fisicamente implausíveis (ex.: Marte entregue no lugar da Terra, ou UA no lugar de km)', () => {
    expect(() => parseHorizonsVectors(horizonsPayload('mars'), 'earth')).toThrow(/implausível/);
    const au = vectorLines('earth', '2026-10-01', 3).map((l) => {
      const c = l.replace(/,$/, '').split(', ');
      return [c[0], c[1], ...c.slice(2, 8).map((x, i) => String(Number(x) / (i < 3 ? 1.495978707e8 : 1))), ''].join(', ');
    });
    expect(() => parseHorizonsVectors(horizonsPayload('earth', '', 0, HEADER, au), 'earth')).toThrow(/implausível/);
  });
  it('rejeita datas fora de ordem e tabela curta', () => {
    const lines = vectorLines('earth', '2026-10-01', 4);
    expect(() => parseHorizonsVectors(horizonsPayload('earth', '', 0, HEADER, [lines[1], lines[0]]), 'earth')).toThrow(/ordem/);
    expect(() => parseHorizonsVectors(horizonsPayload('earth', '', 0, HEADER, [lines[0]]), 'earth')).toThrow(/menos de duas/);
  });
  it('erros de transporte: HTTP, rede, timeout e JSON inválido', async () => {
    const q = { body: 'earth' as const, start: '2026-10-01', stop: '2026-10-10', stepDays: 1 };
    expect(await kindOf(queryHorizons(q, status(503)))).toBe('http');
    expect(await kindOf(queryHorizons(q, vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch))).toBe('rede');
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    expect(await kindOf(queryHorizons(q, hang, 20))).toBe('timeout');
    expect(await kindOf(queryHorizons(q, vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch))).toBe('formato');
    expect((await queryHorizons(q, ok(horizonsPayload('earth')))).length).toBe(10);
  });
});

describe('DONKI', () => {
  const cmes = [
    { associatedCMEID: 'A', time21_5: '2026-08-01T10:00Z', speed: 800, halfAngle: 30, longitude: 10, latitude: 0 },
    { associatedCMEID: 'A', time21_5: '2026-08-01T10:00Z', speed: 800, halfAngle: 30, longitude: 10, latitude: 0 },
    { associatedCMEID: 'B', time21_5: '2026-08-20T10:00Z', speed: '1200', halfAngle: null, longitude: null, latitude: null },
    { associatedCMEID: 'C', time21_5: null, speed: 900 },
    { associatedCMEID: 'D', time21_5: '2026-09-01T00:00Z', speed: 'rápida' },
  ];
  it('a chave vai na URL do servidor, nunca no cliente', () => {
    expect(buildDonkiUrl('2026-08-01', '2026-09-01', 'SEGREDO')).toContain('api_key=SEGREDO');
  });
  it('descarta registros incompletos sem preencher valores', () => {
    const parsed = parseDonkiCmeAnalysis(cmes);
    expect(parsed.map((c) => c.id)).toEqual(['A', 'A', 'B']);
    expect(parsed[2].halfAngle).toBeNull();
    expect(() => parseDonkiCmeAnalysis({ error: 'x' })).toThrow(DonkiError);
  });
  it('calibra taxa e velocidades sem criar eventos', () => {
    const cal = calibrationFromCmes(parseDonkiCmeAnalysis(cmes), '2026-08-01', '2026-09-30');
    expect(cal.source).toBe('donki');
    expect(cal.speeds).toEqual([800, 1200]);
    expect(cal.ratePerDay).toBeCloseTo(2 / 60, 6);
  });
  it('valida intervalo e trata HTTP 429', async () => {
    await expect(queryDonki('2026-09-01', '2026-08-01', 'k', ok([]))).rejects.toThrow(/inválido/);
    await expect(queryDonki('2026-01-01', '2026-09-01', 'k', ok([]))).rejects.toThrow(/120/);
    await expect(queryDonki('2026-08-01', '2026-09-01', 'k', status(429))).rejects.toThrow(/429/);
  });
});

describe('proxies /api', () => {
  it('Horizons: 200 com metadados de referencial e cache', async () => {
    const r = await handleHorizons({ body: 'earth', start: '2026-10-01', stop: '2026-10-10' }, ok(horizonsPayload('earth')));
    expect(r.status).toBe(200);
    expect((r.body as { frame: { center: string } }).frame.center).toBe('500@10');
    expect(r.headers['Cache-Control']).toMatch(/s-maxage/);
  });
  it('Horizons: 400 para parâmetros, 502 para falha a montante', async () => {
    expect((await handleHorizons({ body: 'pluto' }, ok({}))).status).toBe(400);
    expect((await handleHorizons({ body: 'earth', start: '2026-10-01', stop: '2026-10-10' }, status(500))).status).toBe(502);
  });
  it('DONKI: usa DEMO_KEY sem chave e não devolve a chave', async () => {
    const f = ok([]);
    const r = await handleDonki({ start: '2026-08-01', end: '2026-09-01' }, undefined, f);
    expect(r.status).toBe(200);
    expect(String((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toContain('DEMO_KEY');
    const withKey = await handleDonki({ start: '2026-08-01', end: '2026-09-01' }, 'SEGREDO', ok([]));
    expect(JSON.stringify(withKey.body)).not.toContain('SEGREDO');
  });
});

describe('cliente do navegador', () => {
  it('monta o descritor de efemérides a partir do proxy', async () => {
    const samples = parseHorizonsVectors(horizonsPayload('earth'), 'earth');
    const f = ok({ samples });
    const d = await loadHorizonsEphemeris({ depStartJd: isoToJd('2026-10-02'), depEndJd: isoToJd('2026-10-05'), arrStartJd: isoToJd('2026-10-06'), arrEndJd: isoToJd('2026-10-07') }, f);
    expect(d.kind).toBe('horizons');
  });
  it('erro do proxy vira ServiceUnavailable com a mensagem do servidor', async () => {
    await expect(loadHorizonsEphemeris({ depStartJd: 2461000, depEndJd: 2461001, arrStartJd: 2461002, arrEndJd: 2461003 }, status(502, { error: 'Horizons fora do ar' }))).rejects.toThrow(/Horizons fora do ar/);
    await expect(loadDonkiCalibration('2026-09-01', 30, ok({ nada: 1 }))).rejects.toBeInstanceOf(ServiceUnavailable);
  });
  it('amostras malformadas são recusadas', async () => {
    await expect(loadHorizonsEphemeris({ depStartJd: 2461100, depEndJd: 2461101, arrStartJd: 2461102, arrEndJd: 2461103 }, ok({ samples: [{ jd: 1, r: [1, 2], v: [1, 2, 3] }, { jd: 2, r: [1, 2, 3], v: [1, 2, 3] }] }))).rejects.toThrow(/malformada/);
  });
});

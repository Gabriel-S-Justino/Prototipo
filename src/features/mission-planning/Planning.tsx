import { useEffect, useMemo, useState } from 'react';
import { Metric, Metrics } from '../../components/Metric';
import { StatusBadge } from '../../components/StatusBadge';
import { ThreeView } from '../../components/ThreeView';
import { fmt, formatJd, isoToJd, jdToIso } from '../../domain/units';
import { createSolarScene, type SolarSceneProps } from '../../render/solarScene';
import { orbitPoints, trajectoryPoints } from '../../render/sampling';
import { loadDonkiCalibration, loadHorizonsEphemeris } from '../../services/nasa/client';
import { runPorkchop } from '../../services/porkchopRunner';
import { CAPTURE_ORBITS, type CaptureOrbitId } from '../../simulation/mission/capture';
import { derivePlan } from '../../simulation/mission/plan';
import { hohmannEarthMars } from '../../simulation/orbital/hohmann';
import { DEFAULT_PORKCHOP, validateParams, type PorkchopGrid, type PorkchopParams } from '../../simulation/orbital/porkchop';
import { ephemerisOf } from '../../state/mission';
import { useMission } from '../../state/MissionContext';
import { Porkchop } from './Porkchop';
import { PAYLOAD_ADAPTER_MASS } from '../../data/probe';

const RESOLUTIONS = [
  { label: '47 × 50 (2.350 trajetórias)', dep: 47, tof: 50 },
  { label: '94 × 100 (9.400 trajetórias)', dep: 94, tof: 100 },
  { label: '140 × 150 (21.000 trajetórias)', dep: 140, tof: 150 },
];

export function Planning() {
  const { state, dispatch, plan } = useMission();
  const eph = ephemerisOf(state);
  const [form, setForm] = useState({ depStart: '2026-09-15', depEnd: '2026-12-31', tofMin: DEFAULT_PORKCHOP.tofMinDays, tofMax: DEFAULT_PORKCHOP.tofMaxDays, res: 1 });
  const [grid, setGrid] = useState<(PorkchopGrid & { cached: boolean }) | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState<{ horizons: string | null; donki: string | null; busy: 'horizons' | 'donki' | null }>({ horizons: null, donki: null, busy: null });

  const params = useMemo<PorkchopParams | null>(() => {
    try {
      return { depStartJd: isoToJd(form.depStart), depEndJd: isoToJd(form.depEnd), tofMinDays: form.tofMin, tofMaxDays: form.tofMax, depSteps: RESOLUTIONS[form.res].dep, tofSteps: RESOLUTIONS[form.res].tof };
    } catch {
      return null;
    }
  }, [form]);

  const compute = () => {
    if (!params) return setError('Datas inválidas.');
    const invalid = validateParams(params);
    if (invalid) return setError(invalid);
    setError(null);
    setProgress(0);
    const job = runPorkchop(state.ephemeris, params, setProgress);
    job.promise.then((g) => { setGrid(g); setProgress(null); }).catch((e: Error) => { if (e.message !== 'cancelado') setError(e.message); setProgress(null); });
    return job.cancel;
  };
  useEffect(() => compute() ?? undefined, [state.ephemeris]); // calcula ao abrir e ao trocar a fonte de efemérides

  const select = (depJd: number, tofDays: number) => dispatch({ type: 'trajetoria', selection: { departureJd: depJd, tofDays } });

  const candidates = useMemo(() => {
    if (!grid?.best) return [];
    const list: { label: string; depJd: number; tof: number }[] = [{ label: 'Seleção atual', depJd: state.selection.departureJd, tof: state.selection.tofDays }, { label: 'Menor C3 da grade', depJd: grid.best.depJd, tof: grid.best.tofDays }];
    let fast: { depJd: number; tof: number } | null = null;
    let soft: { depJd: number; tof: number; v: number } | null = null;
    const nx = grid.depJds.length;
    for (let j = 0; j < grid.tofs.length; j++) for (let i = 0; i < nx; i++) {
      const c3 = grid.c3[j * nx + i];
      if (Number.isNaN(c3)) continue;
      if (c3 <= grid.best.c3 + 4 && (!fast || grid.tofs[j] < fast.tof)) fast = { depJd: grid.depJds[i], tof: grid.tofs[j] };
      const v = grid.vInfArr[j * nx + i];
      if (c3 <= grid.best.c3 + 6 && (!soft || v < soft.v)) soft = { depJd: grid.depJds[i], tof: grid.tofs[j], v };
    }
    if (fast) list.push({ label: 'Mais rápida (C3 ≤ melhor + 4)', ...fast });
    if (soft) list.push({ label: 'Chegada mais lenta (captura barata)', ...soft });
    return list.map((c) => ({ ...c, plan: derivePlan(state.design, { departureJd: c.depJd, tofDays: c.tof }, eph) }));
  }, [grid, state.design, state.selection, eph]);

  const scene = useMemo<SolarSceneProps>(() => {
    const jd = state.selection.departureJd;
    const t = plan.transfer;
    return {
      earth: eph.state('earth', jd).r,
      mars: t.ok ? t.marsAtArrival.r : eph.state('mars', jd).r,
      earthOrbit: orbitPoints(eph, 'earth', jd),
      marsOrbit: orbitPoints(eph, 'mars', jd),
      planned: t.ok ? trajectoryPoints(t.departureState, t.tofDays) : undefined,
      highlightMars: true,
      markers: t.ok ? [{ at: t.earthAtDeparture.r, text: `Partida ${jdToIso(jd)}`, color: '#9cd2ff' }, { at: t.marsAtArrival.r, text: `Chegada ${jdToIso(t.arrivalJd)}`, color: '#ffb08a' }] : [],
    };
  }, [eph, plan.transfer, state.selection.departureJd]);

  const horizons = async () => {
    if (!params) return;
    setService((s) => ({ ...s, busy: 'horizons', horizons: 'Consultando NASA/JPL Horizons…' }));
    try {
      const desc = await loadHorizonsEphemeris({ depStartJd: params.depStartJd, depEndJd: params.depEndJd, arrStartJd: params.depStartJd + params.tofMinDays, arrEndJd: params.depEndJd + params.tofMaxDays });
      dispatch({ type: 'efemerides', descriptor: desc });
      setService((s) => ({ ...s, busy: null, horizons: `Efemérides do Horizons carregadas (${desc.kind === 'horizons' ? desc.tables.earth.length + desc.tables.mars.length : 0} vetores). O gráfico será recalculado.` }));
    } catch (e) {
      setService((s) => ({ ...s, busy: null, horizons: `Horizons indisponível: ${(e as Error).message} A simulação continua com o modelo analítico offline do JPL.` }));
    }
  };
  const donki = async () => {
    setService((s) => ({ ...s, busy: 'donki', donki: 'Consultando NASA DONKI…' }));
    try {
      const cal = await loadDonkiCalibration(new Date().toISOString().slice(0, 10));
      dispatch({ type: 'calibracao-solar', calibration: cal });
      setService((s) => ({ ...s, busy: null, donki: cal.description }));
    } catch (e) {
      setService((s) => ({ ...s, busy: null, donki: `DONKI indisponível: ${(e as Error).message} Mantida a taxa padrão didática.` }));
    }
  };

  const t = plan.transfer;
  const h = hohmannEarthMars();
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Etapa 3</p>
        <h2>Planejamento da missão</h2>
        <p className="muted">Escolha quando partir e quanto tempo viajar. A trajetória define a energia (C3), que define quanta massa o lançador consegue mandar a Marte.</p>
      </div>

      <section className="panel stack" aria-label="Fonte dos dados">
        <div className="spread">
          <div>
            <h3>Efemérides: {eph.label}</h3>
            <p className="small muted">Referencial heliocêntrico, eclíptica J2000; km e km/s.</p>
          </div>
          <div className="row">
            <button type="button" className="btn small" disabled={service.busy !== null} onClick={horizons}>{service.busy === 'horizons' ? 'Consultando…' : 'Usar NASA/JPL Horizons'}</button>
            {state.ephemeris.kind === 'horizons' ? <button type="button" className="btn small" onClick={() => dispatch({ type: 'efemerides', descriptor: { kind: 'standish' } })}>Voltar ao modelo offline</button> : null}
            <button type="button" className="btn small" disabled={service.busy !== null} onClick={donki}>{service.busy === 'donki' ? 'Consultando…' : 'Calibrar eventos solares (DONKI)'}</button>
          </div>
        </div>
        {service.horizons ? <p className="small" role="status">{service.horizons}</p> : null}
        {service.donki ? <p className="small" role="status">{service.donki}</p> : null}
      </section>

      <section className="panel stack" aria-label="Gráfico de oportunidades de lançamento">
        <div className="spread">
          <h3>Gráfico de oportunidades (porkchop): C3 de partida</h3>
          {grid ? <span className="muted small">{fmt(grid.valid + grid.invalid)} trajetórias em {fmt(grid.elapsedMs)} ms{grid.cached ? ' (cache)' : ''} · {fmt(grid.invalid)} sem solução</span> : null}
        </div>
        <div className="row">
          <label className="field">Partida de<input type="date" value={form.depStart} onChange={(e) => setForm({ ...form, depStart: e.target.value })} /></label>
          <label className="field">até<input type="date" value={form.depEnd} onChange={(e) => setForm({ ...form, depEnd: e.target.value })} /></label>
          <label className="field">Voo mín. (dias)<input type="number" min={30} max={900} value={form.tofMin} onChange={(e) => setForm({ ...form, tofMin: Number(e.target.value) })} /></label>
          <label className="field">Voo máx. (dias)<input type="number" min={31} max={900} value={form.tofMax} onChange={(e) => setForm({ ...form, tofMax: Number(e.target.value) })} /></label>
          <label className="field">Resolução
            <select value={form.res} onChange={(e) => setForm({ ...form, res: Number(e.target.value) })}>
              {RESOLUTIONS.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => compute()} disabled={progress !== null}>Calcular</button>
        </div>
        {error ? <p className="bad small" role="alert">{error}</p> : null}
        {progress !== null ? (
          <div role="status" aria-label="Calculando trajetórias">
            <p className="small">Resolvendo Lambert em segundo plano… {fmt(progress * 100)}%</p>
            <div className="progress"><span style={{ width: `${progress * 100}%` }} /></div>
          </div>
        ) : null}
        {grid ? (
          <>
            <Porkchop grid={grid} selected={{ depJd: state.selection.departureJd, tofDays: state.selection.tofDays }} onSelect={select} />
            {grid.best ? <p className="small">★ Melhor no intervalo calculado: partida {formatJd(grid.best.depJd)}, {fmt(grid.best.tofDays)} dias, C3 {fmt(grid.best.c3, 3)} km²/s². Fora desse intervalo pode haver soluções melhores.</p> : <p className="bad small">Nenhuma solução válida no intervalo.</p>}
          </>
        ) : null}
        <div className="row">
          <label className="field">Partida (ajuste fino)<input type="date" value={jdToIso(state.selection.departureJd)} onChange={(e) => { try { select(isoToJd(e.target.value), state.selection.tofDays); } catch { /* data incompleta */ } }} /></label>
          <label className="field">Tempo de voo (dias)<input type="number" min={60} max={900} step={1} value={Math.round(state.selection.tofDays)} onChange={(e) => select(state.selection.departureJd, Number(e.target.value))} /></label>
        </div>
      </section>

      <div className="grid-2">
        <section className="stack">
          <ThreeView create={createSolarScene} props={scene} label={`Trajetória planejada de ${formatJd(state.selection.departureJd)} até ${formatJd(plan.arrivalJd)}`}>
            <div className="overlay">Posições de Terra (na partida) e Marte (na chegada). Tamanhos fora de escala; 1 UA = 10 unidades.</div>
          </ThreeView>
        </section>
        <section className="panel stack">
          <h3>Consequências da escolha</h3>
          {t.ok ? (
            <Metrics label="Resultado da trajetória">
              <Metric label="C3" value={fmt(t.c3, 2)} unit="km²/s²" />
              <Metric label="v∞ chegada" value={fmt(t.vInfArr, 2)} unit="km/s" />
              <Metric label="DLA" value={fmt(t.dlaDeg, 1)} unit="°" />
              <Metric label="Chegada" value={formatJd(t.arrivalJd)} />
              <Metric label="Capacidade" value={fmt(plan.capacity)} unit="kg" />
              <Metric label="Limite da sonda" value={fmt(plan.capacity - PAYLOAD_ADAPTER_MASS)} unit="kg" title={`Capacidade menos o adaptador de ${PAYLOAD_ADAPTER_MASS} kg`} />
              <Metric label="Massa da sonda" value={fmt(plan.probe.wetMass)} unit="kg" tone={plan.massMargin < 0 ? 'bad' : undefined} />
              <Metric label="Custo total" value={fmt(plan.budget.total)} unit="US$ M*" tone={plan.budget.remaining < 0 ? 'bad' : undefined} />
            </Metrics>
          ) : <p className="bad">Sem solução de transferência: {t.reason}</p>}
          <div className="row" role="radiogroup" aria-label="Órbita de captura">
            {(Object.keys(CAPTURE_ORBITS) as CaptureOrbitId[]).map((id) => (
              <button key={id} type="button" role="radio" aria-checked={state.design.captureOrbit === id} className="btn small" aria-pressed={state.design.captureOrbit === id} onClick={() => dispatch({ type: 'orbita-captura', orbit: id })}>{CAPTURE_ORBITS[id].name}</button>
            ))}
          </div>
          <p className="small muted">{CAPTURE_ORBITS[state.design.captureOrbit].description} Captura: {fmt(plan.captureDeltaV)} m/s; a sonda tem {fmt(plan.probe.deltaV)} m/s.</p>
          <p className="small muted">Referência didática (Hohmann, órbitas circulares coplanares): C3 {fmt(h.c3, 2)} km²/s² em {fmt(h.days)} dias. Lambert usa as órbitas reais (elípticas e inclinadas), por isso difere.</p>
        </section>
      </div>

      {candidates.length ? (
        <section className="panel">
          <h3>Comparação entre opções</h3>
          <table className="data">
            <thead><tr><th>Opção</th><th>Partida</th><th>Voo</th><th>C3</th><th>Capacidade</th><th>Margem de massa</th><th>Captura</th><th>Custo*</th><th>Checklist</th><th /></tr></thead>
            <tbody>
              {candidates.map((c) => {
                const worst = c.plan.checklist.some((x) => x.status === 'NO-GO') ? 'NO-GO' : c.plan.checklist.some((x) => x.status === 'WARNING') ? 'WARNING' : 'GO';
                return (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td>{formatJd(c.depJd)}</td>
                    <td>{fmt(c.tof)} d</td>
                    <td>{c.plan.transfer.ok ? fmt(c.plan.transfer.c3, 2) : '—'}</td>
                    <td>{fmt(c.plan.capacity)} kg</td>
                    <td className={c.plan.massMargin < 0 ? 'bad' : ''}>{fmt(c.plan.massMargin)} kg</td>
                    <td>{fmt(c.plan.captureDeltaV)} m/s</td>
                    <td>{fmt(c.plan.budget.total)}</td>
                    <td><StatusBadge status={worst} /></td>
                    <td>{c.label !== 'Seleção atual' ? <button type="button" className="btn small" onClick={() => select(c.depJd, c.tof)}>Selecionar</button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">Viagens mais curtas pedem mais energia; chegadas lentas barateiam a captura, mas o cruzeiro custa mais dias de operação.</p>
        </section>
      ) : null}

      <div className="row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'ir', phase: 'hangar' })}>Voltar ao hangar</button>
        <button type="button" className="btn primary" onClick={() => dispatch({ type: 'ir', phase: 'checklist' })}>Ir ao checklist de lançamento</button>
      </div>
    </div>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { Metric, Metrics } from '../../components/Metric';
import { ThreeView } from '../../components/ThreeView';
import { BOOSTERS, CORE_STAGES, ENGINES, FAIRINGS, PRESETS, UPPER_STAGES, type VehicleConfig } from '../../data/launchers';
import { STATUS_LABEL, type Provenance } from '../../data/provenance';
import { fmt } from '../../domain/units';
import { createHangarScene, type HangarSceneProps } from '../../render/hangarScene';
import type { RocketPart } from '../../render/rocketModel';
import { assembleVehicle } from '../../simulation/rocket/vehicle';
import { useMission } from '../../state/MissionContext';
import { ProbeBuilder } from './ProbeBuilder';

const PART_LABEL: Record<RocketPart, string> = { core: 'Primeiro estágio', boosters: 'Propulsores laterais', upper: 'Estágio superior', fairing: 'Coifa', probe: 'Sonda' };

function Prov({ p }: { p: Provenance }) {
  return <p className="prov">Fonte: {p.source} · {STATUS_LABEL[p.status]} · confiança {p.confidence}{p.note ? ` · ${p.note}` : ''}</p>;
}

export function Hangar() {
  const { state, dispatch, plan } = useMission();
  const [tab, setTab] = useState<'lancador' | 'sonda'>('lancador');
  const [selected, setSelected] = useState<RocketPart>('core');
  const config = state.design.vehicle;
  const vehicle = plan.vehicle;
  const set = (patch: Partial<VehicleConfig>) => dispatch({ type: 'veiculo', patch });
  const onSelect = useCallback((part: RocketPart) => {
    setSelected(part);
    setTab(part === 'probe' ? 'sonda' : 'lancador');
  }, []);
  const sceneProps = useMemo<HangarSceneProps>(() => ({ vehicle, selected, onSelect }), [vehicle, selected, onSelect]);

  /** Problemas que uma alternativa causaria, para explicar incompatibilidades antes do clique. */
  const issuesIf = (patch: Partial<VehicleConfig>) => assembleVehicle({ ...config, ...patch }).issues.filter((i) => i.severity === 'erro').map((i) => i.message);

  const option = (key: string, title: string, sub: string, active: boolean, patch: Partial<VehicleConfig>) => {
    const problems = active ? [] : issuesIf(patch);
    return (
      <li key={key}>
        <button type="button" className={`part-option ${problems.length ? 'incompatible' : ''}`} aria-pressed={active} onClick={() => set(patch)} title={problems.join(' ')}>
          <span>
            <strong>{title}</strong>
            <br />
            <span className="muted small">{sub}</span>
            {problems.length ? <><br /><span className="warn-text small">Incompatível: {problems[0]}</span></> : null}
          </span>
        </button>
      </li>
    );
  };

  const perf = plan.performance;
  const c3 = plan.transfer.ok ? plan.transfer.c3 : NaN;
  const errors = vehicle.issues.filter((i) => i.severity === 'erro');

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Etapa 2</p>
          <h2>Hangar: montagem do veículo</h2>
        </div>
        <div className="row" role="group" aria-label="Configurações de referência">
          <span className="muted small">Referências reais:</span>
          {Object.entries(PRESETS).map(([id, p]) => (
            <button key={id} type="button" className="btn small" aria-pressed={JSON.stringify(p.config) === JSON.stringify(config)} onClick={() => dispatch({ type: 'preset', id })}>{p.name}</button>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <div className="stack">
          <ThreeView create={createHangarScene} props={sceneProps} label={`Modelo 3D do lançador. Parte selecionada: ${PART_LABEL[selected]}. Clique numa parte para editá-la.`} className="tall">
            <div className="overlay-top">
              <span className="badge info">{PART_LABEL[selected]}</span>
              <span className="muted small">Arraste para girar · role para aproximar · clique numa parte</span>
            </div>
            <div className="overlay">Geometria procedural ilustrativa em metros; não é CAD dos veículos reais.</div>
          </ThreeView>
          <Metrics label="Resumo do veículo">
            <Metric label="Massa na decolagem" value={fmt(perf.liftoffMass / 1000, 1)} unit="t" />
            <Metric label="TWR na decolagem" value={fmt(perf.liftoffTWR, 2)} tone={perf.liftoffTWR <= 1 ? 'bad' : perf.liftoffTWR < 1.15 ? 'warn' : undefined} />
            <Metric label="Δv ideal" value={fmt(perf.idealDeltaV)} unit="m/s" />
            <Metric label="Δv até a órbita" value={fmt(perf.leoRequirement)} unit="m/s" />
            <Metric label={`Capacidade (C3 ${fmt(c3, 1)})`} value={fmt(plan.capacity)} unit="kg" tone={plan.massMargin < 0 ? 'bad' : undefined} />
            <Metric label="Sonda + adaptador" value={fmt(plan.probe.launchMass)} unit="kg" tone={plan.massMargin < 0 ? 'bad' : undefined} />
            <Metric label="Custo do lançador" value={fmt(vehicle.cost)} unit="US$ M*" />
          </Metrics>
          <p className="muted small">* Custos fictícios, só para comparação entre escolhas.</p>
          {vehicle.issues.length || plan.probe.issues.length ? (
            <ul className="issues" aria-label="Problemas de compatibilidade">
              {[...vehicle.issues, ...plan.probe.issues].map((i) => <li key={i.code} className={i.severity}>{i.severity === 'erro' ? '✖ ' : '▲ '}{i.message}</li>)}
            </ul>
          ) : <p className="good small">✔ Todas as peças são compatíveis.</p>}
          <table className="data" aria-label="Fases de queima">
            <thead><tr><th>Fase</th><th>Duração</th><th>Isp</th><th>Δv ideal</th><th>Perda grav.</th></tr></thead>
            <tbody>
              {perf.phases.map((p) => (
                <tr key={p.id}><td>{p.label}</td><td>{fmt(p.duration)} s</td><td>{fmt(p.isp)} s</td><td>{fmt(p.deltaV)} m/s</td><td>{fmt(p.gravityLoss)} m/s</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'lancador'} onClick={() => setTab('lancador')}>Lançador</button>
            <button type="button" role="tab" aria-selected={tab === 'sonda'} onClick={() => { setTab('sonda'); setSelected('probe'); }}>Sonda</button>
          </div>
          {tab === 'lancador' ? (
            <div className="stack" role="tabpanel">
              <div className="row" role="group" aria-label="Parte em edição">
                {(['core', 'boosters', 'upper', 'fairing'] as RocketPart[]).map((p) => (
                  <button key={p} type="button" className="btn small" aria-pressed={selected === p} onClick={() => setSelected(p)}>{PART_LABEL[p]}</button>
                ))}
              </div>
              {selected === 'core' ? (
                <section className="stack" aria-label="Primeiro estágio">
                  <ul className="part-list">
                    {Object.values(CORE_STAGES).map((c) => option(c.id, c.name, `${c.engineCount}× ${ENGINES[c.engineId].name} · ${fmt(c.propellant / 1000)} t de propelente · ${c.diameter} m`, config.coreId === c.id, { coreId: c.id }))}
                  </ul>
                  <label className="field">Carga de propelente do núcleo: {fmt(config.coreLoad * 100)}%
                    <input type="range" min={50} max={100} step={5} value={config.coreLoad * 100} onChange={(e) => set({ coreLoad: Number(e.target.value) / 100 })} />
                  </label>
                  <Prov p={vehicle.core.provenance} />
                  <Prov p={vehicle.coreEngine.provenance} />
                </section>
              ) : null}
              {selected === 'boosters' ? (
                <section className="stack" aria-label="Propulsores laterais">
                  <ul className="part-list">
                    {option('none', 'Sem propulsores laterais', 'Mais leve e barato, menos empuxo na decolagem', !config.boosterId || config.boosterCount === 0, { boosterId: null, boosterCount: 0 })}
                    {Object.values(BOOSTERS).map((b) => option(b.id, b.name, `${b.kind === 'solido' ? 'Sólido' : 'Líquido'} · ${fmt(b.propellant / 1000, 1)} t cada · ${b.counts.filter((n) => n).join('/')} unidades`, config.boosterId === b.id && config.boosterCount > 0, { boosterId: b.id, boosterCount: b.counts.find((n) => n > 0) ?? 0 }))}
                  </ul>
                  {config.boosterId && config.boosterCount > 0 ? (
                    <div className="row" role="group" aria-label="Quantidade de propulsores">
                      <span className="small muted">Quantidade:</span>
                      {BOOSTERS[config.boosterId].counts.filter((n) => n > 0).map((n) => (
                        <button key={n} type="button" className="btn small" aria-pressed={config.boosterCount === n} onClick={() => set({ boosterCount: n })}>{n}</button>
                      ))}
                    </div>
                  ) : null}
                  {vehicle.booster ? <Prov p={vehicle.booster.provenance} /> : null}
                </section>
              ) : null}
              {selected === 'upper' ? (
                <section className="stack" aria-label="Estágio superior">
                  <ul className="part-list">
                    {Object.values(UPPER_STAGES).map((u) => option(u.id, u.name, `${fmt(u.propellant / 1000, 1)} t · ${u.diameter} m`, config.upperId === u.id, { upperId: u.id, upperEngineId: u.engineOptions[0], upperEngineCount: u.engineCountOptions[0] }))}
                  </ul>
                  <label className="field">Motor
                    <select value={config.upperEngineId} onChange={(e) => set({ upperEngineId: e.target.value })}>
                      {Object.values(ENGINES).filter((e) => e.thrustSL === null).map((e) => (
                        <option key={e.id} value={e.id}>{e.name} — {fmt(e.thrustVac, 1)} kN, Isp {fmt(e.ispVac, 1)} s{vehicle.upper.engineOptions.includes(e.id) ? '' : ' (incompatível)'}</option>
                      ))}
                    </select>
                  </label>
                  <div className="row" role="group" aria-label="Número de motores">
                    <span className="small muted">Motores:</span>
                    {[1, 2].map((n) => <button key={n} type="button" className="btn small" aria-pressed={config.upperEngineCount === n} onClick={() => set({ upperEngineCount: n })}>{n}</button>)}
                  </div>
                  <label className="field">Carga de propelente: {fmt(config.upperLoad * 100)}%
                    <input type="range" min={50} max={100} step={5} value={config.upperLoad * 100} onChange={(e) => set({ upperLoad: Number(e.target.value) / 100 })} />
                  </label>
                  <Prov p={vehicle.upper.provenance} />
                  <Prov p={vehicle.upperEngine.provenance} />
                </section>
              ) : null}
              {selected === 'fairing' ? (
                <section className="stack" aria-label="Coifa">
                  <ul className="part-list">
                    {Object.values(FAIRINGS).map((f) => option(f.id, f.name, `${f.diameter} m externo · ${f.innerDiameter} m úteis · ${fmt(f.mass)} kg`, config.fairingId === f.id, { fairingId: f.id }))}
                  </ul>
                  <p className="small muted">A antena estivada da sonda precisa de {fmt(plan.probe.envelope, 1)} m internos.</p>
                  <Prov p={vehicle.fairing.provenance} />
                </section>
              ) : null}
              {errors.length ? <p className="bad small">Há {errors.length} incompatibilidade(s): o checklist ficará NO-GO.</p> : null}
            </div>
          ) : (
            <ProbeBuilder />
          )}
          <div className="row" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn primary" onClick={() => dispatch({ type: 'ir', phase: 'planejamento' })}>Seguir para o planejamento</button>
          </div>
        </div>
      </div>
    </div>
  );
}

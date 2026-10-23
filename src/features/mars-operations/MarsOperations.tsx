import { useMemo } from 'react';
import { Metric, Metrics } from '../../components/Metric';
import { ThreeView } from '../../components/ThreeView';
import { INSTRUMENTS } from '../../data/probe';
import { AU_KM, fmt, formatJd } from '../../domain/units';
import { createMarsScene, type MarsSceneProps } from '../../render/marsScene';
import { DSN_COST_PER_HOUR_TURN } from '../../simulation/mission/budget';
import { linkBudget } from '../../simulation/mission/comms';
import { earthMarsGeometry } from '../../simulation/mission/geometry';
import { DSN_OPTIONS, energyBalance, objectivesStatus, SOLS_PER_TURN, TOTAL_TURNS, TURN_DAYS } from '../../simulation/mission/marsOps';
import { ephemerisOf } from '../../state/mission';
import { useMission } from '../../state/MissionContext';

export function MarsOperations() {
  const { state, dispatch } = useMission();
  const ops = state.ops!;
  const capture = state.capture!;
  const eph = ephemerisOf(state);
  const probe = state.design.probe;
  const nextTurn = ops.turn + 1;
  const dust = ops.dustStormTurns.includes(nextTurn);
  const geo = earthMarsGeometry(eph, ops.jd + TURN_DAYS / 2);
  const balance = energyBalance(probe, ops.orbit, geo.marsSunKm / AU_KM, state.turnPlan, dust);
  const link = linkBudget(probe.antennaId, probe.amplifierId, geo.distanceKm, geo.sepDeg, ops.antennaDamaged);
  const objectives = objectivesStatus(ops.science);
  const scene = useMemo<MarsSceneProps>(() => ({ periAltKm: capture.periAltKm, apoAltKm: capture.apoAltKm, phase: 0, dustStorm: dust, status: 'orbita' }), [capture, dust]);
  const active = state.turnPlan.active.filter((id) => probe.instruments.includes(id));
  const inactive = probe.instruments.filter((id) => !active.includes(id));
  const setActive = (list: string[]) => dispatch({ type: 'plano-turno', plan: { active: list } });
  const move = (id: string, d: -1 | 1) => {
    const i = active.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= active.length) return;
    const list = [...active];
    [list[i], list[j]] = [list[j], list[i]];
    setActive(list);
  };
  const data = active.filter((id) => balance.ran.includes(id)).reduce((s, id) => s + INSTRUMENTS[id].dataPerSol * SOLS_PER_TURN, 0);
  const downlink = (link.rate * state.turnPlan.dsnHoursPerDay * 3600 * TURN_DAYS) / 1e9;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Etapa 7</p>
          <h2>Operações científicas em Marte</h2>
          <p className="muted">Turno {nextTurn} de {TOTAL_TURNS} · {formatJd(ops.jd)} · órbita {fmt(capture.periAltKm)} × {fmt(capture.apoAltKm)} km</p>
        </div>
        <button type="button" className="btn" onClick={() => dispatch({ type: 'encerrar' })}>Encerrar missão agora</button>
      </div>
      <div className="grid-2">
        <ThreeView create={createMarsScene} props={scene} label={`Sonda em órbita de Marte${dust ? ' durante tempestade de poeira' : ''}`}>
          <div className="overlay">Órbita em escala de raios de Marte; o movimento da sonda é acelerado.</div>
        </ThreeView>
        <section className="panel stack">
          <h3>Condições do turno</h3>
          <Metrics label="Condições">
            <Metric label="Terra–Marte" value={fmt(geo.distanceKm / AU_KM, 2)} unit="UA" />
            <Metric label="Atraso do sinal" value={fmt(link.oneWayLightTime / 60, 1)} unit="min" />
            <Metric label="Ângulo Sol–Terra–Marte" value={fmt(geo.sepDeg, 1)} unit="°" tone={geo.sepDeg < 5 ? 'warn' : undefined} />
            <Metric label="Taxa de dados" value={fmt(link.rate / 1000, link.rate < 10000 ? 2 : 0)} unit="kbit/s" tone={link.state !== 'ok' ? 'warn' : undefined} />
            <Metric label="Geração" value={fmt(balance.generationW)} unit="W" tone={dust ? 'warn' : undefined} />
            <Metric label="Energia/sol" value={`${fmt(balance.needed)} / ${fmt(balance.available)}`} unit="Wh" tone={balance.safeMode ? 'bad' : balance.shed.length ? 'warn' : undefined} />
          </Metrics>
          {dust ? <p className="warn-text small">Tempestade de poeira regional prevista (cenário de treinamento): painéis a 55%, imagens da superfície com qualidade reduzida.</p> : null}
          {link.state !== 'ok' ? <p className="warn-text small">{link.reason}</p> : null}
          {balance.safeMode ? <p className="bad small">A energia não sustenta nem o barramento: a sonda ficará em modo seguro.</p> : null}
        </section>
      </div>
      <section className="panel stack">
        <h3>Plano do turno ({SOLS_PER_TURN} sóis)</h3>
        <p className="small muted">A ordem define a prioridade: se faltar energia, os últimos são desligados primeiro; no envio à Terra, os primeiros vão antes.</p>
        <ol className="part-list">
          {active.map((id, i) => {
            const inst = INSTRUMENTS[id];
            const shed = balance.shed.includes(id);
            return (
              <li key={id} className="part-option">
                <span>
                  <strong>{i + 1}. {inst.name}</strong>{shed ? <span className="warn-text small"> — desligado por energia</span> : null}
                  <br />
                  <span className="small muted">{fmt(inst.power)} W × {fmt(inst.hoursPerSol, 1)} h/sol · {fmt(inst.dataPerSol * SOLS_PER_TURN, 1)} Gbit/turno · qualidade na órbita atual {fmt(inst.orbitFactor[ops.orbit] * (ops.degraded[id] ?? 1) * 100)}%</span>
                </span>
                <span className="row">
                  <button type="button" className="btn small" aria-label={`Subir prioridade de ${inst.name}`} disabled={i === 0} onClick={() => move(id, -1)}>↑</button>
                  <button type="button" className="btn small" aria-label={`Descer prioridade de ${inst.name}`} disabled={i === active.length - 1} onClick={() => move(id, 1)}>↓</button>
                  <button type="button" className="btn small" onClick={() => setActive(active.filter((x) => x !== id))}>Desligar</button>
                </span>
              </li>
            );
          })}
        </ol>
        {inactive.length ? (
          <div className="row"><span className="small muted">Desligados:</span>{inactive.map((id) => <button key={id} type="button" className="btn small" onClick={() => setActive([...active, id])}>Ligar {INSTRUMENTS[id].name}</button>)}</div>
        ) : null}
        <div className="row" role="group" aria-label="Horas diárias de antena DSN">
          <span className="small">Antena DSN por dia:</span>
          {DSN_OPTIONS.map((h) => <button key={h} type="button" className="btn small" aria-pressed={state.turnPlan.dsnHoursPerDay === h} onClick={() => dispatch({ type: 'plano-turno', plan: { dsnHoursPerDay: h } })}>{h} h (US$ {fmt(h * DSN_COST_PER_HOUR_TURN, 1)} M*)</button>)}
        </div>
        <p className="small">Previsão: {fmt(data, 1)} Gbit gerados, até {fmt(downlink, 1)} Gbit enviáveis, gravador de {fmt(ops.recorder ? Object.values(ops.recorder).reduce((s, v) => s + v, 0) : 0, 1)} Gbit ocupados.</p>
        <button type="button" className="btn primary" onClick={() => dispatch({ type: 'turno' })}>Executar turno {nextTurn}</button>
      </section>
      <section className="grid-2">
        <div className="panel">
          <h3>Objetivos científicos</h3>
          {objectives.map((o) => (
            <div key={o.theme} style={{ marginBottom: '0.5rem' }}>
              <div className="spread small"><span>{o.done ? '✔ ' : ''}{o.label}</span><span>{fmt(o.value)} / {fmt(o.target)}</span></div>
              <div className={`bar ${o.done ? '' : 'warn'}`}><span style={{ width: `${Math.min(100, (o.value / o.target) * 100)}%` }} /></div>
            </div>
          ))}
          <p className="small muted">Pontos de ciência do jogo, calculados a partir dos dados efetivamente entregues à Terra. Não são resultados reais do MRO ou do MAVEN.</p>
        </div>
        <div className="panel">
          <h3>Turnos anteriores</h3>
          {ops.history.length ? (
            <table className="data">
              <thead><tr><th>Turno</th><th>UA</th><th>Entregue</th><th>Perdido</th><th>Ocorrências</th></tr></thead>
              <tbody>{ops.history.map((r) => <tr key={r.turn}><td>{r.turn}</td><td>{fmt(r.distanceAu, 2)}</td><td>{fmt(r.deliveredGbit, 1)} Gbit</td><td>{fmt(r.lostGbit, 1)}</td><td className="small">{r.events.join(' ') || '—'}</td></tr>)}</tbody>
            </table>
          ) : <p className="muted small">Nenhum turno executado ainda.</p>}
        </div>
      </section>
    </div>
  );
}

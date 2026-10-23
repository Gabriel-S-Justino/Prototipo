import { StatusBadge } from '../../components/StatusBadge';
import { fmt, formatJd } from '../../domain/units';
import { useMission } from '../../state/MissionContext';

export function Report() {
  const { state, dispatch } = useMission();
  const r = state.report!;
  const p = r.plan;
  const outcomeBadge = r.outcome === 'sucesso' ? 'GO' : r.outcome === 'parcial' ? 'WARNING' : 'NO-GO';
  const rows: [string, string, string][] = [
    ['Data de chegada', formatJd(p.arrivalJd), r.actualArrivalJd ? formatJd(r.actualArrivalJd) : 'não chegou'],
    ['C3 de partida', `${fmt(p.c3, 2)} km²/s²`, r.launch?.achievedC3 != null ? `${fmt(r.launch.achievedC3, 2)} km²/s²${r.launch.shortfallDeltaV > 0 ? ' (com propulsão da sonda)' : ''}` : '—'],
    ['Correções (Δv)', `reserva de 40 m/s`, `${fmt(r.totalTcmDeltaV, 2)} m/s`],
    ['Inserção orbital', `${fmt(p.captureDeltaV)} m/s`, r.capture ? (r.capture.ok ? `${fmt(r.capture.deltaV)} m/s` : 'não realizada') : '—'],
    ['Periapse em Marte', 'conforme órbita escolhida', r.capture?.ok ? `${fmt(r.capture.periAltKm)} km` : '—'],
    ['Custo (fictício)', `US$ ${fmt(r.budget.planned)} M`, `US$ ${fmt(r.budget.actual)} M`],
  ];
  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Etapa 8</p>
          <h2>Relatório da missão</h2>
          <p><StatusBadge status={outcomeBadge} /> {r.headline}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => dispatch({ type: 'reiniciar' })}>Nova missão</button>
      </div>
      <section className="grid-2">
        <div className="panel">
          <h3>Configuração e plano</h3>
          <ul className="small">{p.stack.map((s) => <li key={s}>{s}</li>)}</ul>
          <p className="small">{p.vehicleName} · lançamento em {formatJd(p.departureJd)} · {fmt(p.tofDays)} dias planejados · C3 {fmt(p.c3, 2)} km²/s² · DLA {fmt(p.dlaDeg, 1)}°</p>
          <p className="small">Massa lançada {fmt(p.launchMass)} kg para capacidade de {fmt(p.capacity)} kg · Δv da sonda {fmt(p.probeDeltaV)} m/s</p>
          <p className="small muted">Efemérides: {p.ephemerisLabel}.{p.forced ? ' Lançamento forçado com itens NO-GO.' : ''}</p>
        </div>
        <div className="panel">
          <h3>Planejado × realizado</h3>
          <table className="data">
            <thead><tr><th>Item</th><th>Planejado</th><th>Resultado</th></tr></thead>
            <tbody>{rows.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="grid-2">
        <div className="panel">
          <h3>Lançamento</h3>
          {r.launch ? (
            <ol className="events">{r.launch.events.map((e, i) => <li key={i} className={e.kind === 'falha' ? 'fail' : e.ok ? '' : 'warnev'}><span className="mono">T+{fmt(e.t)} s</span><span>{e.label}</span></li>)}</ol>
          ) : <p className="muted">Sem lançamento.</p>}
        </div>
        <div className="panel">
          <h3>Cruzeiro</h3>
          <table className="data">
            <thead><tr><th>Correção</th><th>Situação</th><th>Δv</th></tr></thead>
            <tbody>{r.tcms.map((t) => <tr key={t.label}><td>{t.label}</td><td>{t.status}</td><td>{t.deltaV != null ? `${fmt(t.deltaV, 2)} m/s` : '—'}</td></tr>)}</tbody>
          </table>
          <h4 style={{ marginTop: '0.75rem' }}>Eventos solares (cenários de treinamento)</h4>
          {r.solarEvents.length ? (
            <ul className="small">{r.solarEvents.map((e, i) => <li key={i}>{formatJd(e.when)} — {e.exposed ? 'sonda exposta' : 'sem exposição'}, resposta: {e.response}{e.damage ? `. ${e.damage}` : '.'}</li>)}</ul>
          ) : <p className="small muted">Nenhum evento enfrentado.</p>}
          {r.propellantLeft != null ? <p className="small">Propelente restante: {fmt(r.propellantLeft)} kg.</p> : null}
        </div>
      </section>
      <section className="grid-2">
        <div className="panel">
          <h3>Operações científicas</h3>
          {r.ops ? (
            <>
              <p className="small">{r.ops.turns} turno(s) · {fmt(r.ops.deliveredGbit, 1)} Gbit entregues · {fmt(r.ops.lostGbit, 1)} Gbit perdidos · {fmt(r.ops.energyUsedWh / 1000)} kWh consumidos · DSN US$ {fmt(r.ops.dsnCost, 1)} M*</p>
              <ul className="small">{r.objectives.map((o) => <li key={o.theme}>{o.done ? '✔' : '✖'} {o.label}: {fmt(o.value)} / {fmt(o.target)}</li>)}</ul>
            </>
          ) : <p className="muted small">A sonda não chegou à fase científica.</p>}
        </div>
        <div className="panel">
          <h3>Falhas e riscos</h3>
          {r.risks.length ? <ul className="small">{r.risks.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="small good">Nenhum risco materializado.</p>}
        </div>
      </section>
      <details className="panel">
        <summary><strong>Histórico completo ({r.log.length} registros)</strong></summary>
        <ol className="events" style={{ maxHeight: 'none' }}>{r.log.map((l, i) => <li key={i} className={l.ok ? '' : 'warnev'}><span className="mono">{formatJd(l.jd)}</span><span><strong>{l.title}:</strong> {l.text}</span></li>)}</ol>
      </details>
      <p className="small muted">* Valores monetários fictícios, para fins didáticos. Relatório gerado a partir do histórico da simulação.</p>
    </div>
  );
}

import { useState } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import { formatJd, fmt } from '../../domain/units';
import { useMission } from '../../state/MissionContext';

export function Checklist() {
  const { dispatch, plan, state } = useMission();
  const [understood, setUnderstood] = useState(false);
  const nogo = plan.checklist.filter((c) => c.status === 'NO-GO');
  const warnings = plan.checklist.filter((c) => c.status === 'WARNING');
  const overall = nogo.length ? 'NO-GO' : warnings.length ? 'WARNING' : 'GO';
  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Etapa 4</p>
          <h2>Checklist de lançamento</h2>
          <p className="muted">Partida em {formatJd(state.selection.departureJd)} · {fmt(state.selection.tofDays)} dias de cruzeiro · {plan.vehicle.core.name}</p>
        </div>
        <div className="row"><span className="muted">Situação geral:</span> <StatusBadge status={overall} /></div>
      </div>
      <ul className="checklist" aria-label="Itens do checklist">
        {plan.checklist.map((c) => (
          <li key={c.id} className={c.status}>
            <StatusBadge status={c.status} />
            <div>
              <strong>{c.label}</strong>
              <p className="small" style={{ margin: 0 }}>{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <section className="panel stack">
        {nogo.length ? (
          <>
            <p><strong className="bad">Lançamento normal bloqueado.</strong> {nogo.length} requisito(s) crítico(s): {nogo.map((c) => c.label).join(', ')}. Volte ao hangar ou ao planejamento para corrigir.</p>
            <details>
              <summary className="warn-text">Lançamento forçado (modo didático)</summary>
              <div className="stack" style={{ marginTop: '0.5rem' }}>
                <p className="small">O simulador vai calcular as consequências de lançar com os itens NO-GO acima. Um lançamento forçado não garante sucesso e fica registrado no relatório.</p>
                <label className="row small"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> Entendo os riscos e quero lançar mesmo assim.</label>
                <button type="button" className="btn warn" disabled={!understood} onClick={() => dispatch({ type: 'lancar', forced: true })}>Lançamento forçado</button>
              </div>
            </details>
          </>
        ) : (
          <p>{warnings.length ? <span className="warn-text">Há {warnings.length} aviso(s): o lançamento é permitido, com risco.</span> : <span className="good">Todos os sistemas GO.</span>}</p>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={() => dispatch({ type: 'ir', phase: 'planejamento' })}>Voltar ao planejamento</button>
          <button type="button" className="btn primary" disabled={nogo.length > 0} onClick={() => dispatch({ type: 'lancar', forced: false })}>Lançar</button>
        </div>
      </section>
    </div>
  );
}

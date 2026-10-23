import { CONCEPTS, CONCEPTS_BY_PHASE, MODEL_LIMITATIONS } from '../data/concepts';
import { useMission } from '../state/MissionContext';

/** Painel de Física (herdado do projeto original): explica os números da etapa atual, em modo simples ou avançado. */
export function PhysicsPanel() {
  const { state, dispatch, plan } = useMission();
  const ids = CONCEPTS_BY_PHASE[state.phase];
  const concepts = CONCEPTS.filter((c) => ids.includes(c.id));
  return (
    <aside className="panel physics" aria-label="Painel de Física">
      <div className="spread">
        <h3>Painel de Física</h3>
        <div className="row" role="group" aria-label="Nível de detalhe">
          <button type="button" className="btn small" aria-pressed={!state.advanced} onClick={() => dispatch({ type: 'modo-avancado', value: false })}>Simples</button>
          <button type="button" className="btn small" aria-pressed={state.advanced} onClick={() => dispatch({ type: 'modo-avancado', value: true })}>Avançado</button>
        </div>
      </div>
      <p className="muted small">Os valores abaixo são os mesmos usados pela simulação nesta etapa.</p>
      {concepts.map((c, i) => {
        let live = '';
        try {
          live = c.live({ plan, state });
        } catch {
          live = 'Indisponível para a configuração atual.';
        }
        return (
          <details key={c.id} className="concept" open={i < 2} data-concept={c.id}>
            <summary>{c.title}</summary>
            <p className="small">{c.simple}</p>
            <p className="live" aria-label={`Valor atual de ${c.title}`}>{live}</p>
            {state.advanced ? (
              <>
                <p className="formula">{c.formula}</p>
                <dl className="kv">
                  <dt>Unidade</dt><dd>{c.unit}</dd>
                  <dt>Depende de</dt><dd>{c.inputs}</dd>
                  <dt>Impacto</dt><dd>{c.impact}</dd>
                  <dt>Hipóteses</dt><dd>{c.assumptions}</dd>
                </dl>
              </>
            ) : c.analogy ? (
              <p className="analogy">{c.analogy}</p>
            ) : null}
          </details>
        );
      })}
      {state.advanced ? (
        <details className="concept">
          <summary>Limitações do modelo</summary>
          <ul className="small">{MODEL_LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
      ) : null}
    </aside>
  );
}

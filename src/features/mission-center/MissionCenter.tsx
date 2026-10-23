import { useMemo } from 'react';
import { ThreeView } from '../../components/ThreeView';
import { createSolarScene, type SolarSceneProps } from '../../render/solarScene';
import { orbitPoints, trajectoryPoints } from '../../render/sampling';
import { ephemerisOf } from '../../state/mission';
import { useMission } from '../../state/MissionContext';
import { fmt, formatJd } from '../../domain/units';
import { BUDGET_LIMIT } from '../../simulation/mission/budget';

export function MissionCenter() {
  const { state, dispatch, plan } = useMission();
  const eph = ephemerisOf(state);
  const scene = useMemo<SolarSceneProps>(() => {
    const jd = state.selection.departureJd;
    return {
      earth: eph.state('earth', jd).r,
      mars: eph.state('mars', jd).r,
      earthOrbit: orbitPoints(eph, 'earth', jd),
      marsOrbit: orbitPoints(eph, 'mars', jd),
      planned: plan.transfer.ok ? trajectoryPoints(plan.transfer.departureState, plan.transfer.tofDays) : undefined,
      highlightMars: true,
    };
  }, [eph, plan.transfer, state.selection.departureJd]);

  return (
    <div className="stack">
      <section className="hero">
        <div className="stack">
          <p className="eyebrow">Simulador de engenharia de missão</p>
          <h1>Mission Architect</h1>
          <p>
            Você é a pessoa responsável por uma missão robótica a Marte. Escolha o lançador, monte a sonda, encontre a janela de lançamento,
            gerencie o voo e opere os instrumentos em órbita. Cada decisão muda a física — e o resultado.
          </p>
          <p className="muted">
            Objetivo: colocar um orbitador em Marte e cumprir pelo menos dois dos quatro objetivos científicos, dentro de um orçamento
            de US$ {fmt(BUDGET_LIMIT)} milhões (valor fictício do jogo).
          </p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => dispatch({ type: 'ir', phase: 'hangar' })}>Iniciar missão</button>
            <span className="muted small">Janela inicial: {formatJd(state.selection.departureJd)} · {fmt(state.selection.tofDays)} dias de viagem</span>
          </div>
        </div>
        <ThreeView create={createSolarScene} props={scene} label="Visão do Sistema Solar interno com a trajetória Terra–Marte planejada" className="tall">
          <div className="overlay">Representação fora de escala nos tamanhos; distâncias em 1 UA = 10 unidades.</div>
        </ThreeView>
      </section>

      <section className="grid-3">
        <div className="panel">
          <h3>Etapas</h3>
          <ol className="steps">
            <li>Hangar: lançador, estágios e sonda</li>
            <li>Planejamento: data, trajetória e massa</li>
            <li>Checklist GO / NO-GO</li>
            <li>Lançamento e separação dos estágios</li>
            <li>Cruzeiro: correções, Sol e comunicações</li>
            <li>Operações científicas em Marte</li>
            <li>Relatório da missão</li>
          </ol>
        </div>
        <details className="panel" open>
          <summary><h3 style={{ display: 'inline' }}>Instruções</h3></summary>
          <ul className="small">
            <li>Os números vêm sempre da simulação; o Painel de Física à direita explica cada um.</li>
            <li>Alterar a data de lançamento muda a energia (C3), a massa que o foguete leva, o custo e o checklist.</li>
            <li>Itens NO-GO bloqueiam o lançamento normal. Há um lançamento forçado para aprender com o erro.</li>
            <li>Tudo funciona por teclado: use Tab, Enter e as setas no gráfico de oportunidades.</li>
          </ul>
        </details>
        <details className="panel" open>
          <summary><h3 style={{ display: 'inline' }}>Informações científicas</h3></summary>
          <ul className="small">
            <li>Efemérides: NASA/JPL Horizons (quando o serviço está acessível) ou o modelo analítico do JPL, offline.</li>
            <li>Trajetórias: problema de Lambert por variáveis universais.</li>
            <li>Lançadores: parâmetros públicos com fonte e grau de confiança (ver docs/FOGUETES.md).</li>
            <li>Eventos solares do cruzeiro são cenários de treinamento; a NASA DONKI só calibra a frequência.</li>
          </ul>
        </details>
      </section>
      <section className="panel">
        <h3>Configurações</h3>
        <div className="row">
          <span className="muted small">Semente da missão: <span className="mono">{state.seed}</span> (mesma semente → mesmos eventos).</span>
          <button type="button" className="btn small" onClick={() => dispatch({ type: 'reiniciar' })}>Nova semente</button>
          <button type="button" className="btn small" aria-pressed={state.advanced} onClick={() => dispatch({ type: 'modo-avancado', value: !state.advanced })}>
            Painel de física: {state.advanced ? 'avançado' : 'simples'}
          </button>
        </div>
      </section>
    </div>
  );
}

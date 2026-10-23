import { useEffect, useMemo, useRef, useState } from 'react';
import { Metric, Metrics } from '../../components/Metric';
import { ThreeView } from '../../components/ThreeView';
import { fmt } from '../../domain/units';
import { createLaunchScene, type LaunchSceneProps } from '../../render/launchScene';
import { launchTelemetry, PARKING_COAST_S } from '../../simulation/mission/launch';
import { useMission } from '../../state/MissionContext';

const SPEEDS = [1, 10, 50, 200];
const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function Launch() {
  const { state, dispatch, plan } = useMission();
  const result = state.launch!;
  const end = (result.failure?.t ?? result.separationT) + 20;
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(10);
  const [playing, setPlaying] = useState(true);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        // Pula o costeio na órbita de estacionamento em velocidade alta.
        const inCoast = prev > result.seco1 + 5 && prev < result.seco1 + PARKING_COAST_S - 5;
        const next = Math.min(end, prev + dt * speed * (inCoast ? 20 : 1));
        if (next >= end) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); last.current = null; };
  }, [playing, speed, end, result.seco1]);

  const telemetry = useMemo(() => launchTelemetry(result, plan.performance, t), [result, plan.performance, t]);
  const sceneProps = useMemo<LaunchSceneProps>(() => ({ vehicle: plan.vehicle, telemetry }), [plan.vehicle, telemetry]);
  const nextEvent = result.events.find((e) => e.t > t + 0.01);
  const done = t >= end;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Etapa 5</p>
          <h2>Lançamento e subida</h2>
        </div>
        <div className="row" role="group" aria-label="Controle do tempo">
          <button type="button" className="btn small" onClick={() => setPlaying(!playing)} disabled={done}>{playing ? 'Pausar' : 'Continuar'}</button>
          {SPEEDS.map((s) => <button key={s} type="button" className="btn small" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
          <button type="button" className="btn small" disabled={!nextEvent} onClick={() => nextEvent && setT(nextEvent.t)}>Próximo evento</button>
          <button type="button" className="btn small" onClick={() => { setT(0); setPlaying(true); }}>Reiniciar</button>
        </div>
      </div>
      <div className="grid-2">
        <ThreeView create={createLaunchScene} props={sceneProps} label={`Lançamento: ${telemetry.phaseLabel}`} className="tall">
          <div className="overlay-top">
            <span className="mono" style={{ fontSize: '1.2rem' }}>{clock(t)}</span>
            {telemetry.failed ? <span className="badge nogo">✖ FALHA</span> : result.forced ? <span className="badge warning">▲ LANÇAMENTO FORÇADO</span> : null}
          </div>
          <div className="overlay">{telemetry.phaseLabel}</div>
        </ThreeView>
        <section className="panel stack" aria-live="off">
          <h3>Telemetria</h3>
          <Metrics label="Telemetria">
            <Metric label="Tempo" value={clock(t)} />
            <Metric label="Altitude" value={fmt(telemetry.altitudeKm, 1)} unit="km" title="Perfil de altitude ilustrativo" />
            <Metric label="Velocidade" value={fmt(telemetry.speed)} unit="m/s" title="Inercial aproximada, do Δv acumulado menos perdas" />
            <Metric label="Estágio" value={telemetry.stage === 2 ? 'Sonda livre' : telemetry.stage === 1 ? 'Superior' : 'Núcleo'} />
          </Metrics>
          <div className="stack" aria-label="Propelente por fase">
            {plan.performance.phases.map((p, i) => (
              <div key={p.id}>
                <div className="spread small"><span>{p.label}</span><span>{fmt(Math.max(0, telemetry.propellant[i]) * 100)}%</span></div>
                <div className={`bar ${telemetry.propellant[i] < 0.15 ? 'warn' : ''}`}><span style={{ width: `${Math.max(0, telemetry.propellant[i]) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="small muted">Velocidade derivada da equação do foguete com perdas rateadas; o perfil de altitude é ilustrativo.</p>
          <h4>Sequência de eventos</h4>
          <ol className="events">
            {result.events.map((e, i) => (
              <li key={i} className={e.t > t ? 'future' : e.kind === 'falha' ? 'fail' : !e.ok ? 'warnev' : ''}>
                <span className="mono">{clock(e.t)}</span>
                <span>{e.label}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {done ? (
        <section className={`panel ${result.outcome === 'falha' ? '' : ''}`} role="status">
          {result.outcome === 'falha' ? (
            <>
              <h3 className="bad">Falha no lançamento</h3>
              <p>{result.failure?.reason}</p>
              <button type="button" className="btn primary" onClick={() => dispatch({ type: 'iniciar-cruzeiro' })}>Ver relatório da missão</button>
            </>
          ) : (
            <>
              <h3 className={result.outcome === 'nominal' ? 'good' : 'warn-text'}>{result.outcome === 'nominal' ? 'Injeção nominal' : 'Injeção com problemas'}</h3>
              <p>C3 alvo {fmt(result.targetC3, 2)} km²/s². Erro de injeção de {fmt(Math.hypot(...result.injectionError) * 1000, 2)} m/s, a corrigir no cruzeiro.{result.shortfallDeltaV > 0 ? ` A sonda gastou ${fmt(result.probePropellantUsed)} kg de propelente para completar a injeção.` : ''}</p>
              <button type="button" className="btn primary" onClick={() => dispatch({ type: 'iniciar-cruzeiro' })}>Seguir para o cruzeiro</button>
            </>
          )}
        </section>
      ) : (
        <button type="button" className="btn small" onClick={() => setT(end)}>Pular para o fim da sequência</button>
      )}
    </div>
  );
}

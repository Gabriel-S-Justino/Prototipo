import { useEffect, useMemo, useRef, useState } from 'react';
import { Metric, Metrics } from '../../components/Metric';
import { ThreeView } from '../../components/ThreeView';
import { AU_KM, fmt, formatJd } from '../../domain/units';
import { createSolarScene, type SolarSceneProps } from '../../render/solarScene';
import { orbitPoints, trajectoryPoints } from '../../render/sampling';
import { CAPTURE_ORBITS } from '../../simulation/mission/capture';
import { captureRequirement, commsAt, evaluateSolarEvent, predictArrival, tcmPreview } from '../../simulation/mission/cruise';
import { deltaVAvailable } from '../../simulation/mission/probe';
import { damageProbability } from '../../simulation/mission/solar';
import { norm, sub } from '../../simulation/orbital/vector';
import { ephemerisOf } from '../../state/mission';
import { useMission } from '../../state/MissionContext';

const WARPS = [0, 2, 10, 30];

export function Cruise() {
  const { state, dispatch } = useMission();
  const cruise = state.cruise!;
  const eph = ephemerisOf(state);
  const [warp, setWarp] = useState(0);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!warp || cruise.pending) return;
    let raf = 0;
    const step = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      if (dt > 0) dispatch({ type: 'avancar', days: Math.min(5, dt * warp) });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); last.current = null; };
  }, [warp, cruise.pending, dispatch]);
  useEffect(() => { if (cruise.pending) setWarp(0); }, [cruise.pending]);

  const earth = eph.state('earth', cruise.jd);
  const mars = eph.state('mars', cruise.jd);
  const link = commsAt(cruise, eph);
  const arrival = useMemo(() => predictArrival(cruise, eph), [cruise.sc, cruise.jd, eph]);
  const available = deltaVAvailable(cruise.dryMass, cruise.propellant, cruise.isp);
  const total = cruise.plannedArrivalJd - cruise.launchJd;
  const elapsed = cruise.jd - cruise.launchJd;
  const scene = useMemo<SolarSceneProps>(() => ({
    earth: earth.r,
    mars: mars.r,
    earthOrbit: orbitPoints(eph, 'earth', cruise.jd),
    marsOrbit: orbitPoints(eph, 'mars', cruise.jd),
    traveled: [...cruise.track, cruise.sc.r],
    predicted: trajectoryPoints(cruise.sc, Math.max(0.5, cruise.plannedArrivalJd - cruise.jd), 100),
    spacecraft: cruise.sc.r,
    highlightMars: true,
    probe: state.design.probe,
  }), [cruise.jd, cruise.sc, cruise.track, eph, state.design.probe]);

  const upcoming = [
    ...cruise.tcms.filter((t) => t.status === 'pendente').map((t) => ({ jd: t.jd, text: `${t.label}: oportunidade de correção` })),
    { jd: cruise.plannedArrivalJd, text: 'Chegada a Marte e inserção orbital' },
  ].filter((e) => e.jd >= cruise.jd - 1e-6).sort((a, b) => a.jd - b.jd).slice(0, 4);

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Etapa 6</p>
          <h2>Cruzeiro interplanetário</h2>
          <p className="muted">{formatJd(cruise.jd)} · dia {fmt(elapsed)} de {fmt(total)}</p>
        </div>
        <div className="row" role="group" aria-label="Avanço do tempo">
          {WARPS.map((w) => <button key={w} type="button" className="btn small" aria-pressed={warp === w} disabled={!!cruise.pending && w > 0} onClick={() => setWarp(w)}>{w === 0 ? 'Pausado' : `${w} dias/s`}</button>)}
          <button type="button" className="btn small" disabled={!!cruise.pending} onClick={() => dispatch({ type: 'avancar', days: 1 })}>+1 dia</button>
          <button type="button" className="btn small" disabled={!!cruise.pending} onClick={() => dispatch({ type: 'avancar', days: 10000 })}>Até o próximo evento</button>
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((elapsed / total) * 100)} aria-label="Progresso do cruzeiro"><span style={{ width: `${(elapsed / total) * 100}%` }} /></div>
      <div className="grid-2">
        <ThreeView create={createSolarScene} props={scene} label={`Posição da sonda no dia ${Math.round(elapsed)} do cruzeiro`} className="tall">
          <div className="overlay">Linha contínua: caminho percorrido · tracejada: previsão sem novas manobras. Tamanhos fora de escala.</div>
        </ThreeView>
        <section className="panel stack">
          <Metrics label="Estado da sonda">
            <Metric label="Distância à Terra" value={fmt(norm(sub(cruise.sc.r, earth.r)) / AU_KM, 3)} unit="UA" />
            <Metric label="Distância a Marte" value={fmt(norm(sub(cruise.sc.r, mars.r)) / 1e6, 2)} unit="milhões km" />
            <Metric label="Velocidade (Sol)" value={fmt(norm(cruise.sc.v), 2)} unit="km/s" />
            <Metric label="Propelente" value={fmt(cruise.propellant)} unit="kg" />
            <Metric label="Δv disponível" value={fmt(available)} unit="m/s" />
            <Metric label="Periapse previsto" value={arrival.outcome === 'longe' ? 'fora da SOI' : fmt(arrival.periapsisAltKm)} unit={arrival.outcome === 'longe' ? '' : 'km'} tone={arrival.outcome !== 'captura-possivel' ? 'bad' : Math.abs(arrival.periapsisAltKm - CAPTURE_ORBITS[cruise.captureOrbit].periAltKm) > 200 ? 'warn' : 'good'} />
          </Metrics>
          <div>
            <h4>Comunicações</h4>
            <p className={link.state === 'ok' ? 'small' : link.state === 'degradado' ? 'small warn-text' : 'small bad'}>
              {link.state === 'ok' ? '● Enlace nominal' : link.state === 'degradado' ? '▲ Enlace degradado' : '✖ Sem enlace'} · {fmt(link.rate / 1000, link.rate < 10000 ? 2 : 0)} kbit/s · atraso {fmt(link.oneWayLightTime / 60, 1)} min · ângulo Sol–Terra–sonda {fmt(link.sepDeg, 1)}°
            </p>
            {link.state !== 'ok' ? <p className="small muted">{link.reason}</p> : null}
            {cruise.jd < cruise.safeModeUntil ? <p className="small warn-text">Modo seguro até {formatJd(cruise.safeModeUntil)}.</p> : null}
          </div>
          <div>
            <h4>Próximos eventos</h4>
            <ul className="small">{upcoming.map((e) => <li key={e.text}>{formatJd(e.jd)} — {e.text}</li>)}</ul>
          </div>
        </section>
      </div>
      {cruise.pending ? <Decision /> : null}
      <section className="panel">
        <h4>Diário de bordo</h4>
        <ol className="events">
          {cruise.notes.slice().reverse().map((n, i) => (
            <li key={i} className={n.ok ? '' : 'warnev'}><span className="mono">{formatJd(n.jd)}</span><span><strong>{n.title}:</strong> {n.text}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Decision() {
  const { state, dispatch } = useMission();
  const cruise = state.cruise!;
  const eph = ephemerisOf(state);
  const pending = cruise.pending!;
  if (pending.kind === 'tcm') {
    const slot = cruise.tcms.find((t) => t.id === pending.id)!;
    const preview = tcmPreview(cruise, eph);
    const link = commsAt(cruise, eph);
    const blocked = link.state === 'indisponivel' ? link.reason : cruise.jd < cruise.safeModeUntil ? 'A sonda está em modo seguro.' : null;
    return (
      <section className="decision" aria-label={`Decisão: ${slot.label}`}>
        <h3>{slot.label}: correção de trajetória</h3>
        <p>
          Sem manobra, a sonda passaria a {preview.miss.outcome === 'longe' ? `${fmt(preview.miss.B)} km de Marte, fora da esfera de influência` : `${fmt(preview.miss.periapsisAltKm)} km de altitude no periapse (alvo: ${fmt(CAPTURE_ORBITS[cruise.captureOrbit].periAltKm)} km)`}.
        </p>
        <p>
          Corrigir agora: <strong>{preview.now ? `${fmt(preview.now.deltaV, 2)} m/s` : 'sem solução'}</strong>
          {preview.later ? <> · esperar até {preview.later.label}: <strong>{fmt(preview.later.deltaV, 2)} m/s</strong></> : ' · esta é a última oportunidade antes da chegada'}
          {' '}· disponível: {fmt(preview.available)} m/s.
        </p>
        <p className="small muted">Ambos os valores vêm do mesmo cálculo de Lambert a partir do estado previsto em cada data; a diferença depende da geometria, não de uma regra fixa.</p>
        {blocked ? <p className="bad small">Comando impossível agora: {blocked}</p> : null}
        <div className="row">
          <button type="button" className="btn primary" disabled={!!blocked || !preview.now} onClick={() => dispatch({ type: 'tcm', id: slot.id, execute: true })}>Executar correção</button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'tcm', id: slot.id, execute: false })}>Dispensar</button>
        </div>
      </section>
    );
  }
  if (pending.kind === 'solar') {
    const { event, exposed, arrivalJd, separationDeg, distanceAu } = evaluateSolarEvent(cruise, pending.id);
    const responses = [
      { id: 'manter' as const, title: 'Manter operações', text: 'Nenhum custo imediato. Se a nuvem atingir a sonda, há risco de dano.' },
      { id: 'protecao' as const, title: 'Modo de proteção', text: `Desliga instrumentos e suspende manobras por ~2 dias em torno da passagem. Correções próximas são adiadas.` },
      { id: 'replanejar' as const, title: 'Replanejar e reorientar', text: 'Gira a sonda para usar os tanques como escudo (2 kg de propelente) e reagenda correções. Risco cai pela metade.' },
    ];
    return (
      <section className="decision alert" aria-label="Decisão: evento solar">
        <p className="eyebrow">Cenário de treinamento (simulado) — não é um evento real</p>
        <h3>Ejeção de massa coronal detectada</h3>
        <p>
          Velocidade {fmt(event.speedKmS)} km/s, cone de ±{fmt(event.halfWidthDeg)}°. A frente deve cruzar a distância da sonda ({fmt(distanceAu, 2)} UA) em {formatJd(arrivalJd)}.
          Pela geometria, a sonda estará a {fmt(separationDeg)}° do eixo da CME: <strong className={exposed ? 'bad' : 'good'}>{exposed ? 'dentro do cone (exposição prevista)' : 'fora do cone'}</strong>.
        </p>
        <div className="options">
          {responses.map((r) => (
            <button key={r.id} type="button" className="option" onClick={() => dispatch({ type: 'resposta-solar', id: event.id, response: r.id })}>
              <strong>{r.title}</strong>
              <span className="small">{r.text}</span>
              <br />
              <span className="small muted">Chance de dano: {exposed ? `${fmt(damageProbability(event.speedKmS, cruise.shielded, r.id) * 100)}%` : '0% (fora do cone)'}</span>
            </button>
          ))}
        </div>
        <p className="small muted">{state.solarCalibration.description}</p>
      </section>
    );
  }
  const { arrival, deltaV: need, available } = captureRequirement(cruise, eph);
  const orbit = CAPTURE_ORBITS[cruise.captureOrbit];
  return (
    <section className="decision" aria-label="Decisão: inserção orbital">
      <h3>Chegada a Marte</h3>
      <p>v∞ {fmt(arrival.vInf, 2)} km/s · parâmetro de impacto {fmt(arrival.B)} km · periapse {arrival.outcome === 'longe' ? 'fora da esfera de influência' : `${fmt(arrival.periapsisAltKm)} km de altitude`}.</p>
      {arrival.outcome === 'captura-possivel' ? (
        <p>Inserção em {orbit.name}: <strong>{fmt(need)} m/s</strong> necessários · {fmt(available)} m/s disponíveis {available < need ? <span className="bad">— propelente insuficiente</span> : null}</p>
      ) : <p className="bad">{arrival.outcome === 'impacto' ? 'O periapse está dentro da atmosfera.' : 'A sonda não passa perto o bastante para ser capturada.'}</p>}
      <button type="button" className="btn primary" onClick={() => dispatch({ type: 'captura' })}>Executar inserção orbital</button>
    </section>
  );
}

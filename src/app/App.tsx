import { useEffect, useRef } from 'react';
import { PhysicsPanel } from '../components/PhysicsPanel';
import { Checklist } from '../features/checklist/Checklist';
import { Cruise } from '../features/flight/Cruise';
import { Launch } from '../features/flight/Launch';
import { Hangar } from '../features/hangar/Hangar';
import { MarsOperations } from '../features/mars-operations/MarsOperations';
import { MissionCenter } from '../features/mission-center/MissionCenter';
import { Planning } from '../features/mission-planning/Planning';
import { Report } from '../features/reports/Report';
import { PHASES, reachablePhases, type MissionState } from '../state/mission';
import { MissionProvider, useMission } from '../state/MissionContext';

export function App({ initial }: { initial?: MissionState }) {
  return (
    <MissionProvider initial={initial}>
      <Shell />
    </MissionProvider>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)" />
      <circle cx="20.2" cy="8" r="1.3" fill="currentColor" />
    </svg>
  );
}

function Shell() {
  const { state, dispatch } = useMission();
  const reachable = reachablePhases(state);
  const mainRef = useRef<HTMLElement>(null);
  const currentIndex = PHASES.findIndex((p) => p.id === state.phase);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }, [state.phase]);

  const screen = {
    centro: <MissionCenter />,
    hangar: <Hangar />,
    planejamento: <Planning />,
    checklist: <Checklist />,
    lancamento: <Launch />,
    cruzeiro: <Cruise />,
    marte: <MarsOperations />,
    relatorio: <Report />,
  }[state.phase];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><Logo /> Mission Architect</div>
        <nav aria-label="Etapas da missão" style={{ flex: 1, minWidth: 0 }}>
          <ol className="stepper">
            {PHASES.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={p.id === state.phase ? 'step' : undefined}
                  className={i < currentIndex ? 'done' : undefined}
                  disabled={!reachable.includes(p.id)}
                  onClick={() => dispatch({ type: 'ir', phase: p.id })}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </header>
      <div className={`layout ${state.phase === 'centro' ? 'wide' : ''}`}>
        <main id="main" ref={mainRef} tabIndex={-1} aria-label={PHASES[currentIndex]?.label}>
          {screen}
        </main>
        {state.phase !== 'centro' ? <PhysicsPanel /> : null}
      </div>
      {state.notice ? (
        <div className="notice" role="alert">
          <span>{state.notice}</span>
          <button type="button" className="btn small" onClick={() => dispatch({ type: 'aviso', message: null })}>Fechar</button>
        </div>
      ) : null}
    </div>
  );
}

import { Metric, Metrics } from '../../components/Metric';
import { AMPLIFIERS, ANTENNAS, BATTERIES, INSTRUMENTS, POWER, PROPULSION, RADIATION_SHIELD, RECORDERS, TANKS, type ProbeConfig } from '../../data/probe';
import { fmt } from '../../domain/units';
import { useMission } from '../../state/MissionContext';

function Choice<T extends { id: string; name: string }>({ label, items, value, onChange, describe }: { label: string; items: T[]; value: string; onChange: (id: string) => void; describe: (item: T) => string }) {
  return (
    <label className="field">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name} — {describe(i)}</option>)}
      </select>
    </label>
  );
}

export function ProbeBuilder() {
  const { state, dispatch, plan } = useMission();
  const p = state.design.probe;
  const set = (patch: Partial<ProbeConfig>) => dispatch({ type: 'sonda', patch });
  const tank = TANKS[p.tankId];
  return (
    <div className="stack" role="tabpanel">
      <Metrics label="Resumo da sonda">
        <Metric label="Massa seca" value={fmt(plan.probe.dryMass)} unit="kg" />
        <Metric label="Massa com propelente" value={fmt(plan.probe.wetMass)} unit="kg" />
        <Metric label="Δv da sonda" value={fmt(plan.probe.deltaV)} unit="m/s" tone={plan.probe.deltaV < plan.captureDeltaV ? 'bad' : undefined} />
        <Metric label="Energia em Marte" value={fmt(plan.powerAtMars)} unit="W" />
        <Metric label="Custo da sonda" value={fmt(plan.probe.cost)} unit="US$ M*" />
      </Metrics>
      <h4>Propulsão</h4>
      <Choice label="Sistema" items={Object.values(PROPULSION)} value={p.propulsionId} onChange={(id) => set({ propulsionId: id })} describe={(i) => `Isp ${i.isp} s`} />
      <p className="small muted">{PROPULSION[p.propulsionId].description}</p>
      <Choice label="Tanques" items={Object.values(TANKS)} value={p.tankId} onChange={(id) => set({ tankId: id, propellant: Math.min(p.propellant, TANKS[id].capacity) })} describe={(i) => `${fmt(i.dryMass)} kg secos`} />
      <label className="field">Propelente carregado: {fmt(p.propellant)} kg de {fmt(tank.capacity)} kg
        <input type="range" min={0} max={tank.capacity} step={25} value={p.propellant} onChange={(e) => set({ propellant: Number(e.target.value) })} />
      </label>
      <h4>Energia e comunicação</h4>
      <Choice label="Geração" items={Object.values(POWER)} value={p.powerId} onChange={(id) => set({ powerId: id })} describe={(i) => `${fmt(i.mass)} kg`} />
      <Choice label="Bateria" items={Object.values(BATTERIES)} value={p.batteryId} onChange={(id) => set({ batteryId: id })} describe={(i) => `${fmt(i.mass)} kg`} />
      <Choice label="Antena" items={Object.values(ANTENNAS)} value={p.antennaId} onChange={(id) => set({ antennaId: id })} describe={(i) => `${fmt(i.mass)} kg, exige coifa de ${i.envelope} m`} />
      <Choice label="Transmissor" items={Object.values(AMPLIFIERS)} value={p.amplifierId} onChange={(id) => set({ amplifierId: id })} describe={(i) => `${i.dcWatts} W de consumo`} />
      <Choice label="Gravador de dados" items={Object.values(RECORDERS)} value={p.recorderId} onChange={(id) => set({ recorderId: id })} describe={(i) => `${fmt(i.mass)} kg`} />
      <h4>Instrumentos científicos</h4>
      <p className="small muted">Inspirados em instrumentos do MRO e do MAVEN para contexto; os parâmetros são aproximações didáticas.</p>
      <ul className="part-list">
        {Object.values(INSTRUMENTS).map((i) => (
          <li key={i.id}>
            <label className="part-option" style={{ cursor: 'pointer' }}>
              <span>
                <strong>{i.name}</strong> <span className="muted small">(inspirado em {i.inspiredBy})</span>
                <br />
                <span className="muted small">{fmt(i.mass)} kg · {fmt(i.power)} W · {fmt(i.dataPerSol, 1)} Gbit/sol · US$ {fmt(i.cost)} M* — {i.description}</span>
              </span>
              <input type="checkbox" checked={p.instruments.includes(i.id)} onChange={() => dispatch({ type: 'instrumento', id: i.id })} aria-label={`Instalar ${i.name}`} />
            </label>
          </li>
        ))}
      </ul>
      <label className="row small">
        <input type="checkbox" checked={p.shield} onChange={(e) => set({ shield: e.target.checked })} />
        {RADIATION_SHIELD.name} (+{RADIATION_SHIELD.mass} kg): reduz em 60% a chance de dano por eventos solares.
      </label>
    </div>
  );
}

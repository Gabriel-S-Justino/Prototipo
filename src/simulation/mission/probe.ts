// Resumo da sonda: massas, Δv próprio (equação do foguete), energia, comunicação, dados e custo.
import { AMPLIFIERS, ANTENNAS, BATTERIES, BUS, INSTRUMENTS, PAYLOAD_ADAPTER_MASS, POWER, PROPULSION, RADIATION_SHIELD, RECORDERS, TANKS, type Instrument, type ProbeConfig } from '../../data/probe';
import { G0 } from '../../domain/units';
import { powerGeneration } from './power';

export interface ProbeIssue { code: string; severity: 'erro' | 'aviso'; message: string }

export interface ProbeStats {
  config: ProbeConfig;
  instruments: Instrument[];
  dryMass: number;
  propellant: number;
  wetMass: number;
  /** Massa que o lançador precisa injetar: sonda + adaptador (kg). */
  launchMass: number;
  isp: number;
  /** Δv total da propulsão da sonda com o tanque cheio (m/s). */
  deltaV: number;
  /** Consumo do barramento e da comunicação em transmissão (W). */
  busPower: number;
  commsPower: number;
  instrumentPeakPower: number;
  batteryWh: number;
  recorderGbit: number;
  /** Diâmetro mínimo de coifa exigido pela antena estivada (m). */
  envelope: number;
  cost: number;
  issues: ProbeIssue[];
}

export function probeStats(config: ProbeConfig): ProbeStats {
  const prop = PROPULSION[config.propulsionId];
  const tank = TANKS[config.tankId];
  const power = POWER[config.powerId];
  const battery = BATTERIES[config.batteryId];
  const antenna = ANTENNAS[config.antennaId];
  const amp = AMPLIFIERS[config.amplifierId];
  const recorder = RECORDERS[config.recorderId];
  if (!prop || !tank || !power || !battery || !antenna || !amp || !recorder) throw new Error('Configuração da sonda referencia uma peça inexistente.');
  const instruments = config.instruments.map((id) => INSTRUMENTS[id]).filter(Boolean);
  const issues: ProbeIssue[] = [];
  if (instruments.length === 0) issues.push({ code: 'sem-instrumento', severity: 'erro', message: 'A sonda precisa de pelo menos um instrumento científico.' });
  if (new Set(config.instruments).size !== config.instruments.length) issues.push({ code: 'instrumento-duplicado', severity: 'erro', message: 'Cada instrumento só pode ser instalado uma vez.' });
  if (config.propellant < 0 || config.propellant > tank.capacity) issues.push({ code: 'tanque', severity: 'erro', message: `O propelente (${config.propellant} kg) excede a capacidade dos tanques (${tank.capacity} kg).` });
  const propellant = Math.max(0, Math.min(config.propellant, tank.capacity));

  const dryMass = BUS.dryMass + prop.dryMass + tank.dryMass + power.mass + battery.mass + antenna.mass + amp.mass + recorder.mass
    + instruments.reduce((s, i) => s + i.mass, 0) + (config.shield ? RADIATION_SHIELD.mass : 0);
  const wetMass = dryMass + propellant;
  const cost = BUS.cost + prop.cost + tank.cost + power.cost + battery.cost + antenna.cost + amp.cost + recorder.cost
    + instruments.reduce((s, i) => s + i.cost, 0) + (config.shield ? RADIATION_SHIELD.cost : 0);
  return {
    config,
    instruments,
    dryMass,
    propellant,
    wetMass,
    launchMass: wetMass + PAYLOAD_ADAPTER_MASS,
    isp: prop.isp,
    deltaV: propellant > 0 ? prop.isp * G0 * Math.log(wetMass / dryMass) : 0,
    busPower: BUS.power,
    commsPower: amp.dcWatts,
    instrumentPeakPower: instruments.reduce((s, i) => s + i.power, 0),
    batteryWh: battery.capacityWh,
    recorderGbit: recorder.capacityGbit,
    envelope: antenna.envelope,
    cost,
    issues,
  };
}

/** Propelente (kg) necessário para um Δv (m/s) partindo da massa atual. */
export function propellantFor(deltaV: number, currentMass: number, isp: number): number {
  return currentMass * (1 - Math.exp(-deltaV / (isp * G0)));
}

/** Δv (m/s) disponível com o propelente restante. */
export function deltaVAvailable(dryMass: number, propellant: number, isp: number): number {
  return propellant > 0 ? isp * G0 * Math.log((dryMass + propellant) / dryMass) : 0;
}

/** Potência média gerada em Marte (W) para a configuração, sem atenuação por poeira. */
export function powerAtMars(config: ProbeConfig, marsSunAu: number, attenuation = 1) {
  return powerGeneration(config.powerId, marsSunAu, attenuation);
}

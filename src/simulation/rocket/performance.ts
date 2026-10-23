// Desempenho do lançador: equação do foguete por fases de queima, perdas gravitacionais e aerodinâmicas
// estimadas, requisito até a órbita de estacionamento e injeção interplanetária (C3).
// Nível de fidelidade: modelo de energia (Δv) por fases, sem integração de trajetória. Ver docs/FISICA.md.
import { DEG, G0, MU, RADIUS } from '../../domain/units';
import type { AssembledVehicle } from './vehicle';

/** Δv ideal de Tsiolkovsky (m/s). */
export function rocketEquation(isp: number, m0: number, mf: number): number {
  if (!(m0 > 0) || !(mf > 0) || mf > m0) throw new RangeError('Massas inválidas para a equação do foguete.');
  return isp * G0 * Math.log(m0 / mf);
}

/** Vazão mássica (kg/s) para empuxo em kN e Isp em s. */
export const massFlow = (thrustKN: number, isp: number) => (thrustKN * 1000) / (isp * G0);

export const PARKING_ALTITUDE_KM = 200;
export const R_PARKING = RADIUS.earth + PARKING_ALTITUDE_KM;
/** Velocidade de rotação no equador (m/s) e latitude do Cabo Canaveral (graus). */
export const EQUATOR_ROTATION = 465.1;
export const LAUNCH_SITE_LATITUDE = 28.5;
/** Inclinação máxima permitida pela segurança de alcance na costa leste (graus, aproximação). */
export const MAX_PARKING_INCLINATION = 57;
export const DRAG_LOSS = 150;
/**
 * Perda gravitacional ≈ g0 · t · ⟨sen γ⟩ por fase, com ⟨sen γ⟩ (fração média da queima "contra" a gravidade)
 * empírico: subida quase vertical na atmosfera (escalada por 1,35/TWR: foguetes lentos perdem mais), arco de
 * gravidade em altitude e voo quase horizontal no estágio superior. Os coeficientes foram escolhidos para que a
 * subida até 200 km fique na faixa de 9,3–9,6 km/s citada em livros-texto (Curtis; Sutton & Biblarz). Não foram
 * calibrados contra curvas oficiais do NASA LSP. Ver docs/FISICA.md.
 */
export const GRAVITY_LOSS_FACTOR = { atmospheric: 0.7, core: 0.35, upper: 0.05 } as const;
export const STEERING_LOSS = 60;

export interface BurnPhase {
  id: 'boosters' | 'core-atmosferico' | 'core' | 'superior';
  label: string;
  start: number;
  duration: number;
  /** Empuxo médio efetivo (kN) e Isp efetivo (s) da fase. */
  thrust: number;
  isp: number;
  m0: number;
  mf: number;
  deltaV: number;
  gravityLoss: number;
  /** Massa descartada ao final da fase (kg) e o que é descartado. */
  jettison: { mass: number; label: string } | null;
}

export interface Performance {
  payload: number;
  liftoffMass: number;
  liftoffThrust: number;
  liftoffTWR: number;
  phases: BurnPhase[];
  idealDeltaV: number;
  gravityLoss: number;
  dragLoss: number;
  steeringLoss: number;
  /** Ganho da rotação da Terra para a inclinação da órbita de estacionamento (m/s). */
  rotationBonus: number;
  parkingInclination: number;
  /** Δv necessário até a órbita de estacionamento, já com perdas e rotação (m/s). */
  leoRequirement: number;
  /** Δv que sobra para a injeção interplanetária (m/s). */
  departureDeltaVAvailable: number;
}

/** Δv da queima de injeção a partir da órbita circular de estacionamento para atingir C3 (m/s). */
export function departureDeltaV(c3: number, rPark = R_PARKING): number {
  const vEsc2 = (2 * MU.earth) / rPark;
  return (Math.sqrt(c3 + vEsc2) - Math.sqrt(MU.earth / rPark)) * 1000;
}

/** C3 (km²/s²) obtido com uma queima de Δv (m/s) a partir da órbita de estacionamento. */
export function c3FromDeparture(dv: number, rPark = R_PARKING): number {
  const v = Math.sqrt(MU.earth / rPark) + dv / 1000;
  return v * v - (2 * MU.earth) / rPark;
}

/** Inclinação mínima da órbita de estacionamento para atingir a declinação da assíntota (DLA). */
export function parkingInclinationFor(dlaDeg: number): number {
  return Math.min(MAX_PARKING_INCLINATION, Math.max(LAUNCH_SITE_LATITUDE, Math.abs(dlaDeg)));
}

export function vehiclePerformance(vehicle: AssembledVehicle, payload: number, dlaDeg = 0): Performance {
  const { core, coreEngine, upper, upperEngine, booster, boosterEngine, fairing, config } = vehicle;
  const nB = booster ? config.boosterCount : 0;
  const coreFlow = massFlow(coreEngine.thrustVac * core.engineCount, coreEngine.ispVac);
  const coreBurn = vehicle.coreProp / coreFlow;
  const coreIspSL = coreEngine.ispSL ?? coreEngine.ispVac;

  let boosterFlow = 0;
  let boosterBurn = 0;
  let boosterThrustSL = 0;
  let boosterIspMean = 0;
  if (booster && nB > 0) {
    if (booster.kind === 'solido') {
      boosterFlow = (booster.propellant / (booster.burnTime ?? 1)) * nB;
      boosterBurn = booster.burnTime ?? 0;
    } else {
      boosterFlow = massFlow((boosterEngine?.thrustVac ?? 0) * (booster.engineCount ?? 1), booster.ispVac) * nB;
      boosterBurn = (booster.propellant * nB) / boosterFlow;
    }
    boosterThrustSL = (boosterFlow * booster.ispSL * G0) / 1000;
    boosterIspMean = (booster.ispSL + booster.ispVac) / 2;
  }

  const liftoffMass = vehicle.grossMass + payload;
  const coreThrustSL = (coreFlow * coreIspSL * G0) / 1000;
  const liftoffThrust = coreThrustSL + boosterThrustSL;
  const liftoffTWR = (liftoffThrust * 1000) / (liftoffMass * G0);

  const phases: BurnPhase[] = [];
  let m = liftoffMass;
  let t = 0;
  // Fase 1: decolagem e atmosfera densa (Isp médio entre nível do mar e vácuo).
  const firstDuration = nB > 0 ? Math.min(boosterBurn, coreBurn) : Math.min(120, coreBurn);
  const coreMean = (coreIspSL + coreEngine.ispVac) / 2;
  const flow1 = coreFlow + (nB > 0 ? boosterFlow : 0);
  const thrust1 = (coreFlow * coreMean * G0 + (nB > 0 ? boosterFlow * boosterIspMean * G0 : 0)) / 1000;
  const isp1 = (thrust1 * 1000) / (flow1 * G0);
  const s1 = Math.min(0.98, Math.max(0.45, (GRAVITY_LOSS_FACTOR.atmospheric * 1.35) / Math.max(liftoffTWR, 0.1)));
  const mf1 = m - flow1 * firstDuration;
  phases.push({
    id: nB > 0 ? 'boosters' : 'core-atmosferico',
    label: nB > 0 ? `Núcleo + ${nB} propulsor(es)` : 'Núcleo na atmosfera densa',
    start: t, duration: firstDuration, thrust: thrust1, isp: isp1, m0: m, mf: mf1,
    deltaV: rocketEquation(isp1, m, mf1), gravityLoss: G0 * firstDuration * s1,
    jettison: nB > 0 && booster ? { mass: booster.dry * nB, label: `Separação de ${nB} propulsor(es) laterais` } : null,
  });
  m = mf1 - (nB > 0 && booster ? booster.dry * nB : 0);
  t += firstDuration;

  // Fase 2: restante do núcleo em altitude.
  const coreLeft = vehicle.coreProp - coreFlow * firstDuration;
  if (coreLeft > 1) {
    const isp2 = 0.2 * coreIspSL + 0.8 * coreEngine.ispVac;
    const dur2 = coreLeft / coreFlow;
    const mf2 = m - coreLeft;
    phases.push({
      id: 'core', label: 'Núcleo em altitude', start: t, duration: dur2,
      thrust: (coreFlow * isp2 * G0) / 1000, isp: isp2, m0: m, mf: mf2,
      deltaV: rocketEquation(isp2, m, mf2), gravityLoss: G0 * dur2 * GRAVITY_LOSS_FACTOR.core, jettison: null,
    });
    m = mf2;
    t += dur2;
  }
  phases[phases.length - 1].jettison = {
    mass: core.dry + fairing.mass + (phases[phases.length - 1].jettison?.mass ?? 0),
    label: `${phases[phases.length - 1].jettison ? phases[phases.length - 1].jettison!.label + ', ' : ''}separação do núcleo e da coifa`,
  };
  m -= core.dry + fairing.mass;

  // Fase 3: estágio superior.
  const upperFlow = massFlow(upperEngine.thrustVac * config.upperEngineCount, upperEngine.ispVac);
  const dur3 = vehicle.upperProp / upperFlow;
  const mf3 = m - vehicle.upperProp;
  phases.push({
    id: 'superior', label: `${upper.name} (${config.upperEngineCount}× ${upperEngine.name})`, start: t, duration: dur3,
    thrust: upperEngine.thrustVac * config.upperEngineCount, isp: upperEngine.ispVac, m0: m, mf: mf3,
    deltaV: rocketEquation(upperEngine.ispVac, m, mf3), gravityLoss: G0 * dur3 * GRAVITY_LOSS_FACTOR.upper, jettison: null,
  });

  const idealDeltaV = phases.reduce((s, p) => s + p.deltaV, 0);
  const gravityLoss = phases.reduce((s, p) => s + p.gravityLoss, 0);
  const parkingInclination = parkingInclinationFor(dlaDeg);
  const rotationBonus = EQUATOR_ROTATION * Math.cos(parkingInclination * DEG);
  const vCirc = Math.sqrt(MU.earth / R_PARKING) * 1000;
  const leoRequirement = vCirc + gravityLoss + DRAG_LOSS + STEERING_LOSS - rotationBonus;
  return {
    payload, liftoffMass, liftoffThrust, liftoffTWR, phases, idealDeltaV, gravityLoss,
    dragLoss: DRAG_LOSS, steeringLoss: STEERING_LOSS, rotationBonus, parkingInclination, leoRequirement,
    departureDeltaVAvailable: idealDeltaV - leoRequirement,
  };
}

/** C3 atingível com uma carga útil (km²/s²); null se não chega à órbita de estacionamento ou não decola. */
export function achievableC3(vehicle: AssembledVehicle, payload: number, dlaDeg = 0): number | null {
  const perf = vehiclePerformance(vehicle, payload, dlaDeg);
  if (perf.liftoffTWR <= 1 || perf.departureDeltaVAvailable < 0) return null;
  return c3FromDeparture(perf.departureDeltaVAvailable);
}

/**
 * Capacidade de carga (kg) para uma energia de injeção C3 (km²/s²), por bisseção na massa da carga.
 * Considera a DLA via inclinação da órbita de estacionamento. Retorna 0 se nem sem carga o veículo atinge C3.
 */
export function payloadCapacity(vehicle: AssembledVehicle, c3: number, dlaDeg = 0): number {
  const need = departureDeltaV(c3);
  const margin = (p: number) => {
    const perf = vehiclePerformance(vehicle, p, dlaDeg);
    return perf.liftoffTWR > 1 ? perf.departureDeltaVAvailable - need : -Infinity;
  };
  if (margin(0) < 0) return 0;
  let lo = 0;
  let hi = 200_000;
  if (margin(hi) >= 0) return hi;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (margin(mid) >= 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

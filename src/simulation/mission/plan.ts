// Fonte única da verdade do planejamento: data → trajetória → C3 → capacidade do lançador →
// limite de massa da sonda → orçamento → checklist. Todas as telas usam derivePlan().
import type { VehicleConfig } from '../../data/launchers';
import type { ProbeConfig } from '../../data/probe';
import { AU_KM } from '../../domain/units';
import type { Ephemeris } from '../orbital/ephemeris';
import { computeTransfer, type Transfer, type TransferFailure } from '../orbital/transfer';
import { achievableC3, payloadCapacity, vehiclePerformance, type Performance } from '../rocket/performance';
import { assembleVehicle, type AssembledVehicle } from '../rocket/vehicle';
import { computeBudget, OPERATIONS_DAYS, type Budget } from './budget';
import { CAPTURE_ORBITS, plannedCaptureDeltaV, type CaptureOrbitId } from './capture';
import { buildChecklist, type ChecklistItem } from './checklist';
import { linkBudget, type LinkBudget } from './comms';
import { earthMarsGeometry } from './geometry';
import { powerAtMars, probeStats, type ProbeStats } from './probe';

export interface MissionDesign {
  vehicle: VehicleConfig;
  probe: ProbeConfig;
  captureOrbit: CaptureOrbitId;
}

export interface TrajectorySelection {
  departureJd: number;
  tofDays: number;
}

/** Reserva de Δv da sonda para correções de trajetória (m/s). */
export const TCM_RESERVE = 40;

export interface MissionPlan {
  vehicle: AssembledVehicle;
  probe: ProbeStats;
  transfer: Transfer | TransferFailure;
  /** Capacidade do lançador para a C3/DLA da trajetória (kg) e margem em relação à massa a lançar. */
  capacity: number;
  massMargin: number;
  massMarginFraction: number;
  performance: Performance;
  achievableC3: number | null;
  captureDeltaV: number;
  tcmReserve: number;
  probeDeltaVRequired: number;
  probeDeltaVMargin: number;
  budget: Budget;
  cruiseDays: number;
  arrivalJd: number;
  marsSunAu: number;
  powerAtMars: number;
  /** Consumo nominal em Marte: barramento + transmissor + instrumentos no pico (W). */
  powerNeedPeak: number;
  commsAtArrival: LinkBudget | null;
  commsWorst: LinkBudget | null;
  checklist: ChecklistItem[];
  goForLaunch: boolean;
}

export function derivePlan(design: MissionDesign, selection: TrajectorySelection, eph: Ephemeris): MissionPlan {
  const vehicle = assembleVehicle(design.vehicle);
  const probe = probeStats(design.probe);
  const transfer = computeTransfer(eph, selection.departureJd, selection.tofDays);
  const dla = transfer.ok ? transfer.dlaDeg : 0;
  const capacity = transfer.ok ? payloadCapacity(vehicle, transfer.c3, dla) : 0;
  const massMargin = capacity - probe.launchMass;
  const performance = vehiclePerformance(vehicle, probe.launchMass, dla);
  const captureDeltaV = transfer.ok ? plannedCaptureDeltaV(transfer.vInfArr, design.captureOrbit) : NaN;
  const probeDeltaVRequired = captureDeltaV + TCM_RESERVE;
  const cruiseDays = selection.tofDays;
  const arrivalJd = selection.departureJd + selection.tofDays;
  const budget = computeBudget(vehicle, probe, cruiseDays);

  let marsSunAu = 1.52;
  let commsAtArrival: LinkBudget | null = null;
  let commsWorst: LinkBudget | null = null;
  try {
    const geo = earthMarsGeometry(eph, arrivalJd);
    marsSunAu = geo.marsSunKm / AU_KM;
    commsAtArrival = linkBudget(design.probe.antennaId, design.probe.amplifierId, geo.distanceKm, geo.sepDeg);
    let worst = geo;
    for (let d = 0; d <= OPERATIONS_DAYS; d += 10) {
      const g = earthMarsGeometry(eph, arrivalJd + d);
      if (g.distanceKm > worst.distanceKm) worst = g;
    }
    commsWorst = linkBudget(design.probe.antennaId, design.probe.amplifierId, worst.distanceKm, 180);
  } catch {
    // Fora do intervalo das efemérides: o checklist acusa a inconsistência da trajetória.
  }
  const power = powerAtMars(design.probe, marsSunAu);
  const powerNeedPeak = probe.busPower + probe.commsPower + probe.instrumentPeakPower;

  const partial = {
    vehicle, probe, transfer, capacity, massMargin,
    massMarginFraction: probe.launchMass > 0 ? massMargin / probe.launchMass : 0,
    performance, achievableC3: achievableC3(vehicle, probe.launchMass, dla), captureDeltaV, tcmReserve: TCM_RESERVE,
    probeDeltaVRequired, probeDeltaVMargin: probe.deltaV - probeDeltaVRequired, budget, cruiseDays, arrivalJd,
    marsSunAu, powerAtMars: power, powerNeedPeak, commsAtArrival, commsWorst,
  };
  const checklist = buildChecklist({ ...partial, captureOrbit: design.captureOrbit, sunlitFraction: CAPTURE_ORBITS[design.captureOrbit].sunlitFraction });
  return { ...partial, checklist, goForLaunch: !checklist.some((c) => c.status === 'NO-GO') };
}

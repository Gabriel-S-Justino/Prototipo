// Montagem do veículo a partir da configuração do hangar: massas, custo e compatibilidade.
import { BOOSTERS, CORE_STAGES, ENGINES, FAIRINGS, LAUNCH_INTEGRATION_COST, UPPER_STAGES, type Booster, type CoreStage, type Engine, type Fairing, type UpperStage, type VehicleConfig } from '../../data/launchers';

export interface CompatibilityIssue {
  code: string;
  severity: 'erro' | 'aviso';
  message: string;
  /** Peça do hangar envolvida, para destaque na interface. */
  part: 'core' | 'upper' | 'boosters' | 'fairing' | 'engine';
}

export interface AssembledVehicle {
  config: VehicleConfig;
  core: CoreStage;
  coreEngine: Engine;
  upper: UpperStage;
  upperEngine: Engine;
  booster: Booster | null;
  boosterEngine: Engine | null;
  fairing: Fairing;
  /** Propelente efetivamente carregado (kg). */
  coreProp: number;
  upperProp: number;
  upperDry: number;
  /** Massa do veículo sem carga útil (kg). */
  grossMass: number;
  cost: number;
  issues: CompatibilityIssue[];
}

export function assembleVehicle(config: VehicleConfig): AssembledVehicle {
  const core = CORE_STAGES[config.coreId];
  const upper = UPPER_STAGES[config.upperId];
  const fairing = FAIRINGS[config.fairingId];
  if (!core || !upper || !fairing) throw new Error('Configuração do veículo referencia uma peça inexistente.');
  const booster = config.boosterId && config.boosterCount > 0 ? BOOSTERS[config.boosterId] ?? null : null;
  const upperEngine = ENGINES[config.upperEngineId] ?? ENGINES[upper.engineOptions[0]];
  const coreEngine = ENGINES[core.engineId];
  const boosterEngine = booster?.engineId ? ENGINES[booster.engineId] : null;
  const issues: CompatibilityIssue[] = [];
  const err = (code: string, part: CompatibilityIssue['part'], message: string) => issues.push({ code, severity: 'erro', part, message });
  const warn = (code: string, part: CompatibilityIssue['part'], message: string) => issues.push({ code, severity: 'aviso', part, message });

  if (upper.family !== core.family) {
    err('interface-estagio', 'upper', `${upper.name} (${upper.diameter} m) não tem interestágio para o ${core.name} (${core.diameter} m): sistemas de separação, aviônica e propelentes são de famílias diferentes.`);
  }
  if (!upper.engineOptions.includes(config.upperEngineId)) {
    err('motor-incompativel', 'engine', `${upper.name} só aceita ${upper.engineOptions.map((id) => ENGINES[id].name).join(' ou ')}.`);
  }
  if (!upper.engineCountOptions.includes(config.upperEngineCount)) {
    err('quantidade-motores', 'engine', `${upper.name} voa com ${upper.engineCountOptions.join(' ou ')} motor(es).`);
  }
  if (config.boosterId && config.boosterCount > 0) {
    const b = BOOSTERS[config.boosterId];
    if (!b) err('booster-inexistente', 'boosters', 'Propulsor lateral desconhecido.');
    else {
      if (b.family !== core.family) err('booster-familia', 'boosters', `${b.name} não tem pontos de fixação no ${core.name}.`);
      if (!b.counts.includes(config.boosterCount)) err('booster-quantidade', 'boosters', `${b.name}: quantidades possíveis ${b.counts.filter((n) => n > 0).join(', ')}.`);
      if (b.kind === 'solido' && fairing.maxSolids !== undefined && config.boosterCount > fairing.maxSolids) {
        err('coifa-solidos', 'boosters', `Com a ${fairing.name} o veículo de referência admite no máximo ${fairing.maxSolids} sólidos (cargas estruturais).`);
      }
    }
  }
  if (fairing.family !== core.family) err('coifa-familia', 'fairing', `${fairing.name} não é qualificada para o ${core.name}.`);
  if (fairing.diameter < upper.diameter) err('coifa-diametro', 'fairing', `A coifa (${fairing.diameter} m) é mais estreita que o estágio superior (${upper.diameter} m).`);
  if (config.coreLoad < 0.5 || config.coreLoad > 1 || config.upperLoad < 0.5 || config.upperLoad > 1) {
    err('carga-propelente', 'core', 'O carregamento de propelente deve ficar entre 50% e 100%.');
  } else if (config.coreLoad < 1 || config.upperLoad < 1) {
    warn('propelente-reduzido', 'core', 'Tanques parcialmente abastecidos: menos massa e menos Δv.');
  }

  const coreProp = core.propellant * config.coreLoad;
  const upperProp = upper.propellant * config.upperLoad;
  const extraEngines = Math.max(0, config.upperEngineCount - 1);
  const upperDry = upper.dry + extraEngines * upperEngine.mass;
  const boosterMass = booster ? (booster.dry + booster.propellant) * config.boosterCount : 0;
  const grossMass = core.dry + coreProp + upperDry + upperProp + fairing.mass + boosterMass;
  const cost = core.cost + upper.cost + extraEngines * 10 + (booster ? booster.cost * config.boosterCount : 0) + fairing.cost + LAUNCH_INTEGRATION_COST;
  return { config, core, coreEngine, upper, upperEngine, booster, boosterEngine, fairing, coreProp, upperProp, upperDry, grossMass, cost, issues };
}

export function hasBlockingIssue(vehicle: AssembledVehicle) {
  return vehicle.issues.some((i) => i.severity === 'erro');
}

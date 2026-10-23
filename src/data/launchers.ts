// Catálogo de componentes de lançadores inspirados em veículos reais.
// Massas em kg, empuxo em kN, Isp em s, diâmetros em m, custos em US$ milhões FICTÍCIOS (didáticos).
// Os valores foram transcritos de documentação pública citada em cada item, sem verificação online neste
// ambiente (sem acesso de rede às fontes). Itens marcados 'estimado' não têm dado oficial publicado.
// Veja docs/FOGUETES.md para a discussão de cada parâmetro.
import type { Provenance } from './provenance';

export type Family = 'atlas' | 'falcon' | 'vulcan';

export interface Engine {
  id: string;
  name: string;
  propellants: string;
  /** Empuxo ao nível do mar e no vácuo (kN). null quando o motor é exclusivo de vácuo. */
  thrustSL: number | null;
  thrustVac: number;
  ispSL: number | null;
  ispVac: number;
  /** Massa seca do motor (kg), já incluída na massa seca do estágio que o usa por padrão. */
  mass: number;
  provenance: Provenance;
}

export const ENGINES: Record<string, Engine> = {
  'rd-180': {
    id: 'rd-180', name: 'RD-180', propellants: 'LOX/RP-1',
    thrustSL: 3827, thrustVac: 4152, ispSL: 311.3, ispVac: 337.8, mass: 5480,
    provenance: { source: "NPO Energomash; ULA, Atlas V Launch Services User's Guide (2010)", status: 'publicado', confidence: 'media' },
  },
  'merlin-1d': {
    id: 'merlin-1d', name: 'Merlin 1D', propellants: 'LOX/RP-1',
    thrustSL: 845, thrustVac: 914, ispSL: 282, ispVac: 311, mass: 470,
    provenance: { source: 'SpaceX, página do Falcon 9 (empuxo); Isp e massa de fontes secundárias', status: 'estimado', confidence: 'baixa' },
  },
  'merlin-1d-vac': {
    id: 'merlin-1d-vac', name: 'Merlin 1D Vacuum', propellants: 'LOX/RP-1',
    thrustSL: null, thrustVac: 981, ispSL: null, ispVac: 348, mass: 490,
    provenance: { source: 'SpaceX, página do Falcon 9 (empuxo); Isp de fontes secundárias', status: 'estimado', confidence: 'baixa' },
  },
  'be-4': {
    id: 'be-4', name: 'BE-4', propellants: 'LOX/GNL (metano)',
    thrustSL: 2446, thrustVac: 2690, ispSL: 310, ispVac: 340, mass: 2100,
    provenance: { source: 'Blue Origin (empuxo de 550.000 lbf ao nível do mar)', status: 'estimado', confidence: 'baixa', note: 'Isp e massa não são publicados oficialmente.' },
  },
  'rl10a-4-2': {
    id: 'rl10a-4-2', name: 'RL10A-4-2', propellants: 'LOX/LH2',
    thrustSL: null, thrustVac: 99.2, ispSL: null, ispVac: 451, mass: 168,
    provenance: { source: 'Aerojet Rocketdyne, ficha técnica RL10', status: 'publicado', confidence: 'media' },
  },
  'rl10c-1': {
    id: 'rl10c-1', name: 'RL10C-1', propellants: 'LOX/LH2',
    thrustSL: null, thrustVac: 101.8, ispSL: null, ispVac: 449.7, mass: 190,
    provenance: { source: 'Aerojet Rocketdyne, ficha técnica RL10', status: 'publicado', confidence: 'media' },
  },
  'rl10c-1-1': {
    id: 'rl10c-1-1', name: 'RL10C-1-1', propellants: 'LOX/LH2',
    thrustSL: null, thrustVac: 106, ispSL: null, ispVac: 453.8, mass: 188,
    provenance: { source: 'Aerojet Rocketdyne / ULA (Centaur V)', status: 'estimado', confidence: 'baixa' },
  },
};

/** Estágio de núcleo (primeiro estágio). Massa seca inclui os motores-padrão. */
export interface CoreStage {
  id: string;
  name: string;
  family: Family;
  engineId: string;
  engineCount: number;
  dry: number;
  propellant: number;
  diameter: number;
  length: number;
  cost: number;
  provenance: Provenance;
}

export const CORE_STAGES: Record<string, CoreStage> = {
  'atlas-ccb': {
    id: 'atlas-ccb', name: 'Atlas V — Common Core Booster', family: 'atlas', engineId: 'rd-180', engineCount: 1,
    dry: 21054, propellant: 284089, diameter: 3.81, length: 32.5, cost: 70,
    provenance: { source: "ULA, Atlas V Launch Services User's Guide (2010)", status: 'publicado', confidence: 'media' },
  },
  'falcon-core': {
    id: 'falcon-core', name: 'Falcon 9 — 1º estágio (descartável)', family: 'falcon', engineId: 'merlin-1d', engineCount: 9,
    dry: 25600, propellant: 411000, diameter: 3.66, length: 41.2, cost: 45,
    provenance: { source: "SpaceX, Falcon User's Guide (2021) e fontes secundárias", status: 'estimado', confidence: 'baixa', note: 'Massas não publicadas oficialmente; desempenho modelado sem recuperação do estágio.' },
  },
  'vulcan-core': {
    id: 'vulcan-core', name: 'Vulcan — núcleo', family: 'vulcan', engineId: 'be-4', engineCount: 2,
    dry: 35000, propellant: 400000, diameter: 5.4, length: 33.3, cost: 75,
    provenance: { source: 'ULA (dimensões); massas por estimativa pública', status: 'estimado', confidence: 'baixa', note: 'Massa de propelente e seca não validadas.' },
  },
};

/** Estágio superior. Massa seca inclui UM motor; motores adicionais somam a massa do motor. */
export interface UpperStage {
  id: string;
  name: string;
  family: Family;
  engineOptions: string[];
  engineCountOptions: number[];
  dry: number;
  propellant: number;
  diameter: number;
  length: number;
  cost: number;
  provenance: Provenance;
}

export const UPPER_STAGES: Record<string, UpperStage> = {
  'centaur-iii': {
    id: 'centaur-iii', name: 'Centaur III', family: 'atlas', engineOptions: ['rl10a-4-2', 'rl10c-1'], engineCountOptions: [1, 2],
    dry: 2316, propellant: 20830, diameter: 3.05, length: 12.68, cost: 35,
    provenance: { source: "ULA, Atlas V Launch Services User's Guide (2010)", status: 'publicado', confidence: 'media' },
  },
  'falcon-s2': {
    id: 'falcon-s2', name: 'Falcon 9 — 2º estágio', family: 'falcon', engineOptions: ['merlin-1d-vac'], engineCountOptions: [1],
    dry: 3900, propellant: 107500, diameter: 3.66, length: 13.8, cost: 12,
    provenance: { source: 'Fontes secundárias', status: 'estimado', confidence: 'baixa' },
  },
  'centaur-v': {
    id: 'centaur-v', name: 'Centaur V', family: 'vulcan', engineOptions: ['rl10c-1-1'], engineCountOptions: [2],
    dry: 4500, propellant: 54000, diameter: 5.4, length: 11.7, cost: 40,
    provenance: { source: 'ULA (configuração); massas por estimativa pública', status: 'estimado', confidence: 'baixa' },
  },
};

/** Propulsores laterais. Sólidos: empuxo derivado de propelente, tempo de queima e Isp. */
export interface Booster {
  id: string;
  name: string;
  family: Family;
  kind: 'solido' | 'liquido';
  /** Quantidades permitidas pelo veículo de referência. */
  counts: number[];
  dry: number;
  propellant: number;
  ispSL: number;
  ispVac: number;
  /** Tempo de queima (s) dos sólidos; para líquidos, calculado pelo motor. */
  burnTime?: number;
  engineId?: string;
  engineCount?: number;
  cost: number;
  provenance: Provenance;
}

export const BOOSTERS: Record<string, Booster> = {
  'aj-60a': {
    id: 'aj-60a', name: 'AJ-60A (sólido)', family: 'atlas', kind: 'solido', counts: [0, 1, 2, 3, 4, 5],
    dry: 4067, propellant: 42630, ispSL: 250, ispVac: 279.3, burnTime: 94, cost: 8,
    provenance: { source: "Aerojet Rocketdyne / ULA, Atlas V Launch Services User's Guide (2010)", status: 'publicado', confidence: 'media', note: 'Isp ao nível do mar estimado.' },
  },
  'gem-63xl': {
    id: 'gem-63xl', name: 'GEM 63XL (sólido)', family: 'vulcan', kind: 'solido', counts: [0, 2, 4, 6],
    dry: 5300, propellant: 48000, ispSL: 250, ispVac: 279, burnTime: 90, cost: 7,
    provenance: { source: 'Northrop Grumman (configuração); massas por estimativa pública', status: 'estimado', confidence: 'baixa' },
  },
  'falcon-side': {
    id: 'falcon-side', name: 'Núcleo lateral Falcon Heavy', family: 'falcon', kind: 'liquido', counts: [0, 2],
    dry: 25600, propellant: 411000, ispSL: 282, ispVac: 311, engineId: 'merlin-1d', engineCount: 9, cost: 45,
    provenance: { source: 'Fontes secundárias (mesmo estágio do Falcon 9)', status: 'estimado', confidence: 'baixa' },
  },
};

export interface Fairing {
  id: string;
  name: string;
  family: Family;
  /** Diâmetro externo e envelope interno utilizável (m). */
  diameter: number;
  innerDiameter: number;
  mass: number;
  cost: number;
  /** Máximo de sólidos permitido com esta coifa (Atlas V 4xx: 3; 5xx: 5). */
  maxSolids?: number;
  provenance: Provenance;
}

export const FAIRINGS: Record<string, Fairing> = {
  'atlas-4m': {
    id: 'atlas-4m', name: 'Coifa Atlas 4 m (EPF)', family: 'atlas', diameter: 4.2, innerDiameter: 3.75, mass: 2127, cost: 8, maxSolids: 3,
    provenance: { source: "ULA, Atlas V Launch Services User's Guide (2010)", status: 'publicado', confidence: 'baixa' },
  },
  'atlas-5m': {
    id: 'atlas-5m', name: 'Coifa Atlas 5 m (curta)', family: 'atlas', diameter: 5.4, innerDiameter: 4.57, mass: 3524, cost: 14, maxSolids: 5,
    provenance: { source: "ULA, Atlas V Launch Services User's Guide (2010)", status: 'publicado', confidence: 'baixa' },
  },
  'falcon-5m': {
    id: 'falcon-5m', name: 'Coifa Falcon 5,2 m', family: 'falcon', diameter: 5.2, innerDiameter: 4.6, mass: 1900, cost: 6,
    provenance: { source: "SpaceX, Falcon User's Guide (dimensões); massa estimada", status: 'estimado', confidence: 'baixa' },
  },
  'vulcan-5m': {
    id: 'vulcan-5m', name: 'Coifa Vulcan 5,4 m', family: 'vulcan', diameter: 5.4, innerDiameter: 4.6, mass: 3500, cost: 14,
    provenance: { source: 'ULA (dimensões); massa estimada', status: 'estimado', confidence: 'baixa' },
  },
};

/** Custo fixo de integração e operações de lançamento (fictício). */
export const LAUNCH_INTEGRATION_COST = 25;

/** Configuração escolhida no hangar. */
export interface VehicleConfig {
  coreId: string;
  upperId: string;
  upperEngineId: string;
  upperEngineCount: number;
  boosterId: string | null;
  boosterCount: number;
  fairingId: string;
  /** Fração de carregamento de propelente (0,5–1) de cada estágio. */
  coreLoad: number;
  upperLoad: number;
}

/** Configurações de referência equivalentes a veículos reais (para calibração e atalhos no hangar). */
export const PRESETS: Record<string, { name: string; config: VehicleConfig }> = {
  'atlas-401': {
    name: 'Atlas V 401',
    config: { coreId: 'atlas-ccb', upperId: 'centaur-iii', upperEngineId: 'rl10c-1', upperEngineCount: 1, boosterId: null, boosterCount: 0, fairingId: 'atlas-4m', coreLoad: 1, upperLoad: 1 },
  },
  'atlas-541': {
    name: 'Atlas V 541',
    config: { coreId: 'atlas-ccb', upperId: 'centaur-iii', upperEngineId: 'rl10c-1', upperEngineCount: 1, boosterId: 'aj-60a', boosterCount: 4, fairingId: 'atlas-5m', coreLoad: 1, upperLoad: 1 },
  },
  'falcon-9': {
    name: 'Falcon 9 (descartável)',
    config: { coreId: 'falcon-core', upperId: 'falcon-s2', upperEngineId: 'merlin-1d-vac', upperEngineCount: 1, boosterId: null, boosterCount: 0, fairingId: 'falcon-5m', coreLoad: 1, upperLoad: 1 },
  },
  'falcon-heavy': {
    name: 'Falcon Heavy (descartável)',
    config: { coreId: 'falcon-core', upperId: 'falcon-s2', upperEngineId: 'merlin-1d-vac', upperEngineCount: 1, boosterId: 'falcon-side', boosterCount: 2, fairingId: 'falcon-5m', coreLoad: 1, upperLoad: 1 },
  },
  'vulcan-vc4': {
    name: 'Vulcan VC4',
    config: { coreId: 'vulcan-core', upperId: 'centaur-v', upperEngineId: 'rl10c-1-1', upperEngineCount: 2, boosterId: 'gem-63xl', boosterCount: 4, fairingId: 'vulcan-5m', coreLoad: 1, upperLoad: 1 },
  },
};

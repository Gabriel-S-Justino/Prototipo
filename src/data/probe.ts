// Catálogo da sonda (orbitador de Marte). Massas em kg, potências em W, custos em US$ milhões FICTÍCIOS.
// Os instrumentos são "inspirados em" instrumentos reais do MRO e do MAVEN apenas para contextualização:
// os parâmetros são aproximações didáticas e NÃO especificações oficiais desses instrumentos.
import type { Provenance } from './provenance';

const DIDATICO: Provenance = { source: 'Valor didático do Mission Architect', status: 'didatico', confidence: 'baixa' };

export interface PropulsionOption {
  id: string;
  name: string;
  isp: number;
  /** Massa seca do sistema (motores, válvulas, linhas) além dos tanques (kg). */
  dryMass: number;
  cost: number;
  description: string;
  provenance: Provenance;
}

export const PROPULSION: Record<string, PropulsionOption> = {
  mono: {
    id: 'mono', name: 'Monopropelente (hidrazina)', isp: 227, dryMass: 35, cost: 15,
    description: 'Simples e confiável, mas pouco eficiente (Isp baixo). Usada em várias sondas de Marte.',
    provenance: { source: 'Faixa típica de propulsores de hidrazina (Sutton & Biblarz)', status: 'estimado', confidence: 'media' },
  },
  biprop: {
    id: 'biprop', name: 'Bipropelente (MMH/NTO)', isp: 318, dryMass: 60, cost: 30,
    description: 'Mais eficiente: cada quilo de propelente rende cerca de 40% mais Δv, ao custo de massa e complexidade.',
    provenance: { source: 'Faixa típica de motores bipropelentes de 400–500 N (Sutton & Biblarz)', status: 'estimado', confidence: 'media' },
  },
};

export interface TankOption {
  id: string;
  name: string;
  capacity: number;
  dryMass: number;
  cost: number;
}

export const TANKS: Record<string, TankOption> = {
  't600': { id: 't600', name: 'Tanques 600 kg', capacity: 600, dryMass: 45, cost: 5 },
  't1200': { id: 't1200', name: 'Tanques 1.200 kg', capacity: 1200, dryMass: 85, cost: 8 },
  't1800': { id: 't1800', name: 'Tanques 1.800 kg', capacity: 1800, dryMass: 125, cost: 11 },
};

export interface PowerOption {
  id: string;
  name: string;
  kind: 'solar' | 'rtg';
  /** Área do painel (m²) para solares; potência elétrica fixa (W) para RTG. */
  area?: number;
  watts?: number;
  mass: number;
  cost: number;
  description: string;
  provenance: Provenance;
}

export const POWER: Record<string, PowerOption> = {
  'solar-10': { id: 'solar-10', name: 'Painéis solares 10 m²', kind: 'solar', area: 10, mass: 50, cost: 15, description: 'A potência cai com o quadrado da distância ao Sol.', provenance: DIDATICO },
  'solar-20': { id: 'solar-20', name: 'Painéis solares 20 m²', kind: 'solar', area: 20, mass: 95, cost: 25, description: 'Área semelhante à do MRO (~20 m²).', provenance: { source: 'NASA/JPL, MRO Spacecraft Fact Sheet (área dos painéis)', status: 'estimado', confidence: 'media' } },
  'rtg': { id: 'rtg', name: 'MMRTG (radioisótopo)', kind: 'rtg', watts: 110, mass: 45, cost: 110, description: 'Não depende do Sol nem de poeira, mas gera pouca potência.', provenance: { source: 'NASA/DOE, Multi-Mission RTG fact sheet (~110 W no início da missão)', status: 'publicado', confidence: 'media' } },
};

export interface BatteryOption { id: string; name: string; capacityWh: number; mass: number; cost: number }
export const BATTERIES: Record<string, BatteryOption> = {
  'b1': { id: 'b1', name: 'Bateria Li-íon 1.200 Wh', capacityWh: 1200, mass: 12, cost: 3 },
  'b2': { id: 'b2', name: 'Bateria Li-íon 2.400 Wh', capacityWh: 2400, mass: 24, cost: 5 },
};

export interface AntennaOption {
  id: string;
  name: string;
  /** Diâmetro do refletor (m); null para antena de baixo ganho (ganho fixo). */
  diameter: number | null;
  /** Ganho fixo (dBi) para antenas sem refletor. */
  gainDbi?: number;
  mass: number;
  cost: number;
  /** Diâmetro mínimo interno de coifa para caber dobrada/estivada (m). */
  envelope: number;
}

export const ANTENNAS: Record<string, AntennaOption> = {
  lga: { id: 'lga', name: 'Antena de baixo ganho', diameter: null, gainDbi: 7, mass: 3, cost: 2, envelope: 2.5 },
  'hga-2': { id: 'hga-2', name: 'Antena de alto ganho 2 m', diameter: 2, mass: 25, cost: 12, envelope: 2.8 },
  'hga-3': { id: 'hga-3', name: 'Antena de alto ganho 3 m', diameter: 3, mass: 40, cost: 20, envelope: 3.6 },
};

export interface AmplifierOption { id: string; name: string; rfWatts: number; dcWatts: number; mass: number; cost: number }
export const AMPLIFIERS: Record<string, AmplifierOption> = {
  sspa: { id: 'sspa', name: 'SSPA banda X 15 W', rfWatts: 15, dcWatts: 45, mass: 3, cost: 3 },
  twta: { id: 'twta', name: 'TWTA banda X 100 W', rfWatts: 100, dcWatts: 200, mass: 9, cost: 8 },
};

export interface RecorderOption { id: string; name: string; capacityGbit: number; mass: number; cost: number }
export const RECORDERS: Record<string, RecorderOption> = {
  r32: { id: 'r32', name: 'Gravador 32 Gbit', capacityGbit: 32, mass: 4, cost: 2 },
  r160: { id: 'r160', name: 'Gravador 160 Gbit', capacityGbit: 160, mass: 10, cost: 6 },
};

export type ScienceTheme = 'superficie' | 'subsolo' | 'atmosfera' | 'campo-magnetico';

export interface Instrument {
  id: string;
  name: string;
  inspiredBy: string;
  theme: ScienceTheme;
  mass: number;
  /** Potência em operação (W). */
  power: number;
  /** Horas de operação por sol numa campanha padrão. */
  hoursPerSol: number;
  /** Volume de dados por sol de campanha (Gbit). */
  dataPerSol: number;
  /** Pontos de ciência por Gbit entregue à Terra (escala do jogo). */
  sciencePerGbit: number;
  /** Fator de retorno por tipo de órbita (elíptica favorece atmosfera alta; circular baixa favorece imagens). */
  orbitFactor: Record<'eliptica' | 'circular', number>;
  cost: number;
  description: string;
}

export const INSTRUMENTS: Record<string, Instrument> = {
  hirescam: {
    id: 'hirescam', name: 'Câmera de alta resolução', inspiredBy: 'HiRISE (MRO)', theme: 'superficie',
    mass: 65, power: 60, hoursPerSol: 2, dataPerSol: 3.2, sciencePerGbit: 0.6, orbitFactor: { eliptica: 0.4, circular: 1 }, cost: 45,
    description: 'Imagens de detalhes com poucos metros; gera muitos dados.',
  },
  ctx: {
    id: 'ctx', name: 'Câmera de contexto', inspiredBy: 'CTX (MRO)', theme: 'superficie',
    mass: 4, power: 8, hoursPerSol: 4, dataPerSol: 0.8, sciencePerGbit: 0.9, orbitFactor: { eliptica: 0.5, circular: 1 }, cost: 10,
    description: 'Mapas amplos e leves, ótimos para escolher alvos.',
  },
  spectrometer: {
    id: 'spectrometer', name: 'Espectrômetro de imageamento', inspiredBy: 'CRISM (MRO)', theme: 'superficie',
    mass: 33, power: 45, hoursPerSol: 3, dataPerSol: 1.6, sciencePerGbit: 1.2, orbitFactor: { eliptica: 0.5, circular: 1 }, cost: 40,
    description: 'Decompõe a luz refletida para identificar minerais formados com água.',
  },
  radar: {
    id: 'radar', name: 'Radar de sondagem rasa', inspiredBy: 'SHARAD (MRO)', theme: 'subsolo',
    mass: 15, power: 120, hoursPerSol: 1.5, dataPerSol: 1.0, sciencePerGbit: 2.0, orbitFactor: { eliptica: 0.6, circular: 1 }, cost: 35,
    description: 'Ondas de rádio atravessam o solo e revelam camadas de gelo.',
  },
  ngims: {
    id: 'ngims', name: 'Espectrômetro de massa de gás e íons', inspiredBy: 'NGIMS (MAVEN)', theme: 'atmosfera',
    mass: 13, power: 25, hoursPerSol: 6, dataPerSol: 0.3, sciencePerGbit: 6, orbitFactor: { eliptica: 1, circular: 0.5 }, cost: 30,
    description: 'Mede a composição da atmosfera alta, onde Marte perde gás para o espaço.',
  },
  mag: {
    id: 'mag', name: 'Magnetômetro', inspiredBy: 'MAG (MAVEN)', theme: 'campo-magnetico',
    mass: 4, power: 4, hoursPerSol: 24, dataPerSol: 0.1, sciencePerGbit: 10, orbitFactor: { eliptica: 1, circular: 0.8 }, cost: 8,
    description: 'Mapeia campos magnéticos crustais com pouquíssima energia.',
  },
  swia: {
    id: 'swia', name: 'Analisador de vento solar', inspiredBy: 'SWIA (MAVEN)', theme: 'atmosfera',
    mass: 3, power: 4, hoursPerSol: 24, dataPerSol: 0.1, sciencePerGbit: 8, orbitFactor: { eliptica: 1, circular: 0.6 }, cost: 8,
    description: 'Mede as partículas do Sol que arrancam a atmosfera de Marte.',
  },
};

export interface BusOption { id: string; name: string; dryMass: number; power: number; survivalPower: number; cost: number }
/** Barramento: estrutura, computador, controle térmico e de atitude. survivalPower = mínimo em modo seguro. */
export const BUS: BusOption = { id: 'bus', name: 'Barramento do orbitador', dryMass: 520, power: 280, survivalPower: 160, cost: 140 };

export const RADIATION_SHIELD = { id: 'shield', name: 'Blindagem extra de radiação', mass: 25, cost: 6 } as const;
/** Adaptador de carga útil entre sonda e estágio superior (kg). */
export const PAYLOAD_ADAPTER_MASS = 60;

export interface ProbeConfig {
  propulsionId: string;
  tankId: string;
  /** Propelente carregado (kg), ≤ capacidade do tanque. */
  propellant: number;
  powerId: string;
  batteryId: string;
  antennaId: string;
  amplifierId: string;
  recorderId: string;
  instruments: string[];
  shield: boolean;
}

export const DEFAULT_PROBE: ProbeConfig = {
  propulsionId: 'biprop',
  tankId: 't1200',
  propellant: 900,
  powerId: 'solar-20',
  batteryId: 'b1',
  antennaId: 'hga-3',
  amplifierId: 'twta',
  recorderId: 'r160',
  instruments: ['ctx', 'spectrometer', 'mag'],
  shield: false,
};

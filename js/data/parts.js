// Peças do jogo: parâmetros educacionais e geometria visual procedural.
// Não são especificações oficiais NASA/JPL nem componentes CAD validados.
// Foguete: massas em toneladas. Sonda: massas em kg.
export const ROCKET_PARTS = [
  { id: 'tank-s', visualSource: 'procedural-illustration', officialModelId: null, name: 'Tanque pequeno', kind: 'tank', cost: 8, wet: 6, dry: 0.5, flavor: 'Combustível e oxidante. Cada quilo de propelente também precisa ser acelerado.' },
  { id: 'tank-m', visualSource: 'procedural-illustration', officialModelId: null, name: 'Tanque médio', kind: 'tank', cost: 20, wet: 24, dry: 2, flavor: 'Quatro vezes o pequeno: mais Δv, mas também mais peso para os estágios de baixo.' },
  { id: 'tank-l', visualSource: 'procedural-illustration', officialModelId: null, name: 'Tanque grande', kind: 'tank', cost: 50, wet: 96, dry: 8, flavor: 'Primeiros estágios levam quase toda a massa do foguete só para sair do chão.' },
  { id: 'engine-vac', visualSource: 'procedural-illustration', officialModelId: null, name: 'Motor de vácuo', kind: 'engine', cost: 40, wet: 0.5, dry: 0.5, isp: 450, thrust: 60, flavor: 'Isp alto: gasta pouco propelente, mas o empuxo é baixo demais para decolar.' },
  { id: 'engine-upper', visualSource: 'procedural-illustration', officialModelId: null, name: 'Motor de 2º estágio', kind: 'engine', cost: 60, wet: 2, dry: 2, isp: 350, thrust: 1000, flavor: 'Feito para o ar rarefeito: equilíbrio entre empuxo e eficiência.' },
  { id: 'engine-main', visualSource: 'procedural-illustration', officialModelId: null, name: 'Motor principal', kind: 'engine', cost: 45, wet: 6, dry: 6, isp: 300, thrust: 2000, flavor: 'Muito empuxo para vencer o peso do foguete inteiro na decolagem.' },
];

export const DECOUPLER = { cost: 2, mass: 0.1 };

export const PROBE_PARTS = [
  { id: 'probe-core', name: 'Núcleo da sonda', category: 'core', cost: 40, mass: 500, power: -150, flavor: 'Computador, estrutura e controle de atitude. Toda sonda precisa de um.' },
  { id: 'solar-small', name: 'Painel solar pequeno', category: 'power', cost: 20, mass: 30, power: 600, solar: true, max: 2, flavor: 'A potência cai com o quadrado da distância ao Sol.' },
  { id: 'solar-large', name: 'Painel solar grande', category: 'power', cost: 50, mass: 90, power: 2000, solar: true, flavor: 'A Juno usa painéis enormes para funcionar até em Júpiter.' },
  { id: 'rtg', name: 'Gerador de radioisótopo (RTG)', category: 'power', cost: 120, mass: 45, power: 110, flavor: 'O Curiosity usa um RTG porque ele não depende do Sol.' },
  { id: 'battery', name: 'Bateria', category: 'power', cost: 10, mass: 25, power: 0, battery: 300, max: 2, flavor: 'Cobre picos de consumo de até 300 W.' },
  { id: 'antenna-low', name: 'Antena de baixo ganho', category: 'comms', cost: 10, mass: 5, power: -20, rate: 8, flavor: 'Leve e simples, mas manda poucos dados de longe.' },
  { id: 'antenna-high', name: 'Antena de alto ganho', category: 'comms', cost: 60, mass: 40, power: -100, rate: 80, flavor: 'Concentra o sinal num feixe estreito apontado para a Terra.' },
  { id: 'laser', name: 'Comunicação a laser', category: 'comms', cost: 140, mass: 25, power: -150, rate: 160, flavor: 'Muito mais dados, com uma tecnologia ainda nova.' },
  { id: 'camera', name: 'Câmera de alta resolução', category: 'instrument', cost: 60, mass: 40, power: -80, science: 4, data: 4, flavor: 'Imagens detalhadas geram muitos dados.' },
  { id: 'spectrometer', name: 'Espectrômetro', category: 'instrument', cost: 70, mass: 30, power: -60, science: 5, data: 3, flavor: 'Decompõe a luz para descobrir do que a superfície é feita.' },
  { id: 'radar', name: 'Radar de sondagem', category: 'instrument', cost: 90, mass: 50, power: -200, science: 7, data: 5, flavor: 'Ondas de radar atravessam o solo e revelam gelo enterrado.' },
  { id: 'magnetometer', name: 'Magnetômetro', category: 'instrument', cost: 20, mass: 5, power: -10, science: 2, data: 0.5, flavor: 'Mede campos magnéticos com pouquíssima energia.' },
  { id: 'shield-radiation', name: 'Blindagem de radiação', category: 'protection', cost: 30, mass: 30, power: 0, flavor: 'Protege a eletrônica das partículas do Sol.' },
  { id: 'shield-mm', name: 'Escudo de micrometeoroides', category: 'protection', cost: 20, mass: 25, power: 0, flavor: 'Camadas finas pulverizam partículas antes do impacto.' },
];

export function rocketPart(id) {
  return ROCKET_PARTS.find((p) => p.id === id);
}

export function probePart(id) {
  return PROBE_PARTS.find((p) => p.id === id);
}

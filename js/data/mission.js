// Missão do MVP. Valores de jogo, exceto onde indicado.
export const MISSION = {
  id: 'red-watch',
  name: 'Vigia Vermelho',
  briefing:
    'Coloque um orbitador em Marte para mapear a superfície e procurar gelo no subsolo. Monte o foguete, espere a janela de lançamento e faça a viagem mais econômica possível.',
  budget: 1000, // US$ M
  ascentDeltaV: 9400, // m/s até a órbita baixa, já com perdas por gravidade e arrasto
  minLiftoffTWR: 1.2,
  leoAltitude: 200e3, // m
  capturePeriAlt: 300e3, // m
  captureApoAlt: 33000e3, // m
  encounterSoiFactor: 2, // zona de encontro = 2 × SOI de Marte (jogabilidade)
  operationsTurns: 6,
  turnDays: 30,
  scienceTarget: 100,
  bufferMax: 40, // Gbit
  difficultyMultiplier: 1.5,
  maxCruiseDays: 600,
};


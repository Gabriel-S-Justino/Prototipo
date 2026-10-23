// Cartões do Painel de Física. Cada um: fórmula, explicação simples, analogia e números ao vivo.
import { AU, C, DAY, MU_SUN } from './constants.js';
import { MISSION } from './mission.js';
import { EARTH, MARS } from './planets.js';
import {
  ENCOUNTER_ZONE, R_LEO, availableDeltaV, deltaVMap, designStats, earthMarsDistance,
} from '../game/mission.js';
import {
  apsides, circularSpeed, hohmann, idealPhaseAngle, length, period, phaseAngle, phaseRateDegPerDay, positionAt,
  velocityAt,
} from '../physics/orbit.js';

const f = (v, d = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });

export const CONCEPTS = [
  {
    id: 'gravity',
    title: 'Gravitação',
    formula: 'F = G·M·m / r²',
    plain: 'Todo corpo puxa todo corpo. Uma órbita é uma queda sem fim: a nave cai em direção ao Sol, mas anda tão rápido de lado que nunca chega a ele.',
    analogy: 'Como uma bola atirada tão longe que a Terra se curva antes de ela tocar o chão.',
    live: () => `O Sol tem GM = ${MU_SUN.toExponential(3)} m³/s². A 1 UA, ele puxa cada quilo com ${f((MU_SUN / AU ** 2) * 1000, 2)} mN.`,
  },
  {
    id: 'dv-map',
    title: 'Mapa de Δv',
    formula: 'Δv total = subida + partida + captura',
    plain: 'Δv ("delta-vê") é quanto a nave consegue mudar a própria velocidade. É a "moeda" das viagens espaciais: cada etapa custa uma quantia fixa.',
    analogy: 'Como o saldo de um cartão de transporte: cada trecho da viagem desconta um valor.',
    live: () => {
      const m = deltaVMap();
      return `Subida ${f(m.ascent)} + partida ${f(m.departure)} + captura ${f(m.capture)} = ${f(m.total)} m/s.`;
    },
  },
  {
    id: 'rocket-equation',
    title: 'Equação do foguete',
    formula: 'Δv = Isp · g₀ · ln(m₀ / m_f)',
    plain: 'O Δv depende da eficiência do motor (Isp) e de quanto da massa é combustível. Por causa do logaritmo, dobrar o combustível não dobra o Δv.',
    analogy: 'Carregar mais água para uma trilha longa também deixa a mochila mais pesada para carregar.',
    live: (state) => {
      const s = designStats(state.design);
      if (!s.stages.length) return 'Monte um estágio para ver o cálculo.';
      const top = s.stages.length - 1;
      const st = s.rocket.stages[top];
      return `Estágio ${top + 1}: ${st.isp} s × 9,81 × ln(${f(s.stages[top].m0, 1)} t / ${f(s.stages[top].mf, 1)} t) = ${f(s.stages[top].deltaV)} m/s.`;
    },
  },
  {
    id: 'twr',
    title: 'TWR (empuxo ÷ peso)',
    formula: 'TWR = F / (m · g₀)',
    plain: 'Para sair do chão, o empuxo dos motores tem que ser maior que o peso do foguete inteiro (TWR > 1). No jogo exigimos 1,2 para sobrar força para acelerar.',
    analogy: 'Para levantar uma caixa você precisa fazer mais força do que o peso dela.',
    live: (state) => {
      const s = designStats(state.design);
      if (!s.stages.length) return 'Monte o 1º estágio para ver o TWR.';
      const st = s.rocket.stages[0];
      return `${f(st.thrust)} kN ÷ (${f(s.stages[0].m0, 1)} t × 9,81) = ${f(s.liftoffTWR, 2)}.`;
    },
  },
  {
    id: 'staging',
    title: 'Estágios',
    formula: 'Δv total = Δv₁ + Δv₂ + Δv₃',
    plain: 'Quando um tanque esvazia, ele vira peso morto. Soltar o estágio vazio deixa o resto do foguete mais leve, e cada estágio seguinte rende mais Δv.',
    analogy: 'Jogar fora as garrafas vazias durante a trilha.',
    live: (state) => {
      const s = designStats(state.design);
      return s.stages.length ? s.stages.map((st, i) => `E${i + 1}: ${f(st.deltaV)} m/s`).join(' · ') + ` → total ${f(s.totalDeltaV)} m/s.` : 'Sem estágios ainda.';
    },
  },
  {
    id: 'circular-speed',
    title: 'Velocidade orbital',
    formula: 'v = √(GM / r)',
    plain: 'Cada altura tem uma velocidade certa para ficar em órbita circular. Quanto mais longe, mais devagar.',
    analogy: 'Planetas de fora andam mais devagar: Marte leva quase 2 anos para dar uma volta.',
    live: () => `LEO: √(${EARTH.mu.toExponential(3)} / ${f(R_LEO / 1000)} km) = ${f(circularSpeed(EARTH.mu, R_LEO))} m/s. Terra ao redor do Sol: ${f(circularSpeed(MU_SUN, AU) / 1000, 1)} km/s; Marte: ${f(circularSpeed(MU_SUN, MARS.a * AU) / 1000, 1)} km/s.`,
  },
  {
    id: 'kepler3',
    title: '3ª Lei de Kepler',
    formula: 'T = 2π · √(a³ / GM)',
    plain: 'O tempo de uma volta depende só do tamanho da órbita (a). Órbitas maiores demoram muito mais.',
    analogy: 'A pista de fora de um estádio é mais longa e, no espaço, ainda por cima é percorrida mais devagar.',
    live: () => `LEO: ${f(period(EARTH.mu, R_LEO) / 60)} min. Terra: ${f(period(MU_SUN, AU) / DAY)} dias. Marte: ${f(period(MU_SUN, MARS.a * AU) / DAY)} dias.`,
  },
  {
    id: 'hohmann',
    title: 'Transferência de Hohmann',
    formula: 'a = (r_Terra + r_Marte) / 2',
    plain: 'O caminho mais barato entre duas órbitas circulares é meia elipse que toca as duas: uma queima para entrar nela e outra para sair.',
    analogy: 'Como trocar de faixa numa rotatória fazendo uma curva suave em vez de cortar caminho.',
    live: () => {
      const h = hohmann(MU_SUN, AU, MARS.a * AU);
      return `a = ${f(h.a / AU, 3)} UA · viagem de ${f(h.time / DAY)} dias · +${f(h.dv1)} m/s em relação à Terra.`;
    },
  },
  {
    id: 'phase-angle',
    title: 'Ângulo de fase e janela',
    formula: 'φ = 180° − 360° · (t_viagem / T_Marte)',
    plain: 'Marte se move durante a viagem. Você precisa partir quando Marte estiver ~44° à frente da Terra, para os dois chegarem ao mesmo ponto juntos. Isso só acontece a cada ~26 meses.',
    analogy: 'Passar a bola para quem está correndo: você joga para onde a pessoa vai estar.',
    live: (state) => {
      const now = phaseAngle(state.t);
      const ideal = idealPhaseAngle();
      let days = (now - ideal) / phaseRateDegPerDay();
      if (days < 0) days += 360 / phaseRateDegPerDay();
      return `Agora: ${f(now, 1)}°. Ideal: ${f(ideal, 1)}°. Próxima janela em ${f(days)} dias (o ângulo cai ${f(phaseRateDegPerDay(), 2)}° por dia).`;
    },
  },
  {
    id: 'escape',
    title: 'Velocidade de escape',
    formula: 'v = √(v∞² + 2GM / r)',
    plain: 'Para sair da Terra e ainda sobrar velocidade (v∞) para a viagem, a queima na LEO tem que levar a nave acima da velocidade de escape.',
    analogy: 'Subir uma ladeira com embalo: o que sobra lá em cima é o v∞.',
    live: () => `Escape a partir da LEO: ${f(Math.sqrt((2 * EARTH.mu) / R_LEO))} m/s. Para Marte: ${f(deltaVMap().departure)} m/s de queima.`,
  },
  {
    id: 'vis-viva',
    title: 'Equação vis-viva',
    formula: 'v² = GM · (2/r − 1/a)',
    plain: 'Numa elipse, a nave acelera ao se aproximar do Sol e desacelera ao se afastar.',
    analogy: 'Um skate numa rampa: desce ganhando velocidade, sobe perdendo.',
    live: (state) => {
      if (!state.ship?.el || state.ship.frame !== 'sun') return 'Aparece depois da partida.';
      const r = length(positionAt(state.ship.el, state.t));
      const v = length(velocityAt(state.ship.el, state.t));
      return `r = ${f(r / AU, 3)} UA, a = ${f(state.ship.el.a / AU, 3)} UA → v = ${f(v / 1000, 2)} km/s.`;
    },
  },
  {
    id: 'apsides',
    title: 'Periélio e afélio',
    formula: 'r_p = a(1 − e) · r_a = a(1 + e)',
    plain: 'O ponto da elipse mais perto do Sol é o periélio; o mais longe, o afélio. Para chegar a Marte, o afélio precisa alcançar a órbita de Marte (1,52 UA).',
    analogy: 'No KSP: periapse e apoapse.',
    live: (state) => {
      if (!state.ship?.el || state.ship.frame !== 'sun') return 'Aparece depois da partida.';
      const a = apsides(state.ship.el);
      return `Periélio ${f(a.rp / AU, 3)} UA · afélio ${f(a.ra / AU, 3)} UA · excentricidade ${f(state.ship.el.e, 3)}.`;
    },
  },
  {
    id: 'correction',
    title: 'Correção de meio de curso',
    formula: 'v_nova = v + Δv_prograde + Δv_radial',
    plain: 'Pequenas queimas no meio da viagem mudam bastante onde você chega. Prograde (para frente) aumenta a órbita; radial (para fora) gira a elipse.',
    analogy: 'Ajustar o volante de leve no começo de uma estrada longa.',
    live: (state) => `Δv disponível: ${f(availableDeltaV(state))} m/s.`,
  },
  {
    id: 'soi',
    title: 'Esfera de influência (SOI)',
    formula: 'r_SOI = a · (m / M)^(2/5)',
    plain: 'Perto de Marte, a gravidade de Marte vence a do Sol. O jogo troca o "dono" da órbita quando a nave entra nessa região (cônicas remendadas).',
    analogy: 'Fronteira entre dois países: ao cruzar, valem as regras do outro.',
    live: () => `SOI de Marte: ${f(MARS.soi / 1e6)} mil km. Zona de encontro do jogo: ${f(ENCOUNTER_ZONE / 1e6)} mil km (2× a SOI, para facilitar).`,
  },
  {
    id: 'capture',
    title: 'Queima de captura',
    formula: 'Δv = √(v∞² + 2GM/r_p) − v_elipse(r_p)',
    plain: 'A nave chega rápida demais para ficar em Marte. Uma queima para trás (retrograde) no ponto mais baixo transforma a passagem numa órbita.',
    analogy: 'Frear na curva certa para entrar na garagem.',
    live: (state) =>
      state.encounter
        ? `v∞ = ${f(state.encounter.vInf)} m/s → captura em 300 × 33.000 km custa ${f(state.encounter.required)} m/s. Circular baixa custaria ${f(deltaVMap().captureCircular)} m/s.`
        : `Na janela ideal: ${f(deltaVMap().capture)} m/s (elíptica) ou ${f(deltaVMap().captureCircular)} m/s (circular baixa).`,
  },
  {
    id: 'inverse-square',
    title: 'Inverso do quadrado',
    formula: 'P ∝ 1 / d²',
    plain: 'Luz e rádio se espalham em todas as direções. A 2× a distância, a mesma energia cobre 4× a área: chega 1/4.',
    analogy: 'Uma lanterna ilumina menos a parede quando você se afasta.',
    live: (state) => {
      const d = earthMarsDistance(state.t) / AU;
      return `Painel solar em Marte: ${f(100 / MARS.a ** 2)}% da Terra. Terra–Marte hoje: ${f(d, 2)} UA → antena a ${f(100 / (d * d))}% da taxa a 1 UA.`;
    },
  },
  {
    id: 'light-delay',
    title: 'Atraso do sinal',
    formula: 't = d / c',
    plain: 'Nem o rádio é instantâneo. Comandos para Marte levam minutos, por isso as sondas precisam de autonomia.',
    analogy: 'Conversar por cartas em vez de telefone.',
    live: (state) => `Agora: ${f(earthMarsDistance(state.t) / C / 60, 1)} minutos só de ida.`,
  },
];

export const CONCEPTS_BY_PHASE = {
  briefing: ['gravity', 'dv-map'],
  hangar: ['rocket-equation', 'twr', 'staging'],
  leo: ['circular-speed', 'kepler3', 'phase-angle', 'hohmann', 'escape'],
  cruise: ['vis-viva', 'apsides', 'correction', 'phase-angle'],
  encounter: ['soi', 'capture'],
  operations: ['inverse-square', 'light-delay', 'kepler3'],
  report: ['dv-map', 'hohmann', 'inverse-square'],
};

export const SIMPLIFICATIONS = [
  'Órbitas dos planetas circulares e no mesmo plano (2D).',
  'Cônicas remendadas: perto de um planeta só ele puxa a nave; longe, só o Sol.',
  `A subida até a órbita baixa custa ${MISSION.ascentDeltaV.toLocaleString('pt-BR')} m/s fixos (inclui perdas por gravidade e arrasto).`,
  'Queimas instantâneas.',
  'Números das peças são de jogo; constantes e planetas são reais (NASA/JPL).',
];

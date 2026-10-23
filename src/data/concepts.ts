// Conteúdo do Painel de Física. Cada conceito tem modo simples (linguagem acessível) e avançado
// (fórmula, unidades e hipóteses). Os números "ao vivo" vêm SEMPRE do plano derivado (derivePlan) ou do
// estado da missão: o painel não refaz cálculos próprios.
import { AU_KM, C_KM_S, fmt, G0, MU, RADIUS } from '../domain/units';
import type { MissionPlan } from '../simulation/mission/plan';
import type { MissionState, Phase } from '../state/mission';
import { hohmannEarthMars } from '../simulation/orbital/hohmann';
import { departureDeltaV, R_PARKING } from '../simulation/rocket/performance';
import { CAPTURE_ORBITS } from '../simulation/mission/capture';
import { LINK } from '../simulation/mission/comms';
import { PANEL_EFFICIENCY, SOLAR_CONSTANT } from '../simulation/mission/power';

export interface ConceptContext { plan: MissionPlan; state: MissionState }

export interface Concept {
  id: string;
  title: string;
  unit: string;
  formula: string;
  simple: string;
  analogy?: string;
  /** Hipóteses e limitações (modo avançado). */
  assumptions: string;
  /** Variáveis que influenciam o resultado. */
  inputs: string;
  /** Impacto sobre a missão. */
  impact: string;
  live: (ctx: ConceptContext) => string;
}

const kms = (v: number, d = 2) => `${fmt(v, d)} km/s`;

export const CONCEPTS: Concept[] = [
  {
    id: 'dv', title: 'Delta-v (Δv)', unit: 'm/s', formula: 'Δv total = subida + injeção + correções + captura',
    simple: 'Δv é quanto a nave consegue mudar a própria velocidade. É a "moeda" da viagem: cada etapa custa uma quantia.',
    analogy: 'Como o saldo de um cartão de transporte: cada trecho desconta um valor.',
    inputs: 'Massa, propelente e Isp de cada estágio; órbita de destino.', impact: 'Se falta Δv em qualquer etapa, a missão para ali.',
    assumptions: 'Queimas tratadas como instantâneas exceto na subida, onde perdas são estimadas.',
    live: ({ plan }) => `Subida ${fmt(plan.performance.leoRequirement)} m/s + injeção ${plan.transfer.ok ? fmt(departureDeltaV(plan.transfer.c3)) : '—'} m/s (lançador) · correções ${fmt(plan.tcmReserve)} + captura ${fmt(plan.captureDeltaV)} m/s (sonda).`,
  },
  {
    id: 'rocket-equation', title: 'Equação do foguete', unit: 'm/s', formula: 'Δv = Isp · g₀ · ln(m₀ / m_f)',
    simple: 'O Δv depende da eficiência do motor (Isp) e de quanto da massa é combustível. Por causa do logaritmo, dobrar o combustível não dobra o Δv.',
    analogy: 'Levar mais água numa trilha também deixa a mochila mais pesada.',
    inputs: 'Isp do motor, massa inicial m₀ e final m_f de cada fase.', impact: 'Define o Δv ideal do lançador e da sonda.',
    assumptions: 'g₀ = 9,80665 m/s². Isp efetivo médio entre nível do mar e vácuo na fase atmosférica.',
    live: ({ plan }) => {
      const up = plan.performance.phases.at(-1)!;
      return `${up.label}: ${fmt(up.isp, 1)} s × ${fmt(G0, 2)} × ln(${fmt(up.m0 / 1000, 1)} t / ${fmt(up.mf / 1000, 1)} t) = ${fmt(up.deltaV)} m/s.`;
    },
  },
  {
    id: 'isp', title: 'Impulso específico (Isp)', unit: 's', formula: 'Isp = F / (ṁ · g₀)',
    simple: 'Isp mede quanto empuxo o motor tira de cada quilo de propelente por segundo. Motores a hidrogênio (RL10) têm Isp alto; os de querosene, empuxo alto.',
    inputs: 'Motor e propelentes; pressão externa (nível do mar × vácuo).', impact: 'Isp alto rende mais Δv com o mesmo propelente.',
    assumptions: 'Valores de catálogo com fonte e grau de confiança em docs/FOGUETES.md.',
    live: ({ plan }) => `${plan.vehicle.coreEngine.name}: ${fmt(plan.vehicle.coreEngine.ispSL ?? 0, 0)} s (mar) / ${fmt(plan.vehicle.coreEngine.ispVac, 0)} s (vácuo) · ${plan.vehicle.upperEngine.name}: ${fmt(plan.vehicle.upperEngine.ispVac, 1)} s.`,
  },
  {
    id: 'twr', title: 'Empuxo ÷ peso (TWR)', unit: 'adimensional', formula: 'TWR = F / (m · g₀)',
    simple: 'Para sair do chão, o empuxo tem que ser maior que o peso do foguete inteiro (TWR > 1). Quanto mais perto de 1, mais combustível se gasta só para "pairar".',
    analogy: 'Para levantar uma caixa você precisa fazer mais força do que o peso dela.',
    inputs: 'Empuxo ao nível do mar de núcleo e propulsores; massa total com carga.', impact: 'TWR baixo aumenta a perda gravitacional; TWR ≤ 1 impede a decolagem.',
    assumptions: 'Empuxo ao nível do mar; massa na decolagem.',
    live: ({ plan }) => `${fmt(plan.performance.liftoffThrust)} kN ÷ (${fmt(plan.performance.liftoffMass / 1000, 1)} t × 9,81) = ${fmt(plan.performance.liftoffTWR, 2)}.`,
  },
  {
    id: 'massa', title: 'Massa seca × propelente', unit: '%', formula: 'fração de propelente = m_prop / m₀',
    simple: 'Quanto maior a parte do foguete que é combustível, mais Δv. Mas tanques, motores e estrutura (massa seca) sempre vão junto.',
    inputs: 'Massas seca e de propelente de cada estágio.', impact: 'Estágios mais "leves" rendem mais Δv por quilo.',
    assumptions: 'Massas de catálogo; propelente pode ser reduzido no hangar.',
    live: ({ plan }) => {
      const v = plan.vehicle;
      return `Núcleo: ${fmt((v.coreProp / (v.coreProp + v.core.dry)) * 100, 1)}% propelente · superior: ${fmt((v.upperProp / (v.upperProp + v.upperDry)) * 100, 1)}% · sonda: ${fmt((plan.probe.propellant / plan.probe.wetMass) * 100, 1)}%.`;
    },
  },
  {
    id: 'staging', title: 'Estágios e perdas', unit: 'm/s', formula: 'Δv_útil = ΣΔv_fases − perdas gravitacionais − arrasto − manobra + rotação',
    simple: 'Soltar tanques vazios deixa o resto mais leve. Parte do Δv é "gasta" lutando contra a gravidade e o ar na subida; a rotação da Terra ajuda um pouco.',
    inputs: 'Duração de cada fase, TWR, inclinação da órbita de estacionamento.', impact: 'Determina quanto sobra para a injeção a Marte.',
    assumptions: 'Perda gravitacional ≈ g₀·t·⟨sen γ⟩ com coeficientes empíricos (subida total de 9,3–9,6 km/s). Sem integração de trajetória.',
    live: ({ plan }) => `Ideal ${fmt(plan.performance.idealDeltaV)} − gravidade ${fmt(plan.performance.gravityLoss)} − arrasto ${fmt(plan.performance.dragLoss)} − manobra ${fmt(plan.performance.steeringLoss)} + rotação ${fmt(plan.performance.rotationBonus)} m/s.`,
  },
  {
    id: 'capacidade', title: 'Capacidade de carga', unit: 'kg', formula: 'max m_carga tal que Δv_útil(m_carga) ≥ Δv_injeção(C3)',
    simple: 'O mesmo foguete leva muito mais carga para a órbita baixa do que para Marte. Quanto mais energia (C3) a trajetória pede, menos massa a sonda pode ter.',
    inputs: 'Configuração do lançador, C3 e DLA da trajetória.', impact: 'Limite de massa da sonda; NO-GO se a sonda for mais pesada.',
    assumptions: 'Bisseção na massa da carga usando o modelo de desempenho. Não substitui as curvas oficiais do NASA LSP.',
    live: ({ plan }) => plan.transfer.ok ? `C3 ${fmt(plan.transfer.c3, 2)} km²/s² → capacidade ${fmt(plan.capacity)} kg · sonda + adaptador ${fmt(plan.probe.launchMass)} kg · margem ${fmt(plan.massMargin)} kg.` : 'Sem trajetória válida.',
  },
  {
    id: 'c3', title: 'Energia característica C3', unit: 'km²/s²', formula: 'C3 = v∞² = v² − 2μ/r',
    simple: 'C3 mede quanta energia "de sobra" a nave precisa ter ao escapar da Terra. Marte pede em geral entre 8 e 20 km²/s², conforme a data.',
    inputs: 'Data de partida e tempo de voo (via Lambert).', impact: 'C3 maior reduz a capacidade de carga do lançador.',
    assumptions: 'C3 = |v_partida(Lambert) − v_Terra|², cônicas remendadas, partida do centro da Terra.',
    live: ({ plan }) => plan.transfer.ok ? `v∞ = ${kms(plan.transfer.vInfDep, 3)} → C3 = ${fmt(plan.transfer.c3, 3)} km²/s². Queima a partir de 200 km: ${fmt(departureDeltaV(plan.transfer.c3))} m/s.` : 'Sem trajetória válida.',
  },
  {
    id: 'lambert', title: 'Problema de Lambert', unit: 'km/s', formula: '√μ·Δt = (y/C)^{3/2}·S + A·√y   (variáveis universais)',
    simple: 'Dadas a posição da Terra na partida, a de Marte na chegada e o tempo de viagem, existe uma única órbita (de uma volta) que liga as duas. Lambert encontra as velocidades dessa órbita.',
    inputs: 'r₁ (Terra), r₂ (Marte), Δt, μ do Sol.', impact: 'Fornece C3, v∞ de chegada e a forma da trajetória.',
    assumptions: 'Dois corpos (só o Sol), uma revolução, sentido prograde. Não modela perturbações de outros planetas.',
    live: ({ plan }) => {
      const h = hohmannEarthMars();
      return plan.transfer.ok ? `Ângulo de transferência ${fmt(plan.transfer.transferAngleDeg, 1)}°, ${fmt(plan.transfer.tofDays)} dias, v∞ chegada ${kms(plan.transfer.vInfArr)}. Referência Hohmann (circular, didática): C3 ${fmt(h.c3, 2)} km²/s² em ${fmt(h.days)} dias.` : 'Sem trajetória válida.';
    },
  },
  {
    id: 'dla', title: 'Declinação da assíntota (DLA)', unit: 'graus', formula: 'DLA = asen(v∞,z / |v∞|) (equador J2000)',
    simple: 'É a "inclinação" da direção de saída da Terra. Se for maior que a latitude da base, o foguete precisa de uma órbita mais inclinada e perde a ajuda da rotação.',
    inputs: 'Vetor v∞ de partida.', impact: 'Altera o ganho de rotação e, portanto, a capacidade.',
    assumptions: 'Bônus de rotação = 465 m/s · cos(i), i = max(28,5°, |DLA|), limitado a 57°.',
    live: ({ plan }) => plan.transfer.ok ? `DLA ${fmt(plan.transfer.dlaDeg, 1)}° → órbita de estacionamento a ${fmt(plan.performance.parkingInclination, 1)}°, rotação ajuda ${fmt(plan.performance.rotationBonus)} m/s.` : '—',
  },
  {
    id: 'duracao', title: 'Duração do voo', unit: 'dias', formula: 'chegada = partida + tempo de voo',
    simple: 'Viagens mais curtas costumam pedir mais energia. Viagens mais longas custam mais operações e expõem a sonda por mais tempo.',
    inputs: 'Tempo de voo escolhido no gráfico de oportunidades.', impact: 'Orçamento de cruzeiro, v∞ de chegada e geometria das comunicações.',
    assumptions: 'Tempo de voo fixo no planejamento; correções mantêm a data de chegada.',
    live: ({ plan, state }) => `${fmt(state.selection.tofDays)} dias de cruzeiro; chegada em ${new Date((plan.arrivalJd - 2440587.5) * 864e5).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`,
  },
  {
    id: 'captura', title: 'Inserção em órbita de Marte', unit: 'm/s', formula: 'Δv = √(v∞² + 2μ/r_p) − √(μ(2/r_p − 2/(r_p + r_a)))',
    simple: 'A sonda chega rápida demais para ficar em Marte. Uma queima de frenagem no ponto mais baixo transforma a passagem numa órbita. Órbitas elípticas grandes são mais baratas.',
    analogy: 'Frear na curva certa para entrar na garagem.',
    inputs: 'v∞ de chegada, periapse e apoapse desejados.', impact: 'Define quanto propelente a sonda precisa levar.',
    assumptions: 'Queima impulsiva no periapse; μ de Marte = 42.828 km³/s².',
    live: ({ plan, state }) => {
      const o = CAPTURE_ORBITS[state.design.captureOrbit];
      return plan.transfer.ok ? `v∞ ${kms(plan.transfer.vInfArr)} → ${o.name}: ${fmt(plan.captureDeltaV)} m/s. A sonda tem ${fmt(plan.probe.deltaV)} m/s.` : '—';
    },
  },
  {
    id: 'tcm', title: 'Correções de trajetória (TCM)', unit: 'm/s', formula: 'Δv = |v_Lambert(r_atual → mira, t_restante) − v_atual|',
    simple: 'Pequenos erros na partida crescem durante a viagem. Corrigir cedo costuma ser barato porque há muito tempo para o pequeno empurrão fazer efeito — mas a geometria decide caso a caso.',
    inputs: 'Estado atual da sonda, ponto de mira em Marte, tempo restante.', impact: 'Consome propelente da reserva de captura.',
    assumptions: 'Recalcula Lambert do estado atual até o ponto de mira; erros de execução de 1% em módulo e 0,3° de apontamento.',
    live: ({ state }) => state.cruise ? `Δv gasto em correções: ${fmt(state.cruise.totalTcmDeltaV, 2)} m/s. Propelente restante: ${fmt(state.cruise.propellant)} kg.` : `Reserva planejada: 40 m/s. O lançador mira ${fmt(250000)} km ao lado de Marte (proteção planetária); a 1ª correção remove esse viés.`,
  },
  {
    id: 'soi', title: 'Esfera de influência', unit: 'km', formula: 'r_SOI = a · (m/M)^{2/5}',
    simple: 'Perto de Marte, a gravidade de Marte vence a do Sol. A simulação troca o "dono" da órbita nessa fronteira (cônicas remendadas).',
    analogy: 'Fronteira entre dois países: ao cruzar, valem as regras do outro.',
    inputs: 'Massas e distância Sol–Marte.', impact: 'Se a sonda passa fora da SOI, não há captura.',
    assumptions: 'r_SOI de Marte ≈ 577.000 km.',
    live: () => `SOI de Marte ≈ 577.000 km; raio de Marte ${fmt(RADIUS.mars)} km; μ = ${fmt(MU.mars)} km³/s².`,
  },
  {
    id: 'energia', title: 'Energia elétrica', unit: 'W', formula: 'P = S₀/d² · A · η',
    simple: 'A luz do Sol se espalha: a 1,5 UA chega menos da metade da energia que na Terra. Painéis precisam ser grandes; um RTG não depende do Sol, mas gera pouco.',
    inputs: 'Área do painel, distância ao Sol, poeira, fração iluminada da órbita.', impact: 'Limita quantos instrumentos funcionam ao mesmo tempo.',
    assumptions: `S₀ = ${SOLAR_CONSTANT} W/m², η efetivo = ${PANEL_EFFICIENCY * 100}% (didático).`,
    live: ({ plan }) => `Em Marte (${fmt(plan.marsSunAu, 2)} UA): ${fmt(plan.powerAtMars)} W iluminado; pico de consumo ${fmt(plan.powerNeedPeak)} W.`,
  },
  {
    id: 'enlace', title: 'Intensidade do sinal', unit: 'bit/s', formula: 'P_r = P_t·G_t·G_r·(λ/4πd)² ; R = P_r / (k·T·Eb/N₀)',
    simple: 'O sinal de rádio enfraquece com o quadrado da distância. Antenas grandes concentram o feixe; a taxa de dados é o que sobra acima do ruído.',
    inputs: 'Potência do transmissor, diâmetro das antenas, distância, ruído do receptor.', impact: 'Quanto dos dados científicos chega à Terra.',
    assumptions: `Banda X ${LINK.frequencyHz / 1e9} GHz, antena DSN de ${LINK.groundDiameter} m, T = ${LINK.systemNoiseK} K, Eb/N₀ exigido ${LINK.requiredEbN0Db} dB + margem ${LINK.marginDb} dB.`,
    live: ({ plan }) => plan.commsAtArrival ? `Na chegada: ${fmt(plan.commsAtArrival.distanceKm / AU_KM, 2)} UA, perda de percurso ${fmt(plan.commsAtArrival.pathLossDb, 1)} dB → ${fmt(plan.commsAtArrival.rate / 1000)} kbit/s.` : '—',
  },
  {
    id: 'latencia', title: 'Atraso do sinal', unit: 'min', formula: 't = d / c',
    simple: 'Nem o rádio é instantâneo. Comandos para Marte levam minutos, por isso a sonda precisa de autonomia.',
    analogy: 'Conversar por cartas em vez de telefone.',
    inputs: 'Distância Terra–sonda.', impact: 'Respostas a emergências chegam atrasadas.',
    assumptions: 'Propagação em linha reta à velocidade da luz.',
    live: ({ plan }) => plan.commsAtArrival ? `Na chegada: ${fmt(plan.commsAtArrival.distanceKm / C_KM_S / 60, 1)} min só de ida.` : '—',
  },
  {
    id: 'conjuncao', title: 'Conjunção solar', unit: 'graus', formula: 'SEP = ângulo Sol–Terra–sonda',
    simple: 'Quando Marte fica atrás do Sol visto da Terra, o plasma solar embaralha o rádio e as comunicações param por alguns dias.',
    inputs: 'Posições da Terra e de Marte (efemérides).', impact: 'Sem enlace: sem manobras comandadas nem envio de dados.',
    assumptions: `Sem enlace abaixo de ${LINK.conjunctionBlackoutDeg}°; taxa a 25% entre ${LINK.conjunctionBlackoutDeg}° e ${LINK.conjunctionDegradedDeg}° (regra didática).`,
    live: () => 'Pelas efemérides do jogo, o menor ângulo Sol–Terra–Marte de 2028 ocorre em 21/03/2028 (≈0,8°).',
  },
  {
    id: 'orcamento', title: 'Orçamento', unit: 'US$ M (fictício)', formula: 'total = lançador + sonda + operações',
    simple: 'Cada peça e cada dia de operação custam. Valores do jogo são fictícios e servem só para comparar escolhas.',
    inputs: 'Peças do foguete e da sonda, dias de cruzeiro, horas de antena.', impact: 'Acima do limite, o lançamento fica NO-GO.',
    assumptions: 'Valores didáticos, sem relação com custos reais da NASA.',
    live: ({ plan }) => plan.budget.lines.map((l) => `${l.label} ${fmt(l.value)}`).join(' · ') + ` = ${fmt(plan.budget.total)} de ${fmt(plan.budget.limit)}.`,
  },
  {
    id: 'cme', title: 'Ejeção de massa coronal', unit: 'km/s', formula: 't_chegada ≈ r / v_CME ; exposto se |λ_sonda − λ_CME| ≤ w',
    simple: 'O Sol às vezes lança nuvens de partículas. Elas viajam em um cone; a sonda só é atingida se estiver dentro dele quando a nuvem passar.',
    inputs: 'Velocidade, direção e largura da CME; posição da sonda.', impact: 'Pode danificar a eletrônica ou forçar o modo seguro.',
    assumptions: 'Propagação radial a velocidade constante. Eventos do jogo são cenários de treinamento; dados DONKI só calibram frequência e velocidades.',
    live: ({ state }) => `${state.solarCalibration.description}`,
  },
];

export const CONCEPTS_BY_PHASE: Record<Phase, string[]> = {
  centro: ['dv', 'c3', 'orcamento'],
  hangar: ['rocket-equation', 'twr', 'isp', 'massa', 'staging', 'capacidade'],
  planejamento: ['lambert', 'c3', 'dla', 'capacidade', 'duracao', 'captura'],
  checklist: ['capacidade', 'twr', 'captura', 'energia', 'enlace', 'orcamento'],
  lancamento: ['staging', 'rocket-equation', 'c3'],
  cruzeiro: ['tcm', 'cme', 'enlace', 'latencia', 'conjuncao', 'soi'],
  marte: ['captura', 'energia', 'enlace', 'latencia', 'conjuncao'],
  relatorio: ['dv', 'capacidade', 'tcm', 'orcamento'],
};

export const MODEL_LIMITATIONS = [
  'Cônicas remendadas: longe dos planetas só o Sol atua; perto de Marte, só Marte.',
  'Lambert de uma revolução, sem perturbações de outros planetas nem pressão de radiação.',
  'Subida modelada por fases de Δv com perdas empíricas, sem integrar a trajetória.',
  'Parâmetros de foguetes com fonte e confiança registradas; estimados não são validados.',
  'Custos são fictícios. Eventos solares do cruzeiro são cenários de treinamento.',
  'A visualização 3D não está em escala; os números dos painéis são os da simulação.',
  `Partida tratada a partir do centro da Terra; órbita de estacionamento de 200 km (r = ${fmt(R_PARKING)} km).`,
];

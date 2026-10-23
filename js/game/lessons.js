// Lições do relatório: cada frase liga o que aconteceu a um conceito de física.
import { AU, DAY } from '../data/constants.js';
import { MISSION } from '../data/mission.js';
import { MARS } from '../data/planets.js';
import { idealPhaseAngle } from '../physics/orbit.js';

export function buildLessons(state, stats) {
  const lessons = [];
  const { result, departure, encounter, ops } = state;
  const f = (v, d = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });

  if (result.reason === 'no-liftoff') {
    lessons.push(
      `TWR (empuxo ÷ peso) na decolagem foi ${f(stats.liftoffTWR, 2)}. Abaixo de 1 o empuxo nem vence o peso; abaixo de ${f(MISSION.minLiftoffTWR, 1)} o foguete perde tempo e combustível lutando contra a gravidade. Mais motores no 1º estágio, ou menos massa em cima dele.`,
    );
  }
  if (result.reason === 'no-orbit') {
    lessons.push(
      `Chegar à órbita baixa custa ${f(MISSION.ascentDeltaV)} m/s e o foguete tinha ${f(stats.totalDeltaV)} m/s. Pela equação do foguete, Δv cresce com o logaritmo da razão de massa: dividir o foguete em estágios e descartar tanques vazios rende muito mais do que um tanque gigante.`,
    );
  }
  if (departure) {
    const miss = departure.phase - idealPhaseAngle();
    if (Math.abs(miss) > 3) {
      lessons.push(
        `Você partiu com ângulo de fase de ${f(departure.phase, 1)}°; o ideal é ${f(idealPhaseAngle(), 1)}°. Na transferência de Hohmann a viagem leva ~259 dias e Marte anda 136° nesse tempo: partir fora da janela faz você chegar onde Marte não está.`,
      );
    } else {
      lessons.push(`Partida na janela: ângulo de fase de ${f(departure.phase, 1)}°, perto do ideal (${f(idealPhaseAngle(), 1)}°). A trajetória de Hohmann é a mais econômica entre duas órbitas circulares.`);
    }
  }
  if (result.reason === 'lost') {
    lessons.push(`Sem encontrar Marte, a nave virou um pequeno planeta: segue numa elipse ao redor do Sol, obedecendo às leis de Kepler para sempre.`);
  }
  if (encounter) {
    lessons.push(
      `Ao chegar, a nave estava ${f(encounter.vInf)} m/s mais rápida que Marte (v∞). A gravidade de Marte acelera a nave na descida, então a captura exigiu ${f(encounter.required)} m/s de frenagem. Uma órbita circular baixa custaria bem mais: órbitas elípticas grandes são mais baratas.`,
    );
  }
  if (result.reason === 'flyby') {
    lessons.push(`Faltou Δv para frear: sem a queima de captura, a nave passa por Marte numa hipérbole e vai embora. Reserve Δv para o fim da viagem.`);
  }
  if (ops) {
    const solar = stats.probe.parts.some((p) => p.solar);
    if (solar) {
      lessons.push(`Marte está a ${f(MARS.a, 2)} UA do Sol: a luz chega espalhada numa área ${f(MARS.a * MARS.a, 2)} vezes maior, então cada painel rende só ${f(100 / (MARS.a * MARS.a))}% do que renderia na Terra (inverso do quadrado).`);
    }
    if (ops.shed) lessons.push('Faltou energia e instrumentos foram desligados. Mais painéis, um RTG ou uma bateria resolveriam, ao custo de massa, e mais massa pede mais Δv.');
    const far = state.timeline.reduce((m, s) => Math.max(m, s.distAU), 0);
    if (ops.dataLost > 0 || stats.probe.dataPerTurn > stats.probe.rateAt1AU / (far * far)) {
      lessons.push(
        `A Terra chegou a ${f(far, 2)} UA de Marte. O sinal de rádio também enfraquece com o quadrado da distância: a ${f(far, 2)} UA a antena envia só ${f(100 / (far * far))}% do que enviaria a 1 UA, e o sinal leva ${f((far * AU) / 299792458 / 60, 1)} minutos para chegar.`,
      );
    }
  }
  if (result.outcome === 'success') {
    const share = result.budgetLeft / MISSION.budget;
    lessons.push(share >= 0.2 ? `Missão cumprida com ${f(share * 100)}% do orçamento sobrando: engenharia eficiente.` : 'Missão cumprida! Gaste menos para ganhar a terceira estrela.');
  } else if (result.reason === 'complete') {
    lessons.push(`A sonda entregou ${f(result.science)} de ${MISSION.scienceTarget} pontos de ciência. Mais instrumentos ou uma antena melhor fariam diferença.`);
  }
  if (state.departure && state.encounter) {
    lessons.push(`A viagem durou ${f((state.encounter.t - state.departure.t) / DAY)} dias.`);
  }
  return lessons;
}

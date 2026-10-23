// Checklist de lançamento: cada item é derivado do plano, com estado GO / WARNING / NO-GO e explicação.
import { fmt } from '../../domain/units';
import type { MissionPlan } from './plan';
import type { CaptureOrbitId } from './capture';

export type GoStatus = 'GO' | 'WARNING' | 'NO-GO';

export interface ChecklistItem {
  id: string;
  label: string;
  status: GoStatus;
  detail: string;
  /** Conceito do Painel de Física que explica o item. */
  concept?: string;
}

type PlanInput = Omit<MissionPlan, 'checklist' | 'goForLaunch'> & { captureOrbit: CaptureOrbitId; sunlitFraction: number };

export function buildChecklist(p: PlanInput): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (id: string, label: string, status: GoStatus, detail: string, concept?: string) => items.push({ id, label, status, detail, concept });

  // Trajetória
  if (!p.transfer.ok) add('trajetoria', 'Trajetória', 'NO-GO', `Sem solução de transferência: ${p.transfer.reason}`, 'lambert');
  else if (p.transfer.c3 > 25) add('trajetoria', 'Trajetória', 'WARNING', `C3 de ${fmt(p.transfer.c3, 1)} km²/s² é alto para Marte; procure uma data melhor no gráfico de oportunidades.`, 'c3');
  else add('trajetoria', 'Trajetória', 'GO', `Lambert resolvido: C3 ${fmt(p.transfer.c3, 2)} km²/s², ${fmt(p.transfer.tofDays)} dias de cruzeiro.`, 'lambert');

  // Compatibilidade
  const vErr = p.vehicle.issues.filter((i) => i.severity === 'erro');
  if (vErr.length) add('compatibilidade', 'Compatibilidade dos estágios', 'NO-GO', vErr.map((i) => i.message).join(' '));
  else add('compatibilidade', 'Compatibilidade dos estágios', p.vehicle.issues.length ? 'WARNING' : 'GO', p.vehicle.issues.length ? p.vehicle.issues.map((i) => i.message).join(' ') : 'Interfaces, coifa e propulsores compatíveis.');

  // Coifa x sonda
  if (p.probe.envelope > p.vehicle.fairing.innerDiameter) {
    add('coifa', 'Coifa e carga útil', 'NO-GO', `A antena estivada precisa de ${fmt(p.probe.envelope, 1)} m e a coifa oferece ${fmt(p.vehicle.fairing.innerDiameter, 2)} m internos.`);
  } else add('coifa', 'Coifa e carga útil', 'GO', `Envelope de ${fmt(p.probe.envelope, 1)} m cabe nos ${fmt(p.vehicle.fairing.innerDiameter, 2)} m da coifa.`);

  // Empuxo
  const twr = p.performance.liftoffTWR;
  if (twr <= 1) add('empuxo', 'Empuxo na decolagem', 'NO-GO', `TWR ${fmt(twr, 2)}: o empuxo não vence o peso e o foguete não sai da plataforma.`, 'twr');
  else if (twr < 1.15) add('empuxo', 'Empuxo na decolagem', 'WARNING', `TWR ${fmt(twr, 2)}: decola, mas lentamente, com perdas gravitacionais grandes.`, 'twr');
  else add('empuxo', 'Empuxo na decolagem', 'GO', `TWR ${fmt(twr, 2)} na decolagem.`, 'twr');

  // Massa x capacidade
  if (p.transfer.ok) {
    const pct = p.massMarginFraction * 100;
    const detail = `Capacidade de ${fmt(p.capacity)} kg para C3 ${fmt(p.transfer.c3, 2)} km²/s²; a sonda e o adaptador somam ${fmt(p.probe.launchMass)} kg (margem ${fmt(pct, 1)}%).`;
    add('massa', 'Massa da sonda × capacidade', p.massMargin < 0 ? 'NO-GO' : pct < 5 ? 'WARNING' : 'GO', detail, 'capacidade');
  } else add('massa', 'Massa da sonda × capacidade', 'NO-GO', 'Sem trajetória, a capacidade de carga não pode ser calculada.', 'capacidade');

  // Propelente da sonda
  if (Number.isFinite(p.captureDeltaV)) {
    const detail = `A sonda tem ${fmt(p.probe.deltaV)} m/s; a captura pede ${fmt(p.captureDeltaV)} m/s e a reserva de correções ${fmt(p.tcmReserve)} m/s.`;
    add('propelente', 'Propelente da sonda', p.probe.deltaV < p.captureDeltaV ? 'NO-GO' : p.probeDeltaVMargin < 0.05 * p.probeDeltaVRequired ? 'WARNING' : 'GO', detail, 'captura');
  }

  // Instrumentos e configuração da sonda
  const probeErr = p.probe.issues.filter((i) => i.severity === 'erro');
  add('sonda', 'Configuração da sonda', probeErr.length ? 'NO-GO' : 'GO', probeErr.length ? probeErr.map((i) => i.message).join(' ') : `${p.probe.instruments.length} instrumento(s) a bordo.`);

  // Energia
  const avgGen = p.powerAtMars * p.sunlitFraction;
  const bus = p.probe.busPower;
  if (avgGen < bus) add('energia', 'Energia em Marte', 'NO-GO', `Geração média de ${fmt(avgGen)} W não sustenta nem o barramento (${fmt(bus)} W).`, 'energia');
  else if (avgGen < p.powerNeedPeak) add('energia', 'Energia em Marte', 'WARNING', `Geração média de ${fmt(avgGen)} W; com tudo ligado a sonda pede ${fmt(p.powerNeedPeak)} W. Será preciso revezar instrumentos.`, 'energia');
  else add('energia', 'Energia em Marte', 'GO', `Geração média de ${fmt(avgGen)} W para ${fmt(p.powerNeedPeak)} W de pico.`, 'energia');

  // Comunicação
  if (p.commsWorst) {
    const kbps = p.commsWorst.rate / 1000;
    add('comunicacao', 'Comunicação', kbps < 10 ? 'WARNING' : 'GO', `Na maior distância das operações (${fmt(p.commsWorst.distanceKm / 1.496e8, 2)} UA) o enlace sustenta ${fmt(kbps, kbps < 10 ? 2 : 0)} kbit/s.`, 'enlace');
  } else add('comunicacao', 'Comunicação', 'NO-GO', 'Datas fora do intervalo das efemérides: não foi possível calcular o enlace.', 'enlace');

  // Orçamento
  if (p.budget.remaining < 0) add('orcamento', 'Orçamento', 'NO-GO', `Custo de US$ ${fmt(p.budget.total)} M excede o limite de US$ ${fmt(p.budget.limit)} M (valores fictícios).`, 'orcamento');
  else if (p.budget.reserveFraction < 0.05) add('orcamento', 'Orçamento', 'WARNING', `Reserva de só ${fmt(p.budget.reserveFraction * 100, 1)}% para imprevistos.`, 'orcamento');
  else add('orcamento', 'Orçamento', 'GO', `US$ ${fmt(p.budget.total)} M de US$ ${fmt(p.budget.limit)} M (fictício), reserva de ${fmt(p.budget.reserveFraction * 100)}%.`, 'orcamento');

  return items;
}

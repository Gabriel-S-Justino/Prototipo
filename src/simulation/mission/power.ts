// Energia elétrica da sonda: painéis solares (inverso do quadrado da distância ao Sol) e RTG.
import { POWER } from '../../data/probe';

/** Irradiância solar a 1 UA (W/m²), valor médio da "constante solar" (Kopp & Lean, 2011). */
export const SOLAR_CONSTANT = 1361;
/**
 * Eficiência efetiva do painel (células, empacotamento, temperatura e degradação acumulada).
 * Valor didático de 18%: com 20 m² a 1,52 UA resulta ~2,1 kW, ordem de grandeza do MRO em Marte.
 */
export const PANEL_EFFICIENCY = 0.18;

export function solarIrradiance(distanceAu: number) {
  if (!(distanceAu > 0)) throw new RangeError('Distância ao Sol deve ser positiva.');
  return SOLAR_CONSTANT / (distanceAu * distanceAu);
}

/** Potência gerada (W) pela opção de energia escolhida, a uma distância do Sol e com fator de poeira/atenuação. */
export function powerGeneration(powerId: string, distanceAu: number, attenuation = 1): number {
  const option = POWER[powerId];
  if (!option) throw new Error(`Opção de energia desconhecida: ${powerId}`);
  if (option.kind === 'rtg') return option.watts ?? 0;
  return solarIrradiance(distanceAu) * (option.area ?? 0) * PANEL_EFFICIENCY * attenuation;
}

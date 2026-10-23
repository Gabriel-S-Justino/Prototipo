// Orçamento da missão. TODOS os valores monetários são fictícios e didáticos (US$ milhões do jogo),
// sem relação com contratos ou custos reais da NASA.
import type { AssembledVehicle } from '../rocket/vehicle';
import type { ProbeStats } from './probe';

export const BUDGET_LIMIT = 650;
/** Custo de operações por dia de cruzeiro e por dia de operações em Marte (equipe, navegação). */
export const CRUISE_COST_PER_DAY = 0.08;
export const OPS_COST_PER_DAY = 0.12;
/** Custo de uma hora diária de antena DSN durante um turno de operações. */
export const DSN_COST_PER_HOUR_TURN = 0.4;
export const OPERATIONS_DAYS = 8 * 30.8;

export interface BudgetLine { id: string; label: string; value: number }
export interface Budget { lines: BudgetLine[]; total: number; limit: number; remaining: number; reserveFraction: number; kind: 'ficticio-didatico' }

export function computeBudget(vehicle: AssembledVehicle, probe: ProbeStats, cruiseDays: number, extra: BudgetLine[] = []): Budget {
  const lines: BudgetLine[] = [
    { id: 'lancador', label: 'Lançador', value: vehicle.cost },
    { id: 'sonda', label: 'Sonda e instrumentos', value: probe.cost },
    { id: 'cruzeiro', label: `Operações de cruzeiro (${Math.round(cruiseDays)} dias)`, value: Math.max(0, cruiseDays) * CRUISE_COST_PER_DAY },
    { id: 'operacoes', label: 'Operações científicas em Marte (8 turnos)', value: OPERATIONS_DAYS * OPS_COST_PER_DAY },
    ...extra,
  ];
  const total = lines.reduce((s, l) => s + l.value, 0);
  return { lines, total, limit: BUDGET_LIMIT, remaining: BUDGET_LIMIT - total, reserveFraction: (BUDGET_LIMIT - total) / BUDGET_LIMIT, kind: 'ficticio-didatico' };
}

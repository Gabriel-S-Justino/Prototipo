/** Resultado, score e estrelas (Arquitetura.md, seção 14). */
export function calculateScore({ captured, science, target, budget, budgetLeft, deltaVLeft, multiplier, safeTurns }) {
  const outcome = captured && science >= target ? 'success' : captured || science > 0 ? 'partial' : 'failure';
  const share = budget > 0 ? Math.max(0, budgetLeft) / budget : 0;
  const raw = science * (1 + share * 0.5) * multiplier + deltaVLeft / 100 - 5 * safeTurns;
  const score = outcome === 'failure' ? 0 : Math.max(0, Math.round(raw));
  const stars = outcome === 'failure' ? 0 : outcome === 'partial' ? 1 : share >= 0.2 ? 3 : 2;
  return { outcome, score, stars };
}

import type { GoStatus } from '../simulation/mission/checklist';

const META: Record<GoStatus, { cls: string; icon: string; label: string }> = {
  GO: { cls: 'go', icon: '✔', label: 'GO' },
  WARNING: { cls: 'warning', icon: '▲', label: 'WARNING' },
  'NO-GO': { cls: 'nogo', icon: '✖', label: 'NO-GO' },
};

/** Estado com ícone e texto, para não depender só da cor. */
export function StatusBadge({ status }: { status: GoStatus }) {
  const m = META[status];
  return (
    <span className={`badge ${m.cls}`}>
      <span aria-hidden="true">{m.icon}</span>
      {m.label}
    </span>
  );
}

import type { ReactNode } from 'react';

export function Metric({ label, value, unit, tone, title }: { label: string; value: ReactNode; unit?: string; tone?: 'good' | 'warn' | 'bad'; title?: string }) {
  return (
    <div className={`metric ${tone ?? ''}`} title={title}>
      <dt>{label}</dt>
      <dd>
        {value}
        {unit ? <small> {unit}</small> : null}
      </dd>
    </div>
  );
}

export function Metrics({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <dl className="metrics" aria-label={label}>
      {children}
    </dl>
  );
}

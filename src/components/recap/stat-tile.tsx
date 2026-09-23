import type { ReactNode } from 'react';

interface StatTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: 'primary' | 'emerald' | 'amber' | 'sky';
  className?: string;
}

const ACCENTS = {
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  sky: 'bg-sky-500/10 text-sky-500',
} as const;

export default function StatTile({
  icon,
  label,
  value,
  detail,
  accent = 'primary',
  className,
}: StatTileProps) {
  return (
    <div className={`glass-panel rounded-2xl p-5 shadow-soft ${className ?? ''}`}>
      <div className={`mb-4 inline-flex rounded-xl p-2 ${ACCENTS[accent]}`}>{icon}</div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
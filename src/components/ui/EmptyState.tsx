import { Button } from './Button';
import { cn } from '@/lib/utils';
import type React from 'react';

type EmptyStateAction = React.ReactNode | { label: string; onClick: () => void };

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

function isActionButton(action: EmptyStateAction): action is { label: string; onClick: () => void } {
  return typeof action === 'object' && action !== null && 'label' in action;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    // A visible boundary is the whole point of an empty state. This rendered
    // bare text with no border or background, so on the dashboard "No goals set
    // yet. Add your first weekly goal to track progress" appeared to float with
    // no container at all — the user read it as missing content rather than an
    // intentional empty state. Dashed border so it reads as a placeholder to
    // fill in, and `bg-muted/30` so it still reads in dark mode.
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center fade-rise-in',
        className
      )}
    >
      {icon && (
        <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action &&
        (isActionButton(action) ? (
          <Button className="mt-3" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : (
          <div className="mt-3">{action}</div>
        ))}
    </div>
  );
}
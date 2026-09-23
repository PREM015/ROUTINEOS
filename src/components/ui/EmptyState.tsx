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
    <div className={cn('text-center py-12 fade-rise-in', className)}>
      {icon && <div className="text-6xl mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {description && <p className="text-muted-foreground mb-6">{description}</p>}
      {action &&
        (isActionButton(action) ? (
          <Button onClick={action.onClick}>{action.label}</Button>
        ) : (
          <div className="mt-6">{action}</div>
        ))}
    </div>
  );
}
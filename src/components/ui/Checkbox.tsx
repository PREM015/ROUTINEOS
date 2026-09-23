"use client";

/**
 * Checkbox — a controlled boolean toggle built on Radix UI's Checkbox
 * primitive, with an optional inline label wired up for screen readers.
 *
 * Usage:
 *   <Checkbox checked={done} onCheckedChange={setDone} label="Completed" />
 */
import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  id?: string;
  /** Classes applied to the outer flex wrapper. */
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  id,
  className,
}: CheckboxProps) {
  const generatedId = React.useId();
  const resolvedId = id ?? generatedId;

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <CheckboxPrimitive.Root
        id={resolvedId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-card transition-colors ease-out-expo hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-primary-foreground">
          <Check
            className="h-3.5 w-3.5 origin-center transition-transform duration-200 ease-out-expo data-[state=checked]:scale-100 data-[state=unchecked]:scale-0"
            strokeWidth={3}
          />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && (
        <label htmlFor={resolvedId} className="text-sm font-medium text-foreground select-none">
          {label}
        </label>
      )}
    </div>
  );
}
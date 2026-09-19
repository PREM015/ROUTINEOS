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
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white transition-colors hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && (
        <label htmlFor={resolvedId} className="text-sm font-medium text-gray-700 select-none">
          {label}
        </label>
      )}
    </div>
  );
}
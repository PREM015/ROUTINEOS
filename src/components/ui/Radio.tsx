"use client";

/**
 * Radio — a horizontal or vertical radio group built on Radix UI's
 * RadioGroup primitive, driven by a declarative options array.
 *
 * Usage:
 *   <Radio value={frequency} onValueChange={setFrequency}
 *     options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
 */
import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  /** Optional supporting text shown under the label. */
  description?: string;
  disabled?: boolean;
}

export interface RadioProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly RadioOption[];
  orientation?: 'vertical' | 'horizontal';
  label?: string;
  className?: string;
}

export function Radio({
  value,
  onValueChange,
  options,
  orientation = 'vertical',
  label,
  className,
}: RadioProps) {
  return (
    <div className={cn('w-full', className)}>
      {label && <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>}
      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        orientation={orientation}
        className={cn(
          'flex gap-3',
          orientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
        )}
      >
        {options.map((option) => {
          const optionId = `radio-${option.value}`;
          return (
            <label key={option.value} htmlFor={optionId} className="inline-flex items-start gap-2.5">
              <RadioGroupPrimitive.Item
                id={optionId}
                value={option.value}
                disabled={option.disabled}
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white transition-colors hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=checked]:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RadioGroupPrimitive.Indicator className="flex h-4 w-4 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                </RadioGroupPrimitive.Indicator>
              </RadioGroupPrimitive.Item>
              <span className="select-none">
                <span className="block text-sm font-medium text-gray-700">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-gray-500">{option.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
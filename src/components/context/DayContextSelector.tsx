'use client';

/**
 * DayContextSelector — pick today's context to tailor scoring and suggestions.
 *
 * Renders a set of selectable mode buttons (workday, weekend, holiday, exam
 * day, low energy, custom). The backend day-mode API only supports MINIMUM/REST
 * today, so this control keeps its state locally and reports changes upward via
 * `onChange` for the parent to persist or act on.
 *
 * Usage:
 *   <DayContextSelector value={mode} onChange={setMode} />
 */

import { Battery, Briefcase, GraduationCap, Plane, Settings, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DayContext = 'WORKDAY' | 'WEEKEND' | 'HOLIDAY' | 'EXAM_DAY' | 'LOW_ENERGY' | 'CUSTOM';

export const DAY_CONTEXTS: ReadonlyArray<{ value: DayContext; label: string; hint: string }> = [
  { value: 'WORKDAY', label: 'Workday', hint: 'Standard productivity day' },
  { value: 'WEEKEND', label: 'Weekend', hint: 'Relaxed schedule' },
  { value: 'HOLIDAY', label: 'Holiday', hint: 'Day off / festive' },
  { value: 'EXAM_DAY', label: 'Exam day', hint: 'High-stakes focus day' },
  { value: 'LOW_ENERGY', label: 'Low energy', hint: 'Scale back the load' },
  { value: 'CUSTOM', label: 'Custom', hint: 'Tailored to your plan' },
];

export interface DayContextSelectorProps {
  value?: DayContext;
  onChange?: (context: DayContext) => void;
  className?: string;
}

function iconFor(context: DayContext): React.ReactNode {
  switch (context) {
    case 'WORKDAY':
      return <Briefcase className="h-5 w-5" />;
    case 'WEEKEND':
      return <Sun className="h-5 w-5" />;
    case 'HOLIDAY':
      return <Plane className="h-5 w-5" />;
    case 'EXAM_DAY':
      return <GraduationCap className="h-5 w-5" />;
    case 'LOW_ENERGY':
      return <Battery className="h-5 w-5" />;
    case 'CUSTOM':
      return <Settings className="h-5 w-5" />;
  }
}

export function DayContextSelector({ value, onChange, className }: DayContextSelectorProps) {
  const selected = value ?? 'WORKDAY';

  return (
    <div className={cn('w-full', className)}>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Day context</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DAY_CONTEXTS.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange?.(option.value)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-lg border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                active
                  ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md',
                  active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                )}
                aria-hidden="true"
              >
                {iconFor(option.value)}
              </span>
              <span>
                <span className={cn('block text-sm font-medium', active ? 'text-blue-800' : 'text-gray-800')}>
                  {option.label}
                </span>
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Day context is applied locally for now — the day-mode API is not available on this deployment.
      </p>
    </div>
  );
}

export default DayContextSelector;
"use client";
/**
 * FormWizard — multi-step form with a progress indicator and next/back controls.
 *
 * Renders one `steps` entry at a time; each step has a title, optional
 * description, and `content`. "Next" advances until the last step, where it
 * becomes `submitLabel` and fires `onComplete`. Progress is shown as numbered
 * dots that link back to already-visited steps.
 *
 * Props:
 * - steps: FormWizardStep[] ({ id, title, description?, content, canProceed? })
 * - initialStep: starting index (default 0)
 * - onComplete: fires when the last step's submit button is pressed
 * - onStepChange: fires with the new index after navigating
 * - submitLabel: text for the button on the last step
 * - loading: disables controls and shows a spinner
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface FormWizardStep {
  id: string;
  title: string;
  description?: string;
  content: React.ReactNode;
  /** When false, "Next" is disabled on this step. */
  canProceed?: boolean;
}

export interface FormWizardProps {
  steps: FormWizardStep[];
  initialStep?: number;
  onComplete?: () => void;
  onStepChange?: (index: number) => void;
  className?: string;
  submitLabel?: string;
  loading?: boolean;
}

export function FormWizard({
  steps,
  initialStep = 0,
  onComplete,
  onStepChange,
  className,
  submitLabel = 'Finish',
  loading = false,
}: FormWizardProps) {
  const [current, setCurrent] = useState(() => Math.min(Math.max(0, initialStep), steps.length - 1));

  if (steps.length === 0) {
    return <div className="text-sm text-zinc-500">No steps to display.</div>;
  }

  const safeCurrent = Math.min(Math.max(0, current), steps.length - 1);
  const step = steps[safeCurrent] as FormWizardStep;
  const isFirst = safeCurrent === 0;
  const isLast = safeCurrent === steps.length - 1;
  const nextDisabled = loading || step.canProceed === false;

  const goTo = (index: number) => {
    const clamped = Math.min(Math.max(0, index), steps.length - 1);
    setCurrent(clamped);
    onStepChange?.(clamped);
  };

  const goNext = () => {
    if (isLast) {
      onComplete?.();
    } else {
      goTo(safeCurrent + 1);
    }
  };

  const goBack = () => {
    goTo(safeCurrent - 1);
  };

  return (
    <div className={cn('w-full', className)}>
      <nav aria-label="Progress" className="mb-6">
        <ol className="flex items-center gap-2">
          {steps.map((item, index) => {
            const isActive = index === safeCurrent;
            const isVisited = index < safeCurrent;
            return (
              <li key={item.id} className="flex items-center gap-2">
                {isVisited ? (
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/30"
                    aria-label={`Go to step: ${item.title}`}
                  >
                    {index + 1}
                  </button>
                ) : (
                  <span
                    aria-current={isActive ? 'step' : undefined}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
                      isActive ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-500',
                    )}
                  >
                    {index + 1}
                  </span>
                )}
                {index < steps.length - 1 && <span className="h-px w-6 bg-zinc-800" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">{step.title}</h3>
        {step.description !== undefined && <p className="text-sm text-zinc-400">{step.description}</p>}
      </div>

      <div className="mt-6">{step.content}</div>

      <div className="mt-8 flex items-center justify-between">
        <Button type="button" variant="outline" onClick={goBack} disabled={isFirst || loading}>
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <Button type="button" onClick={goNext} disabled={nextDisabled} isLoading={loading}>
          {isLast ? submitLabel : 'Next'}
          {!isLast && <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

export default FormWizard;
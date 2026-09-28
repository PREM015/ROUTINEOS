"use client";

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ONBOARDING_ROUTINE_TEMPLATES } from './onboarding-options';

/**
 * RoutineStep — pick a starter routine.
 *
 * Both cards used to call the same `onNext`, so no template id ever left the
 * component and nothing was applied. The chosen id is now handed back to the
 * wizard, which POSTs it to `/api/templates/use`.
 */
export function RoutineStep({
  selectedId,
  onSelect,
  onNext,
  onBack,
  saving,
}: {
  selectedId: string | null;
  onSelect: (templateId: string) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose a Routine Template</h2>
        <p className="mt-2 text-muted-foreground">You can always customize this later.</p>
      </div>

      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {ONBOARDING_ROUTINE_TEMPLATES.map((template) => {
          const active = selectedId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(template.id)}
              onMouseEnter={() => setHovered(template.id)}
              onMouseLeave={() => setHovered(null)}
              className={`glass-panel relative p-6 text-left shadow-soft transition-all duration-300 ease-out-expo hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                active
                  ? 'border-primary glow-primary'
                  : hovered === template.id
                    ? 'hover:border-primary/40'
                    : ''
              }`}
            >
              {active && (
                <CheckCircle2
                  className="absolute right-4 top-4 h-5 w-5 text-primary"
                  aria-hidden="true"
                />
              )}
              <h3 className="text-lg font-semibold">{template.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {template.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mx-auto flex max-w-md items-center justify-center gap-4 pt-4">
        <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          isLoading={saving}
          className="text-muted-foreground hover:text-foreground"
        >
          {selectedId ? 'Apply and continue' : 'Skip for now'}
        </Button>
      </div>
    </div>
  );
}

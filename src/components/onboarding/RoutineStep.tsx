"use client";

import { Button } from '@/components/ui/Button';

export function RoutineStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose a Routine Template</h2>
        <p className="mt-2 text-muted-foreground">You can always customize this later.</p>
      </div>

      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onNext}
          className="glass-panel glow-primary p-6 text-center shadow-soft transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <h3 className="text-lg font-semibold">Workday Optimizer</h3>
          <p className="mt-2 text-sm text-muted-foreground">Focused on deep work, regular breaks, and evening wind-down.</p>
        </button>
        <button
          type="button"
          onClick={onNext}
          className="glass-panel glow-primary p-6 text-center shadow-soft transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <h3 className="text-lg font-semibold">Balanced Life</h3>
          <p className="mt-2 text-sm text-muted-foreground">Mix of fitness, learning, and steady productivity.</p>
        </button>
      </div>

      <div className="mx-auto flex max-w-md justify-center gap-4 pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" variant="ghost" onClick={onNext} className="text-muted-foreground hover:text-foreground">
          Skip for now
        </Button>
      </div>
    </div>
  );
}
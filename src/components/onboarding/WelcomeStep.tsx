"use client";

import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-8 text-center">
      <div className="flex justify-center">
        <Logo variant="icon" size="lg" />
      </div>
      <h1 className="animated-gradient-text text-3xl font-bold">Welcome to RoutineOS</h1>
      <p className="max-w-md text-muted-foreground">
        Your ultimate productivity platform. Let&rsquo;s get you set up so you can start achieving your goals and building better habits.
      </p>
      <Button onClick={onNext} size="lg" className="mt-8">
        Get Started
      </Button>
    </div>
  );
}
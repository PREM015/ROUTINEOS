"use client";

import { useState } from 'react';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { TimezoneStep } from '@/components/onboarding/TimezoneStep';
import { SleepStep } from '@/components/onboarding/SleepStep';
import { RoutineStep } from '@/components/onboarding/RoutineStep';
import { HabitStep } from '@/components/onboarding/HabitStep';
import { GoalStep } from '@/components/onboarding/GoalStep';
import { DashboardStep } from '@/components/onboarding/DashboardStep';

export default function OnboardingPage() {
  const [step, setStep] = useState(0);

  const nextStep = () => setStep(s => Math.min(6, s + 1));
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      {step > 0 && step < 6 && (
        <div className="w-full max-w-md mb-8">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-in-out" 
              style={{ width: `${(step / 6) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      <div className="w-full max-w-2xl bg-card border rounded-2xl p-8 shadow-sm">
        {step === 0 && <WelcomeStep onNext={nextStep} />}
        {step === 1 && <TimezoneStep onNext={nextStep} onBack={prevStep} />}
        {step === 2 && <SleepStep onNext={nextStep} onBack={prevStep} />}
        {step === 3 && <RoutineStep onNext={nextStep} onBack={prevStep} />}
        {step === 4 && <HabitStep onNext={nextStep} onBack={prevStep} />}
        {step === 5 && <GoalStep onNext={nextStep} onBack={prevStep} />}
        {step === 6 && <DashboardStep />}
      </div>
    </div>
  );
}

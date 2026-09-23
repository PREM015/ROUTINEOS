"use client";

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { TimezoneStep } from '@/components/onboarding/TimezoneStep';
import { SleepStep } from '@/components/onboarding/SleepStep';
import { RoutineStep } from '@/components/onboarding/RoutineStep';
import { HabitStep } from '@/components/onboarding/HabitStep';
import { GoalStep } from '@/components/onboarding/GoalStep';
import { DashboardStep } from '@/components/onboarding/DashboardStep';
import { EASE } from '@/lib/motion';

const MAX_STEP = 6;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduce = useReducedMotion();

  const goTo = (delta: number) => {
    setDirection(delta);
    setStep((current) => Math.min(MAX_STEP, Math.max(0, current + delta)));
  };

  const stepVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 48 : -48 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -48 : 48 }),
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      {step > 0 && step < MAX_STEP && (
        <div className="w-full max-w-2xl mb-6">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${(step / MAX_STEP) * 100}%` }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-raised sm:p-10">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={reduce ? undefined : stepVariants}
            initial={reduce ? false : 'enter'}
            animate={reduce ? { opacity: 1 } : 'center'}
            exit={reduce ? undefined : 'exit'}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {step === 0 && <WelcomeStep onNext={() => goTo(1)} />}
            {step === 1 && <TimezoneStep onNext={() => goTo(1)} onBack={() => goTo(-1)} />}
            {step === 2 && <SleepStep onNext={() => goTo(1)} onBack={() => goTo(-1)} />}
            {step === 3 && <RoutineStep onNext={() => goTo(1)} onBack={() => goTo(-1)} />}
            {step === 4 && <HabitStep onNext={() => goTo(1)} onBack={() => goTo(-1)} />}
            {step === 5 && <GoalStep onNext={() => goTo(1)} onBack={() => goTo(-1)} />}
            {step === 6 && <DashboardStep />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
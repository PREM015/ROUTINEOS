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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 bg-background">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="gradient-mesh-animated absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />
      </div>
      {step > 0 && step < MAX_STEP && (
        <div className="relative w-full max-w-2xl mb-6">
          <div className="h-2 overflow-hidden rounded-full bg-muted shadow-soft">
            <motion.div
              className="shimmer-active glow-primary h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${(step / MAX_STEP) * 100}%` }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </div>
        </div>
      )}

      <div className="relative w-full max-w-2xl rounded-2xl glass-panel glow-primary p-8 shadow-long sm:p-10">
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
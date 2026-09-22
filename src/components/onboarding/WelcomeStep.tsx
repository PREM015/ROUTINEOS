"use client";

import { motion } from 'framer-motion';
import { Logo } from '@/components/layout/Logo';

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center p-8 space-y-6 text-center"
    >
      <div className="flex justify-center">
        <Logo variant="icon" size="lg" />
      </div>
      <h1 className="text-3xl font-bold">Welcome to RoutineOS</h1>
      <p className="text-muted-foreground max-w-md">
        Your ultimate productivity platform. Let&rsquo;s get you set up so you can start achieving your goals and building better habits.
      </p>
      <button
        onClick={onNext}
        className="mt-8 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
      >
        Get Started
      </button>
    </motion.div>
  );
}

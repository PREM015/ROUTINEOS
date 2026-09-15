"use client";

import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function DashboardStep() {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center space-y-6 text-center"
    >
      <div className="bg-green-500/10 p-4 rounded-full">
        <CheckCircle className="w-16 h-16 text-green-500" />
      </div>
      <h2 className="text-3xl font-bold">You're all set!</h2>
      <p className="text-muted-foreground max-w-md">
        Your RoutineOS is configured. You can tweak these settings anytime from your dashboard. Let's make today great.
      </p>
      
      <button
        onClick={() => router.push('/dashboard')}
        className="mt-8 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
      >
        Go to Dashboard
      </button>
    </motion.div>
  );
}

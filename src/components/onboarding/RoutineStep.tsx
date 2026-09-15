"use client";

import { motion } from 'framer-motion';

export function RoutineStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose a Routine Template</h2>
        <p className="text-muted-foreground mt-2">You can always customize this later.</p>
      </div>
      
      <div className="max-w-2xl mx-auto grid gap-4 grid-cols-1 sm:grid-cols-2">
        <div className="border rounded-xl p-6 hover:border-primary cursor-pointer transition-colors text-center" onClick={onNext}>
          <h3 className="font-semibold text-lg">Workday Optimizer</h3>
          <p className="text-sm text-muted-foreground mt-2">Focused on deep work, regular breaks, and evening wind-down.</p>
        </div>
        <div className="border rounded-xl p-6 hover:border-primary cursor-pointer transition-colors text-center" onClick={onNext}>
          <h3 className="font-semibold text-lg">Balanced Life</h3>
          <p className="text-sm text-muted-foreground mt-2">Mix of fitness, learning, and steady productivity.</p>
        </div>
      </div>
      
      <div className="max-w-md mx-auto flex justify-center mt-6">
        <button onClick={onBack} className="px-4 py-2 border rounded-lg hover:bg-muted mr-4">Back</button>
        <button onClick={onNext} className="px-4 py-2 text-muted-foreground hover:text-foreground">Skip for now</button>
      </div>
    </motion.div>
  );
}

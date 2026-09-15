"use client";

import { motion } from 'framer-motion';
import { useState } from 'react';

export function GoalStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [goal, setGoal] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold">Set a Monthly Goal</h2>
        <p className="text-muted-foreground mt-2">What is your primary focus for this month?</p>
      </div>
      
      <div className="max-w-md mx-auto space-y-4">
        <input
          type="text"
          placeholder="e.g. Launch my side project, Run 50 miles"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="w-full p-3 rounded-lg border bg-background"
        />
        
        <div className="flex gap-4 pt-4">
          <button onClick={onBack} className="flex-1 px-4 py-2 border rounded-lg hover:bg-muted">Back</button>
          <button onClick={onNext} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">Continue</button>
        </div>
      </div>
    </motion.div>
  );
}

"use client";

import { motion } from 'framer-motion';
import { useState } from 'react';

export function SleepStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [bedtime, setBedtime] = useState('22:00');
  const [waketime, setWaketime] = useState('06:00');

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold">Set your sleep schedule</h2>
        <p className="text-muted-foreground mt-2">Consistent sleep is the foundation of productivity.</p>
      </div>
      
      <div className="max-w-md mx-auto space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Target Bedtime</label>
          <input type="time" value={bedtime} onChange={e => setBedtime(e.target.value)} className="w-full p-3 rounded-lg border bg-background" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Target Wake Time</label>
          <input type="time" value={waketime} onChange={e => setWaketime(e.target.value)} className="w-full p-3 rounded-lg border bg-background" />
        </div>
        
        <div className="flex gap-4 pt-4">
          <button onClick={onBack} className="flex-1 px-4 py-2 border rounded-lg hover:bg-muted">Back</button>
          <button onClick={onNext} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">Continue</button>
        </div>
      </div>
    </motion.div>
  );
}

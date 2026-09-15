"use client";

import { motion } from 'framer-motion';
import { useState } from 'react';

export function TimezoneStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold">Where are you located?</h2>
        <p className="text-muted-foreground mt-2">We use this to reset your daily habits at the right time.</p>
      </div>
      
      <div className="max-w-md mx-auto space-y-4">
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full p-3 rounded-lg border bg-background"
        >
          <option value={timezone}>{timezone}</option>
          {/* Add more timezones as needed */}
          <option value="America/New_York">America/New_York</option>
          <option value="Europe/London">Europe/London</option>
          <option value="Asia/Tokyo">Asia/Tokyo</option>
        </select>
        
        <div className="flex gap-4">
          <button onClick={onBack} className="flex-1 px-4 py-2 border rounded-lg hover:bg-muted">Back</button>
          <button onClick={onNext} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">Continue</button>
        </div>
      </div>
    </motion.div>
  );
}

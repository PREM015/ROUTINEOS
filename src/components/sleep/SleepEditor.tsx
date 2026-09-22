'use client';
import React, { useState, useEffect } from 'react';
import { SleepLog, SleepFormData } from '@/types/sleep';
import { calculateSleepDuration, formatSleepDuration } from '@/lib/sleep/calculate-duration';

interface SleepEditorProps {
  sleepLog?: SleepLog | null;
  onSave: (data: SleepFormData) => void;
  onCancel: () => void;
}

export function SleepEditor({ sleepLog, onSave, onCancel }: SleepEditorProps) {
  const [bedtime, setBedtime] = useState(sleepLog?.actualBedtime || '23:00');
  const [wakeTime, setWakeTime] = useState(sleepLog?.actualWakeTime || '07:00');
  const [notes, setNotes] = useState(sleepLog?.notes || '');
  const [durationStr, setDurationStr] = useState('');

  useEffect(() => {
    if (bedtime && wakeTime) {
      const duration = calculateSleepDuration(bedtime, wakeTime);
      setDurationStr(formatSleepDuration(duration));
    } else {
      setDurationStr('');
    }
  }, [bedtime, wakeTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ bedtime, wakeTime, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-white shadow space-y-4">
      <h3 className="text-lg font-semibold">Log Sleep</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bedtime</label>
          <input 
            type="time" 
            required
            value={bedtime}
            onChange={(e) => setBedtime(e.target.value)}
            className="w-full border rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Wake Time</label>
          <input 
            type="time" 
            required
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
            className="w-full border rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {durationStr && (
        <p className="text-sm text-gray-600">Calculated duration: <span className="font-medium text-gray-900">{durationStr}</span></p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
        <textarea 
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          Save
        </button>
      </div>
    </form>
  );
}

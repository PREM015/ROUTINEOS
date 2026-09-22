'use client';
import React, { useState } from 'react';
import { DailyReflection, ReflectionFormData } from '@/types/analytics';
import { EnergySelector } from './EnergySelector';
import { MoodSelector } from './MoodSelector';

interface ReflectionFormProps {
  reflection?: DailyReflection | null;
  onSave: (data: ReflectionFormData) => void;
}

export function ReflectionForm({ reflection, onSave }: ReflectionFormProps) {
  const [energyLevel, setEnergyLevel] = useState(reflection?.energy || 3);
  const [moodLevel, setMoodLevel] = useState(reflection?.mood || 3);
  const [biggestWin, setBiggestWin] = useState(reflection?.biggestWin || '');
  const [biggestDifficulty, setBiggestDifficulty] = useState(reflection?.biggestDifficulty || '');
  const [lessonsLearned, setLessonsLearned] = useState(reflection?.lessonsLearned || '');
  const [gratitude, setGratitude] = useState(reflection?.gratitude || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      energyLevel,
      moodLevel,
      biggestWin,
      biggestDifficulty,
      lessonsLearned,
      gratitude
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-white shadow space-y-6">
      <h3 className="text-lg font-semibold">Daily Reflection</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center md:text-left">Energy Level</label>
          <EnergySelector value={energyLevel} onChange={setEnergyLevel} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center md:text-left">Mood Level</label>
          <MoodSelector value={moodLevel} onChange={setMoodLevel} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Biggest Win</label>
        <textarea 
          maxLength={200}
          value={biggestWin}
          onChange={e => setBiggestWin(e.target.value)}
          className="w-full border rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={2}
        />
        <p className="text-xs text-right text-gray-400 mt-1">{biggestWin.length}/200</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Biggest Difficulty</label>
        <textarea 
          maxLength={200}
          value={biggestDifficulty}
          onChange={e => setBiggestDifficulty(e.target.value)}
          className="w-full border rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={2}
        />
        <p className="text-xs text-right text-gray-400 mt-1">{biggestDifficulty.length}/200</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lessons Learned</label>
        <textarea 
          maxLength={300}
          value={lessonsLearned}
          onChange={e => setLessonsLearned(e.target.value)}
          className="w-full border rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={2}
        />
        <p className="text-xs text-right text-gray-400 mt-1">{lessonsLearned.length}/300</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Gratitude</label>
        <textarea 
          maxLength={300}
          value={gratitude}
          onChange={e => setGratitude(e.target.value)}
          className="w-full border rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={2}
        />
        <p className="text-xs text-right text-gray-400 mt-1">{gratitude.length}/300</p>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button 
          type="submit" 
          className="px-6 py-2 bg-indigo-600 text-white font-medium rounded shadow hover:bg-indigo-700 transition"
        >
          Save Reflection
        </button>
      </div>
    </form>
  );
}

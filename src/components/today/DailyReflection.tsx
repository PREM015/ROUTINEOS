'use client';

import { useState } from 'react';

export function DailyReflection({ date }: { date: string }) {
  const [energy, setEnergy] = useState(3);
  const [mood, setMood] = useState(3);
  const [win, setWin] = useState('');
  const [notes, setNotes] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app this would post to an API
    alert('Reflection saved for ' + date);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Daily Reflection</h3>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Energy (1-5)</label>
          <input type="range" min="1" max="5" value={energy} onChange={e => setEnergy(parseInt(e.target.value))} className="w-full accent-blue-500" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Mood (1-5)</label>
          <input type="range" min="1" max="5" value={mood} onChange={e => setMood(parseInt(e.target.value))} className="w-full accent-purple-500" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Biggest Win</label>
          <input type="text" value={win} onChange={e => setWin(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="What went well today?" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm h-20 resize-none" placeholder="Any other thoughts?" />
        </div>
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
          Save Reflection
        </button>
      </form>
    </div>
  );
}

'use client';
import { useState } from 'react';
export interface GoalProgressEditorProps { goal: { id: string; title: string; targetValue: number; currentValue: number; unit?: string }; onSave: (value: number, note?: string) => void; onCancel: () => void; }
export default function GoalProgressEditor({ goal, onSave, onCancel }: GoalProgressEditorProps) {
  const [val, setVal] = useState(goal.currentValue.toString());
  const [note, setNote] = useState('');
  return (
    <div className="p-4 border rounded shadow-sm bg-gray-50 max-w-sm">
      <h3 className="font-semibold mb-2">{goal.title}</h3>
      <div className="flex items-center gap-2 mb-3">
        <input type="number" value={val} onChange={e => setVal(e.target.value)} className="border p-2 rounded w-24" />
        <span className="text-gray-600">/ {goal.targetValue} {goal.unit || ''}</span>
      </div>
      <input type="text" placeholder="Add a note (optional)..." value={note} onChange={e => setNote(e.target.value)} className="w-full border p-2 rounded mb-3 text-sm" />
      <div className="flex gap-2">
        <button onClick={() => onSave(Number(val), note)} className="flex-1 bg-green-600 text-white py-1 rounded hover:bg-green-700">Save</button>
        <button onClick={onCancel} className="flex-1 bg-gray-300 py-1 rounded hover:bg-gray-400">Cancel</button>
      </div>
    </div>
  );
}

'use client';
import React, { useState } from 'react';
export interface CarryOverDialogProps { goal: { id: string; title: string; targetValue?: number; currentValue?: number }; open: boolean; onConfirm: (newDeadline: string) => void; onCancel: () => void; }
export default function CarryOverDialog({ goal, open, onConfirm, onCancel }: CarryOverDialogProps) {
  const [deadline, setDeadline] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full">
        <h2 className="text-xl font-bold mb-4">Carry Over Goal</h2>
        <p className="mb-4">Goal: <strong>{goal.title}</strong></p>
        <p className="mb-4 text-sm text-gray-600">Progress: {goal.currentValue || 0} / {goal.targetValue || 'N/A'}</p>
        <label className="block mb-4"><span className="block mb-1 text-sm font-semibold">New Deadline</span><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full border p-2 rounded" /></label>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 border rounded hover:bg-gray-100">Cancel</button>
          <button onClick={() => onConfirm(deadline)} disabled={!deadline} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Confirm</button>
        </div>
      </div>
    </div>
  );
}

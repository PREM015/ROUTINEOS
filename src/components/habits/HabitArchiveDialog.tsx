'use client';
import React, { useState } from 'react';
export interface HabitArchiveDialogProps { habit: { id: string; name: string }; open: boolean; onConfirm: (reason?: string) => void; onCancel: () => void; }
export default function HabitArchiveDialog({ habit, open, onConfirm, onCancel }: HabitArchiveDialogProps) {
  const [reason, setReason] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-xl font-bold mb-2 text-gray-900">Archive Habit</h2>
        <p className="text-gray-600 mb-4">Are you sure you want to archive <strong>{habit.name}</strong>?</p>
        <label className="block mb-6"><span className="block text-sm font-medium text-gray-700 mb-2">Reason (Optional)</span><textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full border rounded-md p-3 text-sm focus:ring-blue-500 focus:border-blue-500" rows={3}/></label>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition">Cancel</button>
          <button onClick={() => onConfirm(reason)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition">Archive Habit</button>
        </div>
      </div>
    </div>
  );
}

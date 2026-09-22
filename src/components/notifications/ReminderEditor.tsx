'use client';
import { useState } from 'react';

export interface ReminderEditorProps { reminder: { type: string; time: string; enabled: boolean }; onSave: (data: any) => void; onDelete: () => void; }

export default function ReminderEditor({ reminder, onSave, onDelete }: ReminderEditorProps) {
  const [time, setTime] = useState(reminder.time);
  const [enabled, setEnabled] = useState(reminder.enabled);
  return (
    <div className="p-4 border rounded shadow-sm bg-white max-w-sm mx-auto">
      <h3 className="font-semibold text-lg mb-4 capitalize">{reminder.type} Reminder</h3>
      <div className="flex items-center justify-between mb-4">
        <input type="time" value={time} onChange={e => setTime(e.target.value)} className="border p-2 rounded"/>
        <label className="flex items-center gap-2"><span>Enabled</span><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /></label>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ ...reminder, time, enabled })} className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700">Save</button>
        <button onClick={onDelete} className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700">Delete</button>
      </div>
    </div>
  );
}

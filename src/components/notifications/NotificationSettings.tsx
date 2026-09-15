'use client';
import React, { useState } from 'react';

export interface NotificationSettingsProps {
  settings: {
    habitsEnabled: boolean;
    routineEnabled: boolean;
    goalsEnabled: boolean;
    weeklyReview: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
  onSave: (settings: any) => void;
}

export default function NotificationSettings({ settings, onSave }: NotificationSettingsProps) {
  const [form, setForm] = useState(settings);

  const toggle = (key: keyof typeof form) => {
    setForm(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-4 bg-white rounded shadow-md max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Notification Settings</h2>
      <div className="space-y-4">
        {['habitsEnabled', 'routineEnabled', 'goalsEnabled', 'weeklyReview', 'quietHoursEnabled'].map(key => (
          <div key={key} className="flex justify-between items-center">
            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
            <input type="checkbox" checked={form[key as keyof typeof form] as boolean} onChange={() => toggle(key as keyof typeof form)} className="toggle-checkbox" />
          </div>
        ))}
        {form.quietHoursEnabled && (
          <div className="space-y-2 mt-4 p-4 border rounded">
            <h3 className="font-semibold">Quiet Hours</h3>
            <div className="flex gap-4">
              <input type="time" value={form.quietHoursStart} onChange={e => setForm({...form, quietHoursStart: e.target.value})} className="border p-2 rounded w-full" />
              <input type="time" value={form.quietHoursEnd} onChange={e => setForm({...form, quietHoursEnd: e.target.value})} className="border p-2 rounded w-full" />
            </div>
          </div>
        )}
        <button onClick={() => onSave(form)} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Save Settings</button>
      </div>
    </div>
  );
}

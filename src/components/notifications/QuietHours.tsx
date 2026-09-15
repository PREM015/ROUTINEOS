'use client';
import React, { useState } from 'react';

export interface QuietHoursProps { enabled: boolean; start: string; end: string; onChange: (data: { enabled: boolean; start: string; end: string }) => void; }

export default function QuietHours({ enabled: initEnabled, start: initStart, end: initEnd, onChange }: QuietHoursProps) {
  const [enabled, setEnabled] = useState(initEnabled);
  const [start, setStart] = useState(initStart);
  const [end, setEnd] = useState(initEnd);
  const handleUpdate = () => onChange({ enabled, start, end });
  return (
    <div className="p-4 bg-gray-50 rounded border">
      <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">Quiet Hours</h3><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); handleUpdate(); }} /></div>
      {enabled && (
        <div className="flex gap-4">
          <div className="flex-1"><label className="block text-sm text-gray-600 mb-1">Start</label><input type="time" value={start} onChange={e => { setStart(e.target.value); handleUpdate(); }} className="w-full border p-2 rounded"/></div>
          <div className="flex-1"><label className="block text-sm text-gray-600 mb-1">End</label><input type="time" value={end} onChange={e => { setEnd(e.target.value); handleUpdate(); }} className="w-full border p-2 rounded"/></div>
        </div>
      )}
    </div>
  );
}

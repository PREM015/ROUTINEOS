'use client';
import React, { useState } from 'react';
export interface RoutineExceptionEditorProps { exceptions: Array<{ date: string; templateId: string; reason?: string }>; templates: Array<{ id: string; name: string }>; onAdd: (date: string, templateId: string, reason?: string) => void; onDelete: (date: string) => void; }
export default function RoutineExceptionEditor({ exceptions, templates, onAdd, onDelete }: RoutineExceptionEditorProps) {
  const [date, setDate] = useState(''); const [templateId, setTemplateId] = useState(templates[0]?.id || ''); const [reason, setReason] = useState('');
  return (
    <div className="p-4 bg-white rounded shadow-sm border max-w-xl mx-auto">
      <h3 className="font-bold text-lg mb-4">Routine Exceptions</h3>
      <div className="flex gap-2 mb-6 items-end">
        <div><label className="block text-xs font-semibold mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="border p-2 rounded" /></div>
        <div><label className="block text-xs font-semibold mb-1">Template</label><select value={templateId} onChange={e => setTemplateId(e.target.value)} className="border p-2 rounded">{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="flex-1"><label className="block text-xs font-semibold mb-1">Reason</label><input type="text" value={reason} onChange={e => setReason(e.target.value)} className="w-full border p-2 rounded" /></div>
        <button onClick={() => { if(date && templateId) { onAdd(date, templateId, reason); setDate(''); setReason(''); } }} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Add</button>
      </div>
      <ul className="space-y-2">
        {exceptions.map(ex => (
          <li key={ex.date} className="flex justify-between items-center p-3 bg-gray-50 border rounded text-sm">
            <div><span className="font-bold mr-3">{ex.date}</span><span className="text-blue-600 mr-3">{templates.find(t => t.id === ex.templateId)?.name || ex.templateId}</span>{ex.reason && <span className="text-gray-500 italic">({ex.reason})</span>}</div>
            <button onClick={() => onDelete(ex.date)} className="text-red-500 hover:underline">Remove</button>
          </li>
        ))}
      </ul>
      {exceptions.length === 0 && <p className="text-gray-500 text-sm text-center">No exceptions added.</p>}
    </div>
  );
}

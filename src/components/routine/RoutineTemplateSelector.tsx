'use client';
import React from 'react';
export interface RoutineTemplateSelectorProps { templates: Array<{ id: string; name: string; dayType: string }>; selectedId: string | null; onSelect: (id: string) => void; }
export default function RoutineTemplateSelector({ templates, selectedId, onSelect }: RoutineTemplateSelectorProps) {
  return (
    <div className="flex overflow-x-auto border-b bg-white">
      {templates.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} className={`px-4 py-3 whitespace-nowrap font-medium text-sm transition-colors border-b-2 ${selectedId === t.id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
          {t.name} <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 rounded-full text-gray-700">{t.dayType}</span>
        </button>
      ))}
    </div>
  );
}

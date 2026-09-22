'use client';
import { useState } from 'react';
export interface RoutineEditorProps { template: { id: string; name: string; dayType: string; blocks: Array<{ id: string; name: string; startTime: string; endTime: string; icon?: string; color?: string }> }; onSave: (data: any) => void; onAddBlock: () => void; onDeleteBlock: (id: string) => void; }
export default function RoutineEditor({ template, onSave, onAddBlock, onDeleteBlock }: RoutineEditorProps) {
  const [name, setName] = useState(template.name);
  const [dayType, setDayType] = useState(template.dayType);
  return (
    <div className="p-4 bg-white rounded shadow max-w-2xl mx-auto">
      <div className="flex gap-4 mb-6">
        <div className="flex-1"><label className="block text-sm font-semibold mb-1">Template Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border p-2 rounded" /></div>
        <div className="flex-1"><label className="block text-sm font-semibold mb-1">Day Type</label><select value={dayType} onChange={e => setDayType(e.target.value)} className="w-full border p-2 rounded"><option value="WORKDAY">Workday</option><option value="WEEKEND">Weekend</option><option value="HOLIDAY">Holiday</option></select></div>
      </div>
      <h3 className="text-lg font-bold mb-4">Routine Blocks</h3>
      <div className="space-y-3 mb-4">
        {template.blocks.map(block => (
          <div key={block.id} className="flex items-center justify-between p-3 border rounded bg-gray-50">
            <div><div className="font-semibold">{block.name}</div><div className="text-sm text-gray-500">{block.startTime} - {block.endTime}</div></div>
            <button onClick={() => onDeleteBlock(block.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center">
        <button onClick={onAddBlock} className="px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50">+ Add Block</button>
        <button onClick={() => onSave({ ...template, name, dayType })} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Routine</button>
      </div>
    </div>
  );
}

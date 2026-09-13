'use client';

import { useState } from 'react';
import { CalendarRange, Plus } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import RoutineList from '@/components/routine/RoutineList';
import AddRoutineBlockModal from '@/components/routine/AddRoutineBlockModal';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui';

const tabs = ['WEEKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY'] as const;

export default function RoutinePage() {
  const { selectedRoutineTab, setSelectedRoutineTab, routineBlocks } = useApp();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Routine</h1>
          <p className="mt-1 text-sm text-zinc-500">Shape your weekly rhythm and keep your day structured.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} /> Add block
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedRoutineTab(tab)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              selectedRoutineTab === tab
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <CalendarRange size={16} className="text-emerald-400" />
            {routineBlocks.filter((block) => block.dayType === selectedRoutineTab).length} blocks scheduled
          </div>
        </div>
        <RoutineList />
      </div>

      <AddRoutineBlockModal open={modalOpen} onClose={() => setModalOpen(false)} defaultDayType={selectedRoutineTab} />
    </DashboardLayout>
  );
}

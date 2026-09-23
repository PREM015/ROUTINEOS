'use client';

import { useState } from 'react';
import { CalendarRange, Plus } from 'lucide-react';
import RoutineList from '@/components/routine/RoutineList';
import AddRoutineBlockModal from '@/components/routine/AddRoutineBlockModal';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui';

const tabs = ['WEEKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY'] as const;

export default function RoutinePage() {
  const { selectedRoutineTab, setSelectedRoutineTab, routineBlocks } = useApp();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Routine</h1>
          <p className="mt-1 text-sm text-muted-foreground">Shape your weekly rhythm and keep your day structured.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} /> Add block
        </Button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Routine day type">
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={selectedRoutineTab === tab}
            onClick={() => setSelectedRoutineTab(tab)}
            className={`rounded-xl border px-3 py-2 text-sm whitespace-nowrap shrink-0 transition ${
              selectedRoutineTab === tab
                ? 'border-primary/40 bg-primary/10 text-primary shadow-soft'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="glass-panel glow-primary rounded-2xl p-5 shadow-soft">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange size={16} className="text-primary" />
            {routineBlocks.filter((block) => block.dayType === selectedRoutineTab).length} blocks scheduled
          </div>
        </div>
        <RoutineList />
      </div>

      <AddRoutineBlockModal open={modalOpen} onClose={() => setModalOpen(false)} defaultDayType={selectedRoutineTab} />
    </div>
  );
}

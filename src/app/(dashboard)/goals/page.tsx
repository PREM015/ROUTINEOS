'use client';

import { useState } from 'react';
import { Target, Plus } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GoalsWidget from '@/components/dashboard/GoalsWidget';
import AddGoalModal from '@/components/goals/AddGoalModal';
import { Button } from '@/components/ui';

export default function GoalsPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Goals</h1>
          <p className="mt-1 text-sm text-zinc-500">Track what matters this week, month, and year.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} /> Add goal
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="mb-4 flex items-center gap-2 text-emerald-400">
            <Target size={16} />
            <h2 className="text-base font-semibold text-zinc-100">Weekly</h2>
          </div>
          <GoalsWidget type="WEEKLY" />
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="mb-4 flex items-center gap-2 text-teal-400">
            <Target size={16} />
            <h2 className="text-base font-semibold text-zinc-100">Monthly</h2>
          </div>
          <GoalsWidget type="MONTHLY" />
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="mb-4 flex items-center gap-2 text-amber-400">
            <Target size={16} />
            <h2 className="text-base font-semibold text-zinc-100">Yearly</h2>
          </div>
          <GoalsWidget type="YEARLY" />
        </div>
      </div>

      <AddGoalModal open={modalOpen} onClose={() => setModalOpen(false)} defaultType="WEEKLY" />
    </DashboardLayout>
  );
}

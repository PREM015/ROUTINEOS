'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AddHabitModal from '@/components/habits/AddHabitModal';
import { useApp, Habit } from '@/context/AppContext';
import { getFrequencyLabel } from '@/lib/scheduling';
import { Plus, Pencil, Archive, Play, Pause, Target } from 'lucide-react';
import { Button, Badge, EmptyState, Card } from '@/components/ui';

type TabType = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
type TierType = 'NON_NEGOTIABLE' | 'GROWTH' | 'BONUS';

const TIER_LABELS: Record<TierType, string> = {
  NON_NEGOTIABLE: 'Non-Negotiables',
  GROWTH: 'Growth Habits',
  BONUS: 'Bonus Habits',
};
const TIER_COLORS = {
  NON_NEGOTIABLE: 'emerald' as const,
  GROWTH: 'teal' as const,
  BONUS: 'amber' as const,
};

export default function HabitsPage() {
  const { habits, updateHabit, archiveHabit } = useApp();
  const [tab, setTab] = useState<TabType>('ACTIVE');
  const [modalOpen, setModalOpen] = useState(false);

  const statusMap: Record<TabType, string[]> = {
    ACTIVE: ['ACTIVE'],
    PAUSED: ['PAUSED'],
    ARCHIVED: ['ARCHIVED', 'COMPLETED'],
  };

  const filteredHabits = habits.filter(h => statusMap[tab].includes(h.status));

  const renderTierGroup = (tier: TierType) => {
    const tierHabits = filteredHabits.filter(h => h.tier === tier);
    if (tierHabits.length === 0) return null;
    return (
      <div key={tier} className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest font-bold text-zinc-500">{TIER_LABELS[tier]}</h3>
        <div className="space-y-2">
          {tierHabits.map(habit => (
            <motion.div
              key={habit.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl group hover:border-zinc-700 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-200">{habit.name}</span>
                  <Badge variant={TIER_COLORS[tier]}>{TIER_LABELS[tier].split(' ')[0]}</Badge>
                  {habit.category && <Badge variant="zinc">{habit.category}</Badge>}
                </div>
                <p className="text-xs text-zinc-500 mt-1">{getFrequencyLabel(habit)}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {tab === 'ACTIVE' && (
                  <button
                    onClick={() => updateHabit(habit.id, { status: 'PAUSED' })}
                    className="p-2 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition"
                    title="Pause habit"
                  >
                    <Pause size={15} />
                  </button>
                )}
                {tab === 'PAUSED' && (
                  <button
                    onClick={() => updateHabit(habit.id, { status: 'ACTIVE' })}
                    className="p-2 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition"
                    title="Resume habit"
                  >
                    <Play size={15} />
                  </button>
                )}
                {tab !== 'ARCHIVED' && (
                  <button
                    onClick={() => archiveHabit(habit.id)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    title="Archive habit"
                  >
                    <Archive size={15} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">My Habits</h1>
          <p className="text-sm text-zinc-500 mt-1">{habits.filter(h => h.status === 'ACTIVE').length} active habits</p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} /> Add Habit
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-1 w-fit">
        {(['ACTIVE', 'PAUSED', 'ARCHIVED'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-8"
        >
          {filteredHabits.length === 0 ? (
            <EmptyState
              icon={<Target size={28} />}
              title={tab === 'ACTIVE' ? 'No active habits' : tab === 'PAUSED' ? 'No paused habits' : 'No archived habits'}
              description={tab === 'ACTIVE' ? 'Add your first habit to start tracking your consistency.' : ''}
              action={tab === 'ACTIVE' ? (
                <Button onClick={() => setModalOpen(true)} variant="primary" size="sm">
                  <Plus size={14} /> Add Habit
                </Button>
              ) : undefined}
            />
          ) : (
            <>
              {(['NON_NEGOTIABLE', 'GROWTH', 'BONUS'] as TierType[]).map(tier => renderTierGroup(tier))}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <AddHabitModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  );
}

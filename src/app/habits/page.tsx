'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AddHabitModal from '@/components/habits/AddHabitModal';
import EditHabitModal from '@/components/habits/EditHabitModal';
import { useApp, type Habit } from '@/context/AppContext';
import { getFrequencyLabel } from '@/lib/scheduling';
import { getTodayString } from '@/lib/dates';
import { Plus, Archive, Play, Pause, Target, Pencil, Trash2, CheckCircle2, Circle, Flame } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';

type TabType = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
type TierType = 'GROWTH' | 'BONUS' | 'LIFESTYLE';

const TIER_LABELS: Record<TierType, string> = {
  GROWTH: 'Core Habits',
  BONUS: 'Growth Habits',
  LIFESTYLE: 'Lifestyle Habits',
};
const OTHER_TIERS = ['FLEXIBLE', 'OPTIONAL', 'EXPERIMENTAL', 'ALTERNATIVE', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED'];

export default function HabitsPage() {
  const {
    habits, updateHabit, archiveHabit, deleteHabit,
    getLogForDate, logHabit, selectedDate,
  } = useApp();
  const [tab, setTab] = useState<TabType>('ACTIVE');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = selectedDate || getTodayString();

  const statusMap: Record<TabType, string[]> = {
    ACTIVE: ['ACTIVE'],
    PAUSED: ['PAUSED'],
    ARCHIVED: ['ARCHIVED', 'COMPLETED'],
  };

  const filteredHabits = useMemo(
    () => habits.filter(h => statusMap[tab].includes(h.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, tab]
  );

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const toggleToday = (habit: Habit) => {
    const log = getLogForDate(habit.id, today);
    const next = log?.status === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
    return runAction(habit.id, () => logHabit(habit.id, today, next));
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    await runAction(id, () => deleteHabit(id));
  };

  const renderHabitRow = (habit: Habit) => {
    const log = getLogForDate(habit.id, today);
    const done = log?.status === 'COMPLETED';
    const busy = busyId === habit.id;
    return (
      <motion.div
        key={habit.id}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl group hover:border-foreground/20 transition"
      >
        {tab === 'ACTIVE' && (
          <button
            onClick={() => toggleToday(habit)}
            disabled={busy}
            aria-label={done ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
            className={`shrink-0 transition-colors disabled:opacity-50 ${done ? 'text-emerald-500' : 'text-muted-foreground hover:text-emerald-400'}`}
          >
            {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold truncate ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {habit.name}
            </span>
            {(habit.streakCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                <Flame size={12} /> {habit.streakCount}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {getFrequencyLabel(habit)}
            {habit.targetCount ? ` · target ${habit.targetCount}` : ''}
            {habit.reminderTime ? ` · ⏰ ${habit.reminderTime}` : ''}
          </p>
          {habit.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{habit.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {tab === 'ACTIVE' && (
            <button
              onClick={() => runAction(habit.id, () => updateHabit(habit.id, { status: 'PAUSED' }))}
              disabled={busy}
              className="p-2 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
              title="Pause habit"
              aria-label={`Pause ${habit.name}`}
            >
              <Pause size={15} />
            </button>
          )}
          {tab === 'PAUSED' && (
            <button
              onClick={() => runAction(habit.id, () => updateHabit(habit.id, { status: 'ACTIVE' }))}
              disabled={busy}
              className="p-2 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-50"
              title="Resume habit"
              aria-label={`Resume ${habit.name}`}
            >
              <Play size={15} />
            </button>
          )}
          <button
            onClick={() => setEditing(habit)}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
            title="Edit habit"
            aria-label={`Edit ${habit.name}`}
          >
            <Pencil size={15} />
          </button>
          {tab !== 'ARCHIVED' ? (
            <button
              onClick={() => runAction(habit.id, () => archiveHabit(habit.id))}
              disabled={busy}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
              title="Archive habit"
              aria-label={`Archive ${habit.name}`}
            >
              <Archive size={15} />
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(habit)}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
              title="Delete habit permanently"
              aria-label={`Delete ${habit.name}`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  const renderTierGroup = (tier: TierType) => {
    const tierHabits = filteredHabits.filter(h => h.tier === tier);
    if (tierHabits.length === 0) return null;
    const sorted = [...tierHabits].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div key={tier} className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">{TIER_LABELS[tier]}</h3>
        <div className="space-y-2">
          {sorted.map(renderHabitRow)}
        </div>
      </div>
    );
  };

  const otherHabits = filteredHabits.filter(h => OTHER_TIERS.includes(h.tier)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Habits</h1>
          <p className="text-sm text-muted-foreground mt-1">{habits.filter(h => h.status === 'ACTIVE').length} active habits</p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} /> Add Habit
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          {actionError}
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-card border border-border rounded-xl p-1 w-fit" role="tablist" aria-label="Habit status filter">
        {(['ACTIVE', 'PAUSED', 'ARCHIVED'] as TabType[]).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
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
                  <Plus size={14} /> Add Your First Habit
                </Button>
              ) : undefined}
            />
          ) : (
            <>
              {(['GROWTH', 'BONUS', 'LIFESTYLE'] as TierType[]).map(tier => renderTierGroup(tier))}
              {otherHabits.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">More Habits</h3>
                  <div className="space-y-2">
                    {otherHabits.map(renderHabitRow)}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <AddHabitModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <EditHabitModal habit={editing} onClose={() => setEditing(null)} />

      {/* Delete confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              className="w-full max-w-sm bg-card border border-border rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-label="Delete habit"
            >
              <h2 className="text-lg font-bold text-foreground">Delete habit?</h2>
              <p className="text-sm text-muted-foreground mt-2">
                &ldquo;{confirmDelete.name}&rdquo; and its history will be permanently removed. This cannot be undone.
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={handleDelete}>
                  Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

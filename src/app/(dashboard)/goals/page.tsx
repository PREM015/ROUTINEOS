'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Target, Plus, Pencil, Trash2, CheckCircle2, Circle } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AddGoalModal from '@/components/goals/AddGoalModal';
import EditGoalModal from '@/components/goals/EditGoalModal';
import { useApp, type Goal } from '@/context/AppContext';
import { getTodayString } from '@/lib/dates';
import { Button, Badge, EmptyState } from '@/components/ui';

type TabType = 'DAILY' | 'LONG_TERM' | 'COMPLETED';

const PRIORITY_COLORS: Record<Goal['priority'], 'success' | 'warning' | 'default' | 'primary'> = {
  CRITICAL: 'success',
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'default',
  PERSONAL: 'primary',
  ACADEMIC: 'primary',
  PROFESSIONAL: 'primary',
  NON_PROFIT: 'default',
};

function GoalCard({
  goal,
  onEdit,
  onDelete,
  checkinState,
  onCheckin,
  busy,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  checkinState: Record<string, boolean>;
  onCheckin: (goal: Goal, completed: boolean) => void;
  busy: boolean;
}) {
  const { updateGoalProgress } = useApp();
  const [sliderValue, setSliderValue] = useState(goal.currentValue);
  const [sliderError, setSliderError] = useState<string | null>(null);

  const pct = goal.targetValue > 0 ? Math.min(100, (goal.currentValue / goal.targetValue) * 100) : 0;
  const isDaily = goal.type === 'DAILY';
  const checkedToday = isDaily && (checkinState[goal.id] ?? goal.currentValue >= 1);

  const commitSlider = async (value: number) => {
    setSliderError(null);
    try {
      await updateGoalProgress(goal.id, value);
    } catch (err) {
      setSliderValue(goal.currentValue);
      setSliderError(err instanceof Error ? err.message : 'Failed to update progress');
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-card border border-border rounded-xl p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {isDaily && (
            <button
              onClick={() => onCheckin(goal, !checkedToday)}
              disabled={busy}
              aria-label={checkedToday ? `Uncheck ${goal.title} for today` : `Check off ${goal.title} for today`}
              className={`mt-0.5 shrink-0 transition disabled:opacity-50 ${checkedToday ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400'}`}
            >
              {checkedToday ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold truncate ${checkedToday ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {goal.title}
              </span>
              <Badge variant={PRIORITY_COLORS[goal.priority]}>{goal.priority}</Badge>
              {isDaily && <Badge variant="primary">Daily</Badge>}
            </div>
            {goal.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>
            )}
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              {goal.startDate} → {goal.endDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
            title="Edit goal"
            aria-label={`Edit ${goal.title}`}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
            title="Delete goal"
            aria-label={`Delete ${goal.title}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {!isDaily && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={goal.targetValue}
              step={goal.targetValue > 20 ? 1 : 0.5}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              onMouseUp={() => commitSlider(sliderValue)}
              onTouchEnd={() => commitSlider(sliderValue)}
              onKeyUp={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') commitSlider(sliderValue); }}
              aria-label={`${goal.title} progress`}
              className="flex-1 accent-emerald-500"
            />
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {goal.currentValue}/{goal.targetValue} {goal.unit || ''}
            </span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5 }}
              className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground/60">
            <span>{Math.round(pct)}% complete</span>
            {pct >= 100 && <span className="text-emerald-500 font-bold">✓ Done!</span>}
          </div>
          {sliderError && <p role="alert" className="text-xs text-destructive">{sliderError}</p>}
        </div>
      )}
    </motion.div>
  );
}

export default function GoalsPage() {
  const { goals, deleteGoal, updateGoal } = useApp();
  const [tab, setTab] = useState<TabType>('DAILY');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<Record<string, boolean>>({});
  const today = getTodayString();

  const { dailyGoals, longTermGoals, completedGoals } = useMemo(() => {
    const done = (g: Goal) => g.status === 'COMPLETED' || g.status === 'CANCELLED';
    return {
      dailyGoals: goals.filter((g) => g.type === 'DAILY' && !done(g)),
      longTermGoals: goals.filter((g) => g.type !== 'DAILY' && !done(g)),
      completedGoals: goals.filter(done),
    };
  }, [goals]);

  const visible = tab === 'DAILY' ? dailyGoals : tab === 'LONG_TERM' ? longTermGoals : completedGoals;

  const handleCheckin = async (goal: Goal, completed: boolean) => {
    setBusyId(goal.id);
    setError(null);
    setCheckins((prev) => ({ ...prev, [goal.id]: completed }));
    try {
      const res = await fetch(`/api/goals/${goal.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, completed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save check-in');
      // Sync context state so widgets agree.
      await updateGoal(goal.id, {
        currentValue: completed ? 1 : 0,
        status: completed ? 'COMPLETED' : 'ACTIVE',
      });
    } catch (err) {
      setCheckins((prev) => ({ ...prev, [goal.id]: !completed }));
      setError(err instanceof Error ? err.message : 'Failed to save check-in');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    setError(null);
    try {
      await deleteGoal(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete goal');
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Goals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dailyGoals.length} daily · {longTermGoals.length} long-term · {completedGoals.length} completed
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} /> Add goal
        </Button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-1 mb-6 bg-card border border-border rounded-xl p-1 w-fit" role="tablist" aria-label="Goal filter">
        {([
          { value: 'DAILY', label: 'Daily' },
          { value: 'LONG_TERM', label: 'Long-term' },
          { value: 'COMPLETED', label: 'Completed' },
        ] as Array<{ value: TabType; label: string }>).map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title={tab === 'DAILY' ? 'No daily goals' : tab === 'LONG_TERM' ? 'No long-term goals' : 'Nothing completed yet'}
          description={
            tab === 'DAILY'
              ? 'Daily goals repeat every day with a simple check-off.'
              : tab === 'LONG_TERM'
                ? 'Create a goal with a target and deadline.'
                : 'Completed goals will appear here.'
          }
          action={
            tab !== 'COMPLETED' ? (
              <Button onClick={() => setModalOpen(true)} variant="primary" size="sm">
                <Plus size={14} /> Add Goal
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AnimatePresence>
            {visible.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={() => setEditing(goal)}
                onDelete={() => setConfirmDelete(goal)}
                checkinState={checkins}
                onCheckin={handleCheckin}
                busy={busyId === goal.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AddGoalModal open={modalOpen} onClose={() => setModalOpen(false)} defaultType={tab === 'DAILY' ? 'DAILY' : 'WEEKLY'} />
      <EditGoalModal goal={editing} onClose={() => setEditing(null)} />

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
              aria-label="Delete goal"
            >
              <h2 className="text-lg font-bold text-foreground">Delete goal?</h2>
              <p className="text-sm text-muted-foreground mt-2">
                &ldquo;{confirmDelete.title}&rdquo; and its progress history will be permanently removed.
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={handleDelete}>Delete</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import HabitScheduleEditor from '@/components/habits/HabitScheduleEditor';
import HabitHistory from '@/components/habits/HabitHistory';
import HabitFrictionCard from '@/components/habits/HabitFrictionCard';
import HabitNotes from '@/components/habits/HabitNotes';
import { HabitArchiveDialog } from '@/components/habits/HabitArchiveDialog';
import { HabitWithRelations } from '@/types/habit';
import {
  ChevronLeft,
  Edit2,
  Trash2,
  Archive,
  PauseCircle,
  SkipForward,
  CheckCircle2,
  Save,
  X,
} from 'lucide-react';

// ── Tier badge colours ────────────────────────────────────────────────────────
const TIER_STYLES: Record<string, string> = {
  NON_NEGOTIABLE: 'bg-destructive/10 text-destructive border-destructive/30',
  GROWTH: 'bg-primary/10 text-primary border-primary/30',
  BONUS: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

const TIER_LABELS: Record<string, string> = {
  NON_NEGOTIABLE: 'Non-Negotiable',
  GROWTH: 'Growth',
  BONUS: 'Bonus',
};

// ── Status badge colours ──────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  PAUSED: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  ARCHIVED: 'bg-muted/40 text-muted-foreground border-border',
};

interface HabitDetailClientProps {
  habit: HabitWithRelations;
}

type Tab = 'overview' | 'history' | 'schedule' | 'notes';

export default function HabitDetailClient({ habit: initialHabit }: HabitDetailClientProps) {
  const router = useRouter();
  const [habit, setHabit] = useState<HabitWithRelations>(initialHabit);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(habit.name);
  const [editDescription, setEditDescription] = useState(habit.description ?? '');
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Inline save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription }),
      });
      if (!res.ok) throw new Error('Failed to update habit');
      const json = await res.json();
      setHabit((prev) => ({ ...prev, name: editName, description: editDescription, ...json.data }));
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(habit.name);
    setEditDescription(habit.description ?? '');
    setIsEditing(false);
  };

  // ── Quick actions ───────────────────────────────────────────────────────────
  const apiAction = async (path: string, method = 'POST', body?: object) => {
    setActionLoading(path);
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habit.id}/${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Action failed (${res.status})`);
      }
      const json = await res.json();
      if (json.data) setHabit((prev) => ({ ...prev, ...json.data }));
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkipToday = () =>
    apiAction('skip', 'POST', { date: new Date().toISOString().split('T')[0] });
  const handlePause = () => apiAction('pause', 'POST', {});
  const handleResume = () => apiAction('resume', 'POST', {});
  const handleLogToday = () =>
    apiAction('log', 'POST', {
      date: new Date().toISOString().split('T')[0],
      status: 'COMPLETED',
    });

  const handleDelete = async () => {
    if (!confirm('Permanently delete this habit? This cannot be undone.')) return;
    setActionLoading('delete');
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habit.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete habit');
      router.push('/habits');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setActionLoading(null);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'history', label: 'History' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'notes', label: 'Notes' },
  ];

  // Friction: show only when completion rate is below 60%
  const completionRate =
    habit.logs.length > 0
      ? Math.round(
          (habit.logs.filter((l) => l.status === 'COMPLETED').length / habit.logs.length) * 100
        )
      : null;
  const showFriction = completionRate !== null && completionRate < 60;

  return (
    <DashboardLayout>
      {/* ── Header ── */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          Habits
        </button>

        {/* Title row */}
        {isEditing ? (
          <div className="space-y-3">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-xl bg-muted border border-border px-4 py-2.5 text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Habit name"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="w-full rounded-xl bg-muted border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-foreground">{habit.name}</h1>
                {habit.icon && <span className="text-2xl">{habit.icon}</span>}
              </div>
              {habit.description && (
                <p className="text-sm text-muted-foreground max-w-xl">{habit.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    TIER_STYLES[habit.tier] ?? 'bg-muted text-foreground border-border'
                  }`}
                >
                  {TIER_LABELS[habit.tier] ?? habit.tier}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[habit.status] ?? 'bg-muted text-foreground border-border'
                  }`}
                >
                  {habit.status}
                </span>
                {habit.category && (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {habit.category.name}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsEditing(true)}
                title="Edit"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => setShowArchiveDialog(true)}
                title="Archive"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-amber-400 transition-colors"
              >
                <Archive size={16} />
              </button>
              <button
                onClick={handleDelete}
                title="Delete"
                disabled={actionLoading === 'delete'}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive hover:text-destructive">✕</button>
        </div>
      )}

      {/* ── Friction card ── */}
      {showFriction && activeTab === 'overview' && (
        <div className="mb-4">
          <HabitFrictionCard
            habitName={habit.name}
            reliability={completionRate!}
            suggestion="Try linking this habit to an existing one or reducing the required count."
          />
        </div>
      )}

      {/* ── Quick actions ── */}
      {habit.status === 'ACTIVE' && activeTab === 'overview' && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={handleLogToday}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={15} />
            {actionLoading === 'log' ? 'Logging…' : 'Log Today'}
          </button>
          <button
            onClick={handleSkipToday}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <SkipForward size={15} />
            {actionLoading === 'skip' ? 'Skipping…' : 'Skip Today'}
          </button>
          <button
            onClick={handlePause}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
          >
            <PauseCircle size={15} />
            {actionLoading === 'pause' ? 'Pausing…' : 'Pause'}
          </button>
        </div>
      )}

      {habit.status === 'PAUSED' && activeTab === 'overview' && (
        <div className="mb-6">
          <button
            onClick={handleResume}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={15} />
            {actionLoading === 'resume' ? 'Resuming…' : 'Resume Habit'}
          </button>
        </div>
      )}

      {/* ── Stats overview row ── */}
      {activeTab === 'overview' && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total logs', value: habit.logs.length },
            {
              label: 'Completion',
              value: completionRate !== null ? `${completionRate}%` : '—',
            },
            {
              label: 'Completed',
              value: habit.logs.filter((l) => l.status === 'COMPLETED').length,
            },
            {
              label: 'Missed',
              value: habit.logs.filter((l) => l.status === 'MISSED').length,
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-card p-4 text-center"
            >
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="mb-6 flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Last 30 days
          </h2>
          <HabitHistory logs={habit.logs} />
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Frequency &amp; Schedule
          </h2>
          <HabitScheduleEditor
            initialFrequencyType={habit.frequencyType}
            initialConfig={habit.frequencyValue ? JSON.parse(habit.frequencyValue) : null}
          />
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <HabitNotes habitId={habit.id} />
        </div>
      )}

      {/* ── Archive dialog ── */}
      {showArchiveDialog && (
        <HabitArchiveDialog
          habitId={habit.id}
          habitName={habit.name}
          onClose={() => setShowArchiveDialog(false)}
          onArchived={() => router.push('/habits')}
        />
      )}
    </DashboardLayout>
  );
}

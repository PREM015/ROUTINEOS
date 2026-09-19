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
  NON_NEGOTIABLE: 'bg-red-500/20 text-red-300 border-red-800',
  GROWTH: 'bg-indigo-500/20 text-indigo-300 border-indigo-800',
  BONUS: 'bg-amber-500/20 text-amber-300 border-amber-800',
};

const TIER_LABELS: Record<string, string> = {
  NON_NEGOTIABLE: 'Non-Negotiable',
  GROWTH: 'Growth',
  BONUS: 'Bonus',
};

// ── Status badge colours ──────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-300 border-emerald-800',
  PAUSED: 'bg-yellow-500/20 text-yellow-300 border-yellow-800',
  ARCHIVED: 'bg-zinc-500/20 text-zinc-400 border-zinc-700',
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
          className="mb-4 flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
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
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-xl font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Habit name"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
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
                <h1 className="text-2xl font-bold text-zinc-100">{habit.name}</h1>
                {habit.icon && <span className="text-2xl">{habit.icon}</span>}
              </div>
              {habit.description && (
                <p className="text-sm text-zinc-400 max-w-xl">{habit.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    TIER_STYLES[habit.tier] ?? 'bg-zinc-700 text-zinc-300 border-zinc-600'
                  }`}
                >
                  {TIER_LABELS[habit.tier] ?? habit.tier}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[habit.status] ?? 'bg-zinc-700 text-zinc-300 border-zinc-600'
                  }`}
                >
                  {habit.status}
                </span>
                {habit.category && (
                  <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
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
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => setShowArchiveDialog(true)}
                title="Archive"
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-amber-400 transition-colors"
              >
                <Archive size={16} />
              </button>
              <button
                onClick={handleDelete}
                title="Delete"
                disabled={actionLoading === 'delete'}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
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
            className="flex items-center gap-1.5 rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={15} />
            {actionLoading === 'log' ? 'Logging…' : 'Log Today'}
          </button>
          <button
            onClick={handleSkipToday}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <SkipForward size={15} />
            {actionLoading === 'skip' ? 'Skipping…' : 'Skip Today'}
          </button>
          <button
            onClick={handlePause}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-xl border border-yellow-800 bg-yellow-950/30 px-4 py-2 text-sm font-medium text-yellow-300 hover:bg-yellow-900/40 transition-colors disabled:opacity-50"
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
            className="flex items-center gap-1.5 rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
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
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-center"
            >
              <p className="text-xs text-zinc-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="mb-6 flex border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Last 30 days
          </h2>
          <HabitHistory logs={habit.logs} />
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Frequency &amp; Schedule
          </h2>
          <HabitScheduleEditor
            initialFrequencyType={habit.frequencyType}
            initialConfig={habit.frequencyValue ? JSON.parse(habit.frequencyValue) : null}
          />
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
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

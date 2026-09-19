'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, subMonths } from 'date-fns';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { PreviousMonthSummary } from '@/components/monthly-reset/PreviousMonthSummary';
import { HabitReview } from '@/components/monthly-reset/HabitReview';
import { GoalReview } from '@/components/monthly-reset/GoalReview';
import { NextMonthPlan } from '@/components/monthly-reset/NextMonthPlan';
import { ResetConfirmation } from '@/components/monthly-reset/ResetConfirmation';
import { ChevronLeft, Loader2 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 'summary' | 'habits' | 'goals' | 'plan' | 'confirm';

interface HabitEntry {
  id: string;
  name: string;
  completionRate: number;
  tier: string;
}

interface GoalEntry {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
}

interface MonthSummary {
  averageScore: number;
  bestStreak: number;
  habitsCompleted: number;
  goalsAchieved: number;
  totalGoals: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'habits', label: 'Habits' },
  { key: 'goals', label: 'Goals' },
  { key: 'plan', label: 'Plan' },
  { key: 'confirm', label: 'Confirm' },
];

function stepIndex(s: Step) {
  return STEPS.findIndex((x) => x.key === s);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MonthlyResetPage() {
  const router = useRouter();

  // Previous month string e.g. "2026-08"
  const prevMonthDate = subMonths(new Date(), 1);
  const prevMonth = format(prevMonthDate, 'yyyy-MM');
  const prevMonthLabel = format(prevMonthDate, 'MMMM yyyy');

  const [step, setStep] = useState<Step>('summary');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Data
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [habits, setHabits] = useState<HabitEntry[]>([]);
  const [goals, setGoals] = useState<GoalEntry[]>([]);

  // Decisions accumulated across steps
  const [habitsToKeep, setHabitsToKeep] = useState<string[]>([]);
  const [habitsToRemove, setHabitsToRemove] = useState<string[]>([]);
  const [habitsToModify, setHabitsToModify] = useState<string[]>([]);
  const [goalsCompleted, setGoalsCompleted] = useState<string[]>([]);
  const [goalsInProgress, setGoalsInProgress] = useState<string[]>([]);
  const [nextMonthFocus, setNextMonthFocus] = useState('');
  const [nextMonthGoalTitles, setNextMonthGoalTitles] = useState<string[]>([]);

  // ── Load data from existing APIs ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [habitsRes, goalsRes, analyticsRes] = await Promise.all([
        fetch('/api/habits'),
        fetch('/api/goals'),
        fetch(`/api/analytics/monthly?month=${prevMonth}`).catch(() => null),
      ]);

      if (habitsRes.ok) {
        const habitsJson = await habitsRes.json();
        const rawHabits = habitsJson.data ?? habitsJson ?? [];
        setHabits(
          rawHabits.map((h: Record<string, unknown>) => ({
            id: h.id as string,
            name: h.name as string,
            tier: (h.tier as string) ?? 'GROWTH',
            completionRate: typeof h.completionRate === 'number' ? h.completionRate : 0,
          }))
        );
        // Default all habits to "keep"
        setHabitsToKeep(rawHabits.map((h: Record<string, unknown>) => h.id as string));
      }

      if (goalsRes.ok) {
        const goalsJson = await goalsRes.json();
        const rawGoals = goalsJson.data ?? goalsJson ?? [];
        setGoals(
          rawGoals.map((g: Record<string, unknown>) => ({
            id: g.id as string,
            title: g.title as string,
            status: (g.status as string) ?? 'IN_PROGRESS',
            progressPercent: typeof g.progressPercent === 'number' ? g.progressPercent : 0,
          }))
        );
        // Default active goals to in-progress
        setGoalsInProgress(rawGoals.map((g: Record<string, unknown>) => g.id as string));
      }

      // Use analytics data if available; otherwise fall back to zeros
      if (analyticsRes?.ok) {
        const analyticsJson = await analyticsRes.json();
        const d = analyticsJson.data ?? {};
        setSummary({
          averageScore: d.averageScore ?? 0,
          bestStreak: d.bestStreak ?? 0,
          habitsCompleted: d.habitsCompleted ?? 0,
          goalsAchieved: d.goalsAchieved ?? 0,
          totalGoals: d.totalGoals ?? goals.length,
        });
      } else {
        setSummary({ averageScore: 0, bestStreak: 0, habitsCompleted: 0, goalsAchieved: 0, totalGoals: 0 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reset data');
    } finally {
      setLoading(false);
    }
  }, [prevMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // ── Habit decision helpers ────────────────────────────────────────────────
  const handleHabitKeep = (id: string) => {
    setHabitsToKeep((p) => [...new Set([...p, id])]);
    setHabitsToRemove((p) => p.filter((x) => x !== id));
    setHabitsToModify((p) => p.filter((x) => x !== id));
  };
  const handleHabitRemove = (id: string) => {
    setHabitsToRemove((p) => [...new Set([...p, id])]);
    setHabitsToKeep((p) => p.filter((x) => x !== id));
    setHabitsToModify((p) => p.filter((x) => x !== id));
  };
  const handleHabitModify = (id: string) => {
    setHabitsToModify((p) => [...new Set([...p, id])]);
    setHabitsToKeep((p) => p.filter((x) => x !== id));
    setHabitsToRemove((p) => p.filter((x) => x !== id));
  };

  // ── Goal decision helpers ─────────────────────────────────────────────────
  const handleGoalComplete = (id: string) => {
    setGoalsCompleted((p) => [...new Set([...p, id])]);
    setGoalsInProgress((p) => p.filter((x) => x !== id));
  };
  const handleGoalCarryOver = (id: string) => {
    setGoalsInProgress((p) => [...new Set([...p, id])]);
    setGoalsCompleted((p) => p.filter((x) => x !== id));
  };
  const handleGoalDrop = (id: string) => {
    setGoalsCompleted((p) => p.filter((x) => x !== id));
    setGoalsInProgress((p) => p.filter((x) => x !== id));
  };

  // ── Next month plan submitted ─────────────────────────────────────────────
  const handlePlanSubmit = (data: { monthlyFocus: string; goals: string[] }) => {
    setNextMonthFocus(data.monthlyFocus);
    setNextMonthGoalTitles(data.goals);
    setStep('confirm');
  };

  // ── Final submit ──────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/monthly-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: prevMonth,
          habitsToKeep,
          habitsToRemove,
          habitsToModify: habitsToModify.map((id) => ({ habitId: id, changes: {} })),
          goalsCompleted,
          goalsInProgress,
          nextMonthFocus,
          nextMonthGoals: nextMonthGoalTitles.map((title) => ({
            title,
            targetValue: 1,
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to submit monthly reset');
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit reset');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived data for confirmation screen ─────────────────────────────────
  const confirmSummary = {
    habitsKept: habitsToKeep.length,
    habitsRemoved: habitsToRemove.length,
    goalsCarried: goalsInProgress.length,
    newGoals: nextMonthGoalTitles.filter(Boolean).length,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Monthly Reset</h1>
            <p className="mt-0.5 text-sm text-zinc-500">{prevMonthLabel}</p>
          </div>
        </div>

        {/* Step breadcrumb */}
        {!submitted && (
          <nav className="flex items-center gap-1" aria-label="Reset steps">
            {STEPS.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1">
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    step === s.key
                      ? 'bg-indigo-600 text-white'
                      : stepIndex(step) > i
                      ? 'bg-emerald-700/60 text-emerald-200'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {i + 1}. {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-zinc-700">›</span>}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 w-full animate-pulse rounded-2xl bg-zinc-800/60" />
          ))}
        </div>
      )}

      {/* Success screen */}
      {submitted && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <span className="text-3xl">🎉</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Reset Complete!</h2>
          <p className="text-zinc-400 mb-6 max-w-sm">
            Your habits and goals have been updated for {format(new Date(), 'MMMM yyyy')}. Time to execute.
          </p>
          <button
            onClick={() => router.push('/today')}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors"
          >
            Go to Today →
          </button>
        </div>
      )}

      {/* ══ STEP: PREVIOUS MONTH SUMMARY ══ */}
      {!loading && !submitted && step === 'summary' && summary && (
        <div className="space-y-6">
          <PreviousMonthSummary
            month={format(prevMonthDate, 'MMMM')}
            year={prevMonthDate.getFullYear()}
            averageScore={Math.round(summary.averageScore)}
            bestStreak={summary.bestStreak}
            habitsCompleted={summary.habitsCompleted}
            goalsAchieved={summary.goalsAchieved}
            totalGoals={summary.totalGoals}
          />
          <div className="flex justify-end">
            <button
              onClick={() => setStep('habits')}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors"
            >
              Review Habits →
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP: HABIT REVIEW ══ */}
      {!loading && !submitted && step === 'habits' && (
        <div className="space-y-6">
          <HabitReview
            habits={habits}
            onKeep={handleHabitKeep}
            onRemove={handleHabitRemove}
            onModify={handleHabitModify}
          />
          <div className="flex justify-between">
            <button
              onClick={() => setStep('summary')}
              className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep('goals')}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors"
            >
              Review Goals →
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP: GOAL REVIEW ══ */}
      {!loading && !submitted && step === 'goals' && (
        <div className="space-y-6">
          <GoalReview
            goals={goals}
            onComplete={handleGoalComplete}
            onCarryOver={handleGoalCarryOver}
            onDrop={handleGoalDrop}
          />
          <div className="flex justify-between">
            <button
              onClick={() => setStep('habits')}
              className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep('plan')}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors"
            >
              Plan Next Month →
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP: NEXT MONTH PLAN ══ */}
      {!loading && !submitted && step === 'plan' && (
        <div className="space-y-4">
          <NextMonthPlan onSubmit={handlePlanSubmit} />
          <div className="flex justify-start">
            <button
              onClick={() => setStep('goals')}
              className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP: CONFIRMATION ══ */}
      {!loading && !submitted && step === 'confirm' && (
        <div className="space-y-6">
          <ResetConfirmation
            summary={confirmSummary}
            onBack={() => setStep('plan')}
            onConfirm={handleConfirm}
          />
          {submitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
              <Loader2 size={16} className="animate-spin" />
              Applying your reset…
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

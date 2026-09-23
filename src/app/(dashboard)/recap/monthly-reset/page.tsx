'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, subMonths } from 'date-fns';
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
  habitsCompleted: number;
  goalsMet: number;
  focusMinutes: number;
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
  const prevMonthDate = useMemo(() => subMonths(new Date(), 1), []);
  const prevMonth = useMemo(() => format(prevMonthDate, 'yyyy-MM'), [prevMonthDate]);
  const prevMonthLabel = useMemo(() => format(prevMonthDate, 'MMMM yyyy'), [prevMonthDate]);

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

      // Map the REAL month-level analytics (`/api/analytics/monthly`). No
      // fallback zeros — if it fails, the summary step shows an empty note.
      if (analyticsRes?.ok) {
        const analyticsJson = await analyticsRes.json();
        const d = analyticsJson.data ?? null;
        setSummary(
          d?.scores && d.habits && d.goals
            ? {
                averageScore: d.scores.average ?? 0,
                habitsCompleted: d.habits.totalCompleted ?? 0,
                goalsMet: d.goals.completed ?? 0,
                focusMinutes: d.focus?.totalFocusMinutes ?? 0,
              }
            : null
        );
      } else {
        setSummary(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reset data');
    } finally {
      setLoading(false);
    }
  }, [prevMonth]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
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
    <div className="container mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Monthly Reset</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{prevMonthLabel}</p>
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
                      ? 'bg-primary text-primary-foreground'
                      : stepIndex(step) > i
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}. {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-muted-foreground/60">›</span>}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive hover:text-destructive">✕</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 w-full animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {/* Success screen */}
      {submitted && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <span className="text-3xl">🎉</span>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Reset Complete!</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Your habits and goals have been updated for {format(new Date(), 'MMMM yyyy')}. Time to execute.
          </p>
          <button
            onClick={() => router.push('/today')}
            className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors"
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
            habitsCompleted={summary.habitsCompleted}
            goalsMet={summary.goalsMet}
            focusMinutes={summary.focusMinutes}
          />
          <div className="flex justify-end">
            <button
              onClick={() => setStep('habits')}
              className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors"
            >
              Review Habits →
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP: PREVIOUS MONTH SUMMARY — no data available ══ */}
      {!loading && !submitted && step === 'summary' && !summary && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-8 text-center shadow-soft">
            <h2 className="text-lg font-semibold text-foreground">{prevMonthLabel} Review</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We could not load last month&apos;s summary. Your habits and goal review below
              still shows your real data.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setStep('habits')}
              className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors"
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
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep('goals')}
              className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors"
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
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep('plan')}
              className="rounded-xl bg-primary hover:bg-primary/90 px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors"
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
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
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
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Applying your reset…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { WeeklyReviewSummary } from '@/components/review/WeeklyReviewSummary';
import { ReviewQuestions, ReviewFormData } from '@/components/review/ReviewQuestions';
import { ReviewAnswers } from '@/components/review/ReviewAnswers';
import { ReviewHistory } from '@/components/review/ReviewHistory';
import { ChevronLeft, RefreshCw } from 'lucide-react';

type Step = 'history' | 'summary' | 'questions' | 'answers';

interface WeeklyRecapData {
  averageScore: number;
  habitsCompleted: number;
  goalsAchieved: number;
  biggestWin?: string;
  weeklyFocus?: string;
}

interface ReviewRecord {
  id: string;
  weekStart: string;
  weekEnd: string;
  averageScore: number;
}

export default function WeeklyReviewPage() {
  const router = useRouter();

  // Derive the most recent completed week (Mon–Sun)
  const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
  const defaultWeekStart = format(lastWeekStart, 'yyyy-MM-dd');
  const defaultWeekEnd = format(lastWeekEnd, 'yyyy-MM-dd');

  const [step, setStep] = useState<Step>('history');
  const [selectedWeekStart, setSelectedWeekStart] = useState(defaultWeekStart);
  const [selectedWeekEnd, setSelectedWeekEnd] = useState(defaultWeekEnd);
  const [recap, setRecap] = useState<WeeklyRecapData | null>(null);
  const [answers, setAnswers] = useState<ReviewFormData>({});
  const [history, setHistory] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Fetch past reviews for the history list ────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/weekly-review?weekStart=' + defaultWeekStart);
      const json = await res.json();
      if (json.success && json.data?.review) {
        // History endpoint returns an array; adapt if needed
        setHistory(Array.isArray(json.data) ? json.data : []);
      }
    } catch {
      // History is best-effort; don't block the page
    }
  }, [defaultWeekStart]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Load a specific week's recap data ─────────────────────────────────────
  const loadWeekRecap = async (weekStart: string) => {
    const weekEnd = format(
      endOfWeek(new Date(weekStart + 'T12:00:00'), { weekStartsOn: 1 }),
      'yyyy-MM-dd'
    );
    setSelectedWeekStart(weekStart);
    setSelectedWeekEnd(weekEnd);
    setLoading(true);
    setError(null);
    setRecap(null);
    setAnswers({});

    try {
      const res = await fetch(`/api/weekly-review?weekStart=${weekStart}`);
      if (!res.ok) throw new Error('Failed to load review data');
      const json = await res.json();

      const recapData: WeeklyRecapData = json.data?.recap ?? {
        averageScore: 0,
        habitsCompleted: 0,
        goalsAchieved: 0,
      };
      setRecap(recapData);

      if (json.data?.review?.answers) {
        try {
          setAnswers(JSON.parse(json.data.review.answers));
        } catch {
          setAnswers({});
        }
      }

      setStep('summary');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Start the current week's review ───────────────────────────────────────
  const startCurrentWeekReview = () => loadWeekRecap(defaultWeekStart);

  // ── History item selected ──────────────────────────────────────────────────
  const handleHistorySelect = (id: string) => {
    const entry = history.find((h) => h.id === id);
    if (entry) loadWeekRecap(entry.weekStart);
  };

  // ── Questions submitted → show answer summary & save ──────────────────────
  const handleQuestionsSubmit = async (data: ReviewFormData) => {
    setAnswers(data);
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const res = await fetch('/api/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: selectedWeekStart,
          weekEnd: selectedWeekEnd,
          answers: data,
          biggestWins: data.biggestWin,
          nextWeekFocus: data.nextWeekFocus,
        }),
      });

      if (!res.ok) throw new Error('Failed to save review');
      setSaveSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save review');
    } finally {
      setSaving(false);
      setStep('answers');
    }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const displayWeekRange =
    selectedWeekStart && selectedWeekEnd
      ? `${format(new Date(selectedWeekStart + 'T12:00:00'), 'MMM d')} – ${format(new Date(selectedWeekEnd + 'T12:00:00'), 'MMM d, yyyy')}`
      : '';

  const stepLabels: Record<Step, string> = {
    history: 'History',
    summary: 'Summary',
    questions: 'Questions',
    answers: 'Answers',
  };

  return (
    <DashboardLayout>
      {/* ── Page header ── */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Weekly Review</h1>
            {displayWeekRange && step !== 'history' && (
              <p className="mt-0.5 text-sm text-zinc-500">{displayWeekRange}</p>
            )}
          </div>
        </div>

        {/* Step breadcrumb */}
        <nav className="hidden sm:flex items-center gap-1" aria-label="Review steps">
          {(['history', 'summary', 'questions', 'answers'] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  step === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {i + 1}. {stepLabels[s]}
              </span>
              {i < 3 && <span className="text-zinc-700">›</span>}
            </span>
          ))}
        </nav>
      </div>

      {/* ── Global error banner ── */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* ── Save success toast ── */}
      {saveSuccess && (
        <div className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          ✅ Review saved successfully!
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 w-full animate-pulse rounded-2xl bg-zinc-800/60" />
          ))}
        </div>
      )}

      {/* ══ STEP: HISTORY ══════════════════════════════════════════════════════ */}
      {!loading && step === 'history' && (
        <div className="space-y-6">
          {/* CTA to start this week's review */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">
              Ready to reflect on last week?
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              {format(lastWeekStart, 'EEEE, MMM d')} – {format(lastWeekEnd, 'EEEE, MMM d, yyyy')}
            </p>
            <button
              onClick={startCurrentWeekReview}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow transition-colors"
            >
              <RefreshCw size={16} />
              Start This Week&apos;s Review
            </button>
          </div>

          {/* Past reviews */}
          {history.length > 0 && (
            <ReviewHistory reviews={history} onSelect={handleHistorySelect} />
          )}

          {history.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
              No past reviews yet. Complete your first one above!
            </div>
          )}
        </div>
      )}

      {/* ══ STEP: SUMMARY ══════════════════════════════════════════════════════ */}
      {!loading && step === 'summary' && recap && (
        <div className="space-y-6">
          <WeeklyReviewSummary
            review={{
              weekStart: format(new Date(selectedWeekStart + 'T12:00:00'), 'MMM d'),
              weekEnd: format(new Date(selectedWeekEnd + 'T12:00:00'), 'MMM d, yyyy'),
              averageScore: Math.round(recap.averageScore),
              habitsCompleted: recap.habitsCompleted,
              goalsAchieved: recap.goalsAchieved,
              biggestWin: recap.biggestWin,
              weeklyFocus: recap.weeklyFocus,
            }}
          />
          <div className="flex justify-end">
            <button
              onClick={() => setStep('questions')}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors"
            >
              Write My Review →
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP: QUESTIONS ════════════════════════════════════════════════════ */}
      {!loading && step === 'questions' && (
        <div className="space-y-4">
          <ReviewQuestions onSubmit={handleQuestionsSubmit} />
          {saving && (
            <p className="text-center text-sm text-zinc-400 animate-pulse">Saving your review…</p>
          )}
        </div>
      )}

      {/* ══ STEP: ANSWERS (read-back) ══════════════════════════════════════════ */}
      {!loading && step === 'answers' && Object.keys(answers).length > 0 && (
        <div className="space-y-6">
          <ReviewAnswers answers={answers} />
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setStep('questions')}
              className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Edit Answers
            </button>
            <button
              onClick={() => { setStep('history'); setSaveSuccess(false); }}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

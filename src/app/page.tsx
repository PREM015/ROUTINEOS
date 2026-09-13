'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import HabitList from '@/components/habits/HabitList';
import RoutineList from '@/components/routine/RoutineList';
import GoalsWidget from '@/components/dashboard/GoalsWidget';
import StreakWidget from '@/components/dashboard/StreakWidget';
import ProgressRings from '@/components/dashboard/ProgressRings';
import AddHabitModal from '@/components/habits/AddHabitModal';
import AddRoutineBlockModal from '@/components/routine/AddRoutineBlockModal';
import AddGoalModal from '@/components/goals/AddGoalModal';
import { useApp } from '@/context/AppContext';
import { calculateDayScore, DEFAULT_WEIGHTS } from '@/lib/scoring';
import { getTodayString } from '@/lib/dates';
import { isHabitScheduledForDate } from '@/lib/scheduling';
import { Plus, Moon, Palmtree } from 'lucide-react';
import { Button } from '@/components/ui';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function TodayPage() {
  const { status } = useSession();
  const { habits, getLogForDate, selectedDate, setDayMeta, getDayMeta } = useApp();
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [mood, setMood] = useState(0);
  const [reflection, setReflection] = useState('');

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">Loading…</div>;
  }

  if (status === 'unauthenticated') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#050816] px-6 text-center text-slate-100">
        <p className="mb-4 text-sm uppercase tracking-[0.28em] text-emerald-400">RoutineOS</p>
        <h1 className="text-4xl font-semibold">Your calm daily system starts here.</h1>
        <p className="mt-4 max-w-xl text-slate-300">
          Build routines, protect focus, and keep momentum with a habit system designed for real life.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/login" className="rounded-xl bg-emerald-500 px-6 py-3 font-medium text-slate-950 hover:bg-emerald-400">Log in</Link>
          <Link href="/register" className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 font-medium text-slate-100 hover:border-slate-500">Create account</Link>
        </div>
      </main>
    );
  }

  const today = getTodayString();
  const dayMeta = getDayMeta(selectedDate);

  const activeHabits = habits.filter(h => h.status === 'ACTIVE');
  const habitsForToday = activeHabits.map(h => ({
    id: h.id,
    tier: h.tier,
    completed: getLogForDate(h.id, selectedDate)?.status === 'COMPLETED',
    scheduled: isHabitScheduledForDate(h, selectedDate),
  }));

  const scores = calculateDayScore(
    habitsForToday,
    DEFAULT_WEIGHTS,
    dayMeta.dayType === 'REST',
    dayMeta.dayType === 'MINIMUM'
  );

  const displayDate = (() => {
    try {
      return format(parseISO(selectedDate), 'EEEE, MMM d');
    } catch {
      return selectedDate;
    }
  })();

  const handleSetDayType = (type: 'MINIMUM' | 'REST' | 'NORMAL') => {
    setDayMeta(selectedDate, {
      dayType: dayMeta.dayType === type ? 'NORMAL' : type,
    });
  };

  const saveReflection = () => {
    setDayMeta(selectedDate, { energy, mood, reflectionText: reflection });
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{displayDate}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {selectedDate === today ? "Let's make today count." : 'Viewing a past day.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StreakWidget currentStreak={0} longestStreak={0} />
          <button
            onClick={() => handleSetDayType('MINIMUM')}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-all ${
              dayMeta.dayType === 'MINIMUM'
                ? 'border-purple-500/30 bg-purple-500/20 text-purple-400'
                : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Moon size={13} /> Min Day
          </button>
          <button
            onClick={() => handleSetDayType('REST')}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-all ${
              dayMeta.dayType === 'REST'
                ? 'border-blue-500/30 bg-blue-500/20 text-blue-400'
                : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Palmtree size={13} /> Rest Day
          </button>
        </div>
      </div>

      {dayMeta.dayType !== 'NORMAL' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
            dayMeta.dayType === 'REST'
              ? 'border-blue-500/20 bg-blue-500/10 text-blue-400'
              : 'border-purple-500/20 bg-purple-500/10 text-purple-400'
          }`}
        >
          {dayMeta.dayType === 'REST' ? '🌴 Rest Day' : '🌙 Minimum Day'} — Habits not penalized.
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Today's Routine</h2>
              <Button size="sm" variant="ghost" onClick={() => setRoutineModalOpen(true)}>
                <Plus size={14} /> Add
              </Button>
            </div>
            <RoutineList />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Weekly Goals</h2>
              <Button size="sm" variant="ghost" onClick={() => setGoalModalOpen(true)}>
                <Plus size={14} /> Add
              </Button>
            </div>
            <GoalsWidget type="WEEKLY" />
          </div>
        </div>

        <div className="space-y-5 lg:col-span-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="shrink-0">
                <ProgressRings
                  coreScore={scores.coreScore}
                  growthScore={scores.growthScore}
                  bonusScore={scores.bonusScore}
                  size={160}
                />
              </div>
              <div className="grid w-full flex-1 grid-cols-3 gap-3">
                {[
                  { label: 'Core', score: scores.coreScore, color: 'text-emerald-400', sub: `${scores.nnCompleted}/${scores.nnTotal}` },
                  { label: 'Growth', score: scores.growthScore, color: 'text-teal-400', sub: `${scores.growthCompleted}/${scores.growthTotal}` },
                  { label: 'Bonus', score: scores.bonusScore, color: 'text-amber-400', sub: `${scores.bonusCompleted}/${scores.bonusTotal}` },
                ].map(({ label, score, color, sub }) => (
                  <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-center">
                    <div className={`text-2xl font-bold ${color}`}>{score === null ? '—' : `${Math.round(score)}%`}</div>
                    <div className="mt-0.5 text-xs text-zinc-400">{label}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Daily Check-in</h2>
              <Button size="sm" variant="ghost" onClick={() => setHabitModalOpen(true)}>
                <Plus size={14} /> Add Habit
              </Button>
            </div>
            <HabitList />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 className="mb-4 text-base font-semibold text-zinc-100">Quick Reflection <span className="ml-1 text-xs font-normal text-zinc-600">(optional)</span></h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Energy', value: energy, set: setEnergy },
                  { label: 'Mood', value: mood, set: setMood },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <p className="mb-2 text-xs text-zinc-500">{label}: <span className="font-medium text-zinc-300">{value > 0 ? value : '—'}/5</span></p>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(n => (
                        <button
                          key={n}
                          onClick={() => set(n)}
                          className={`h-2 flex-1 rounded-full transition-all ${n <= value ? 'bg-emerald-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <input
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="One thing that went well today..."
                value={reflection}
                onChange={e => setReflection(e.target.value)}
                onBlur={saveReflection}
              />
            </div>
          </div>
        </div>
      </div>

      <AddHabitModal open={habitModalOpen} onClose={() => setHabitModalOpen(false)} />
      <AddRoutineBlockModal open={routineModalOpen} onClose={() => setRoutineModalOpen(false)} />
      <AddGoalModal open={goalModalOpen} onClose={() => setGoalModalOpen(false)} defaultType="WEEKLY" />
    </DashboardLayout>
  );
}

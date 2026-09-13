'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getTodayString, nowForUser } from '@/lib/dates';

// ─── Types ───────────────────────────────────────────────────────────────────

export type HabitTier = 'NON_NEGOTIABLE' | 'GROWTH' | 'BONUS';
export type HabitStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'COMPLETED';
export type FrequencyType = 'DAILY' | 'WEEKDAYS' | 'WEEKENDS' | 'SPECIFIC_DAYS' | 'WEEKLY_TARGET' | 'MONTHLY_TARGET' | 'ONE_TIME';
export type LogStatus = 'COMPLETED' | 'MISSED' | 'SKIPPED' | 'NOT_APPLICABLE';
export type DayType = 'NORMAL' | 'MINIMUM' | 'REST' | 'MISSED';

export interface Habit {
  id: string;
  name: string;
  tier: HabitTier;
  status: HabitStatus;
  category?: string;
  frequencyType: FrequencyType;
  frequencyValue?: string;
  startDate: string;
  endDate?: string;
  reminderTime?: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  status: LogStatus;
  completedAt?: string;
  note?: string;
}

export interface RoutineBlock {
  id: string;
  dayType: string;
  startTime: string;
  endTime: string;
  title: string;
  category?: string;
  sortOrder: number;
  trackCompletion: boolean;
}

export interface Goal {
  id: string;
  type: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'CARRIED_OVER';
  title: string;
  description?: string;
  targetValue: number;
  currentValue: number;
  unit?: string;
  startDate: string;
  endDate: string;
  carriedOverFrom?: string;
}

export interface DayMeta {
  date: string;
  dayType: DayType;
  contextTags: string[];
  minimumDayReason?: string;
  restDayReason?: string;
  energy?: number;
  mood?: number;
  reflectionText?: string;
  biggestWin?: string;
  biggestDifficulty?: string;
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppContextValue {
  // Habits
  habits: Habit[];
  habitLogs: HabitLog[];
  addHabit: (habit: Omit<Habit, 'id'>) => Promise<Habit | void>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  logHabit: (habitId: string, date: string, status: LogStatus, note?: string) => Promise<void>;
  getLogForDate: (habitId: string, date: string) => HabitLog | undefined;

  // Routine
  routineBlocks: RoutineBlock[];
  addRoutineBlock: (block: Omit<RoutineBlock, 'id'>) => void;
  updateRoutineBlock: (id: string, updates: Partial<RoutineBlock>) => void;
  deleteRoutineBlock: (id: string) => void;

  // Goals
  goals: Goal[];
  addGoal: (goal: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  updateGoalProgress: (id: string, value: number) => void;

  // Day meta
  dayMeta: Record<string, DayMeta>;
  setDayMeta: (date: string, meta: Partial<DayMeta>) => void;
  getDayMeta: (date: string) => DayMeta;

  // UI state
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedRoutineTab: string;
  setSelectedRoutineTab: (tab: string) => void;
  undoStack: (() => void)[];
  pushUndo: (fn: () => void) => void;
  undo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

let idCounter = 1;
const genId = () => `local-${Date.now()}-${idCounter++}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const today = getTodayString();
  const { status } = useSession();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [routineBlocks, setRoutineBlocks] = useState<RoutineBlock[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dayMeta, setDayMetaMap] = useState<Record<string, DayMeta>>({});
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedRoutineTab, setSelectedRoutineTab] = useState('WEEKDAY');
  const [undoStack, setUndoStack] = useState<(() => void)[]>([]);

  const normalizeHabit = useCallback((raw: any): Habit => ({
    id: raw.id,
    name: raw.name,
    tier: raw.tier ?? 'GROWTH',
    status: raw.status ?? 'ACTIVE',
    category: raw.category ?? raw.categoryName ?? undefined,
    frequencyType: raw.frequencyType ?? 'DAILY',
    frequencyValue: raw.frequencyValue ?? undefined,
    startDate: raw.startDate ? String(raw.startDate).slice(0, 10) : today,
    endDate: raw.endDate ? String(raw.endDate).slice(0, 10) : undefined,
    reminderTime: raw.reminderTime ?? undefined,
  }), [today]);

  const normalizeGoal = useCallback((raw: any): Goal => ({
    id: raw.id,
    type: raw.type ?? 'WEEKLY',
    priority: raw.priority ?? 'MEDIUM',
    status: raw.status ?? 'ACTIVE',
    title: raw.title,
    description: raw.description ?? undefined,
    targetValue: Number(raw.targetValue ?? 0),
    currentValue: Number(raw.currentValue ?? 0),
    unit: raw.unit ?? undefined,
    startDate: raw.startDate ? String(raw.startDate).slice(0, 10) : today,
    endDate: raw.endDate ? String(raw.endDate).slice(0, 10) : today,
    carriedOverFrom: raw.carriedOverFrom ?? undefined,
  }), [today]);

  const normalizeRoutine = useCallback((raw: any): RoutineBlock => ({
    id: raw.id,
    dayType: raw.dayType ?? 'WEEKDAY',
    startTime: raw.startTime,
    endTime: raw.endTime,
    title: raw.title,
    category: raw.category ?? raw.categoryName ?? undefined,
    sortOrder: Number(raw.sortOrder ?? 0),
    trackCompletion: Boolean(raw.trackCompletion),
  }), []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setHabits([]);
      setHabitLogs([]);
      setRoutineBlocks([]);
      setGoals([]);
      return;
    }

    const fetchAll = async () => {
      try {
        const [habitRes, routineRes, goalRes] = await Promise.all([
          fetch('/api/habits'),
          fetch('/api/routine'),
          fetch('/api/goals'),
        ]);

        if (habitRes.ok) {
          const habitJson = await habitRes.json();
          const mappedHabits = Array.isArray(habitJson?.data) ? habitJson.data.map(normalizeHabit) : [];
          setHabits(mappedHabits);
          const mappedLogs = mappedHabits.flatMap((habit: Habit) =>
            (habitJson?.data ?? []).filter((raw: any) => raw.id === habit.id).flatMap((raw: any) =>
              (raw.logs ?? []).map((log: any) => ({
                id: log.id,
                habitId: habit.id,
                date: log.date,
                status: log.status,
                note: log.note ?? undefined,
                completedAt: log.completedAt ?? undefined,
              }))
            )
          );
          setHabitLogs(mappedLogs);
        }

        if (routineRes.ok) {
          const routineJson = await routineRes.json();
          setRoutineBlocks(Array.isArray(routineJson?.data) ? routineJson.data.map(normalizeRoutine) : []);
        }

        if (goalRes.ok) {
          const goalJson = await goalRes.json();
          setGoals(Array.isArray(goalJson?.data) ? goalJson.data.map(normalizeGoal) : []);
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      }
    };

    fetchAll();
  }, [normalizeHabit, normalizeGoal, normalizeRoutine, status]);

  // ── Habits ──────────────────────────────────────────────────────────────────
  const addHabit = useCallback(async (habit: Omit<Habit, 'id'>) => {
    const localHabit = { ...habit, id: genId() };
    setHabits(prev => [...prev, localHabit]);

    if (status !== 'authenticated') {
      return localHabit;
    }

    try {
      const response = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: habit.name,
          tier: habit.tier,
          status: habit.status,
          category: habit.category,
          frequencyType: habit.frequencyType,
          frequencyValue: habit.frequencyValue,
          startDate: habit.startDate,
          endDate: habit.endDate,
          reminderTime: habit.reminderTime,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to create habit');
      const saved = normalizeHabit(json.data);
      setHabits(prev => prev.map(item => item.id === localHabit.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addHabit failed:', error);
      setHabits(prev => prev.filter(item => item.id !== localHabit.id));
      return localHabit;
    }
  }, [normalizeHabit, status]);

  const updateHabit = useCallback(async (id: string, updates: Partial<Habit>) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch('/api/habits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to update habit');
      const saved = normalizeHabit(json.data);
      setHabits(prev => prev.map(h => h.id === id ? saved : h));
    } catch (error) {
      console.error('updateHabit failed:', error);
    }
  }, [normalizeHabit, status]);

  const archiveHabit = useCallback(async (id: string) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, status: 'ARCHIVED' } : h));

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch('/api/habits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'ARCHIVED' }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to archive habit');
      const saved = normalizeHabit(json.data);
      setHabits(prev => prev.map(h => h.id === id ? saved : h));
    } catch (error) {
      console.error('archiveHabit failed:', error);
    }
  }, [normalizeHabit, status]);

  const logHabit = useCallback(async (habitId: string, date: string, statusValue: LogStatus, note?: string) => {
    setHabitLogs(prev => {
      const existing = prev.find(l => l.habitId === habitId && l.date === date);
      if (existing) {
        return prev.map(l =>
          l.habitId === habitId && l.date === date
            ? { ...l, status: statusValue, note, completedAt: statusValue === 'COMPLETED' ? nowForUser() : undefined }
            : l
        );
      }
      return [...prev, {
        id: genId(),
        habitId,
        date,
        status: statusValue,
        note,
        completedAt: statusValue === 'COMPLETED' ? nowForUser() : undefined,
      }];
    });

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch(`/api/habits/${habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, status: statusValue, note }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to save habit log');
      setHabitLogs(prev => prev.map(log => log.habitId === habitId && log.date === date ? {
        ...log,
        id: json.data?.id ?? log.id,
        status: json.data?.status ?? statusValue,
        note: json.data?.note ?? note,
        completedAt: json.data?.completedAt ?? log.completedAt,
      } : log));
    } catch (error) {
      console.error('logHabit failed:', error);
    }
  }, [status]);

  const getLogForDate = useCallback((habitId: string, date: string) => {
    return habitLogs.find(l => l.habitId === habitId && l.date === date);
  }, [habitLogs]);

  // ── Routine ─────────────────────────────────────────────────────────────────
  const addRoutineBlock = useCallback(async (block: Omit<RoutineBlock, 'id'>) => {
    const localBlock = { ...block, id: genId() };
    setRoutineBlocks(prev => [...prev, localBlock]);

    if (status !== 'authenticated') {
      return localBlock;
    }

    try {
      const response = await fetch('/api/routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to create routine block');
      const saved = normalizeRoutine(json.data);
      setRoutineBlocks(prev => prev.map(item => item.id === localBlock.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addRoutineBlock failed:', error);
      setRoutineBlocks(prev => prev.filter(item => item.id !== localBlock.id));
      return localBlock;
    }
  }, [normalizeRoutine, status]);

  const updateRoutineBlock = useCallback(async (id: string, updates: Partial<RoutineBlock>) => {
    setRoutineBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch('/api/routine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to update routine block');
      const saved = normalizeRoutine(json.data);
      setRoutineBlocks(prev => prev.map(b => b.id === id ? saved : b));
    } catch (error) {
      console.error('updateRoutineBlock failed:', error);
    }
  }, [normalizeRoutine, status]);

  const deleteRoutineBlock = useCallback(async (id: string) => {
    setRoutineBlocks(prev => prev.filter(b => b.id !== id));

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch('/api/routine', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to delete routine block');
    } catch (error) {
      console.error('deleteRoutineBlock failed:', error);
    }
  }, [status]);

  // ── Goals ───────────────────────────────────────────────────────────────────
  const addGoal = useCallback(async (goal: Omit<Goal, 'id'>) => {
    const localGoal = { ...goal, id: genId() };
    setGoals(prev => [...prev, localGoal]);

    if (status !== 'authenticated') {
      return localGoal;
    }

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goal),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to create goal');
      const saved = normalizeGoal(json.data);
      setGoals(prev => prev.map(item => item.id === localGoal.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addGoal failed:', error);
      setGoals(prev => prev.filter(item => item.id !== localGoal.id));
      return localGoal;
    }
  }, [normalizeGoal, status]);

  const updateGoal = useCallback(async (id: string, updates: Partial<Goal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to update goal');
      const saved = normalizeGoal(json.data);
      setGoals(prev => prev.map(g => g.id === id ? saved : g));
    } catch (error) {
      console.error('updateGoal failed:', error);
    }
  }, [normalizeGoal, status]);

  const deleteGoal = useCallback(async (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch('/api/goals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to delete goal');
    } catch (error) {
      console.error('deleteGoal failed:', error);
    }
  }, [status]);

  const updateGoalProgress = useCallback(async (id: string, value: number) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== id) return g;
      const newVal = Math.min(g.targetValue, Math.max(0, value));
      return { ...g, currentValue: newVal, status: newVal >= g.targetValue ? 'COMPLETED' : 'ACTIVE' };
    }));

    if (status !== 'authenticated') {
      return;
    }

    try {
      const response = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, currentValue: value }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Failed to update goal progress');
      const saved = normalizeGoal(json.data);
      setGoals(prev => prev.map(g => g.id === id ? saved : g));
    } catch (error) {
      console.error('updateGoalProgress failed:', error);
    }
  }, [normalizeGoal, status]);

  // ── Day Meta ─────────────────────────────────────────────────────────────────
  const getDayMeta = useCallback((date: string): DayMeta => {
    return dayMeta[date] || { date, dayType: 'NORMAL', contextTags: [] };
  }, [dayMeta]);

  const setDayMeta = useCallback((date: string, meta: Partial<DayMeta>) => {
    setDayMetaMap(prev => ({
      ...prev,
      [date]: { ...getDayMeta(date), ...meta, date },
    }));
  }, [getDayMeta]);

  // ── Undo ─────────────────────────────────────────────────────────────────────
  const pushUndo = useCallback((fn: () => void) => {
    setUndoStack(prev => [...prev.slice(-9), fn]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      last();
      return prev.slice(0, -1);
    });
  }, []);

  return (
    <AppContext.Provider value={{
      habits, habitLogs, addHabit, updateHabit, archiveHabit, logHabit, getLogForDate,
      routineBlocks, addRoutineBlock, updateRoutineBlock, deleteRoutineBlock,
      goals, addGoal, updateGoal, deleteGoal, updateGoalProgress,
      dayMeta, setDayMeta, getDayMeta,
      selectedDate, setSelectedDate,
      selectedRoutineTab, setSelectedRoutineTab,
      undoStack, pushUndo, undo,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

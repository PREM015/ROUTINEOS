'use client';

import { createContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getTodayString, nowForUser } from '@/lib/dates';

// ─── Types (aligned with Prisma enums + API Zod schemas) ────────────────────

export type HabitTier =
  | 'GROWTH' | 'BONUS' | 'OPTIONAL' | 'EXPERIMENTAL' | 'UNDEFINED'
  | 'ALTERNATIVE' | 'SPECIAL' | 'FLEXIBLE' | 'JUST_FOR_FUN' | 'LIFESTYLE';
export type HabitStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'COMPLETED';
export type FrequencyType =
  | 'DAILY' | 'SPECIFIC_WEEKDAYS' | 'WEEKLY_TARGET' | 'MONTHLY_TARGET'
  | 'YEARLY_TARGET' | 'RANDOM' | 'ONE_TIME' | 'CUSTOM';
export type LogStatus = 'COMPLETED' | 'MISSED' | 'SKIPPED' | 'NOT_APPLICABLE' | 'PARTIAL';
export type DayType = 'NORMAL' | 'MINIMUM' | 'REST' | 'MISSED';

export interface Habit {
  id: string;
  name: string;
  description?: string;
  tier: HabitTier;
  status: HabitStatus;
  categoryId?: string;
  category?: string;
  color?: string;
  icon?: string;
  frequencyType: FrequencyType;
  frequencyValue?: string;
  targetCount?: number;
  startDate: string;
  endDate?: string;
  reminderTime?: string;
  reminderEnabled?: boolean;
  streakCount?: number;
  longestStreak?: number;
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
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  trackCompletion: boolean;
  overlapWarning?: boolean;
  energyLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface Goal {
  id: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'PERSONAL' | 'ACADEMIC' | 'NON_PROFIT' | 'PROFESSIONAL';
  status: 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'CARRIED_OVER' | 'ON_HOLD' | 'CANCELLED';
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
  dataLoaded: boolean;
  dataError: string | null;
  reloadData: () => Promise<void>;
  addHabit: (habit: Omit<Habit, 'id'>) => Promise<Habit>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  logHabit: (habitId: string, date: string, status: LogStatus, note?: string) => Promise<void>;
  getLogForDate: (habitId: string, date: string) => HabitLog | undefined;

  // Routine
  routineBlocks: RoutineBlock[];
  addRoutineBlock: (block: Omit<RoutineBlock, 'id'>) => Promise<RoutineBlock>;
  updateRoutineBlock: (id: string, updates: Partial<RoutineBlock>) => Promise<void>;
  deleteRoutineBlock: (id: string) => Promise<void>;

  // Goals
  goals: Goal[];
  addGoal: (goal: Omit<Goal, 'id'>) => Promise<Goal>;
  updateGoal: (id: string, updates: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  updateGoalProgress: (id: string, value: number) => Promise<void>;

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

/** @internal Shared by the provider and `useApp`. */
export { AppContext };

let idCounter = 1;
const genId = () => `local-${Date.now()}-${idCounter++}`;

/** Extract a readable message from a failed API response (includes Zod details). */
function apiErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object') {
    const j = json as { error?: string; details?: { fieldErrors?: Record<string, string[]> } };
    if (j.details?.fieldErrors) {
      const first = Object.entries(j.details.fieldErrors).find(([, v]) => v?.length);
      if (first) return `${first[0]}: ${first[1][0]}`;
    }
    if (typeof j.error === 'string' && j.error) return j.error;
  }
  return fallback;
}

async function throwIfNotOk(response: Response, fallback: string): Promise<unknown> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(json, fallback));
  return json;
}

// Module-level in-flight guard: one data layer, deduped initial fetch.
let inflightFetch: Promise<void> | null = null;

export function AppProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  // Avoid hydration mismatch: render a stable placeholder, set the real
  // local date after mount.
  const [selectedDate, setSelectedDate] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only date sync to avoid SSR hydration mismatch
    setSelectedDate((d) => d || getTodayString());
  }, []);
  const today = selectedDate || '1970-01-01';

  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [routineBlocks, setRoutineBlocks] = useState<RoutineBlock[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dayMeta, setDayMetaMap] = useState<Record<string, DayMeta>>({});
  const [selectedRoutineTab, setSelectedRoutineTab] = useState('WEEKDAY');
  const [undoStack, setUndoStack] = useState<(() => void)[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const normalizeHabit = useCallback((raw: {
    id: string; name: string; description?: string | null; tier?: HabitTier;
    status?: HabitStatus; categoryId?: string | null; category?: string | { name?: string } | null;
    color?: string | null; icon?: string | null; frequencyType?: FrequencyType;
    frequencyValue?: string | null;     targetCount?: number | null;
    startDate?: string | Date | null; endDate?: string | Date | null;
    reminderTime?: string | null; reminderEnabled?: boolean | null;
    streakCount?: number | null; longestStreak?: number | null;
  }): Habit => ({
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    tier: raw.tier ?? 'GROWTH',
    status: raw.status ?? 'ACTIVE',
    categoryId: raw.categoryId ?? undefined,
    category: typeof raw.category === 'string' ? raw.category : (raw.category?.name ?? undefined),
    color: raw.color ?? undefined,
    icon: raw.icon ?? undefined,
    frequencyType: raw.frequencyType ?? 'DAILY',
    frequencyValue: raw.frequencyValue ?? undefined,
    targetCount: raw.targetCount ?? undefined,
    startDate: raw.startDate ? String(raw.startDate).slice(0, 10) : today,
    endDate: raw.endDate ? String(raw.endDate).slice(0, 10) : undefined,
    reminderTime: raw.reminderTime ?? undefined,
    reminderEnabled: raw.reminderEnabled ?? undefined,
    streakCount: raw.streakCount ?? undefined,
    longestStreak: raw.longestStreak ?? undefined,
  }), [today]);

  const normalizeGoal = useCallback((raw: {
    id: string; type?: Goal['type']; priority?: Goal['priority']; status?: Goal['status'];
    title: string; description?: string | null; targetValue?: number | string | null;
    currentValue?: number | string | null; unit?: string | null;
    startDate?: string | Date | null; endDate?: string | Date | null;
    carriedOverFrom?: string | null;
  }): Goal => ({
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

  const normalizeRoutine = useCallback((raw: {
    id: string; dayType?: string; startTime: string; endTime: string; title?: string;
    name?: string; description?: string | null; category?: string | { name?: string } | null;
    color?: string | null; icon?: string | null; sortOrder?: number | null;
    trackCompletion?: boolean | null; overlapWarning?: boolean;
    energyLevel?: string | null;
    template?: { dayType?: string } | null;
  }): RoutineBlock => ({
    id: raw.id,
    // Server stores WORKDAY; the UI labels the tab WEEKDAY. Normalize so the
    // filter `dayType === selectedRoutineTab` survives a refresh.
    dayType: (() => {
      const dt = raw.dayType ?? raw.template?.dayType ?? 'CUSTOM';
      return dt === 'WORKDAY' ? 'WEEKDAY' : dt;
    })(),
    startTime: raw.startTime,
    endTime: raw.endTime,
    title: raw.title ?? raw.name ?? 'Untitled block',
    description: raw.description ?? undefined,
    category: typeof raw.category === 'string' ? raw.category : (raw.category?.name ?? undefined),
    color: raw.color ?? undefined,
    icon: raw.icon ?? undefined,
    sortOrder: Number(raw.sortOrder ?? 0),
    trackCompletion: raw.trackCompletion ?? true,
    overlapWarning: raw.overlapWarning,
    energyLevel: raw.energyLevel === 'HIGH' || raw.energyLevel === 'MEDIUM' || raw.energyLevel === 'LOW'
      ? raw.energyLevel
      : undefined,
  }), []);

  const fetchAll = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDataError(null);
    try {
      const [habitRes, routineRes, goalRes] = await Promise.all([
        fetch('/api/habits', { signal: controller.signal }),
        fetch('/api/routine', { signal: controller.signal }),
        fetch('/api/goals', { signal: controller.signal }),
      ]);

      if (habitRes.ok) {
        const habitJson = await habitRes.json();
        const list = Array.isArray(habitJson?.data) ? habitJson.data : [];
        const mappedHabits = list.map(normalizeHabit);
        setHabits(mappedHabits);
        const mappedLogs: HabitLog[] = list.flatMap((raw: { id: string; logs?: Array<{ id: string; date: string; status: LogStatus; note?: string | null; completedAt?: string | Date | null }> }) =>
          (raw.logs ?? []).map((log) => ({
            id: log.id,
            habitId: raw.id,
            date: typeof log.date === 'string' ? log.date.slice(0, 10) : String(log.date),
            status: log.status,
            note: log.note ?? undefined,
            completedAt: log.completedAt ? String(log.completedAt) : undefined,
          }))
        );
        setHabitLogs(mappedLogs);
      } else if (habitRes.status !== 401) {
        const j = await habitRes.json().catch(() => ({}));
        throw new Error(apiErrorMessage(j, 'Failed to load habits'));
      }

      if (routineRes.ok) {
        const routineJson = await routineRes.json();
        const templates = Array.isArray(routineJson?.data) ? routineJson.data : [];
        // Templates include blocks: flatten to the block list the UI consumes.
        const blocks = templates.flatMap((t: { dayType?: string; blocks?: unknown[] }) =>
          (Array.isArray(t.blocks) ? t.blocks : []).map((b) =>
            normalizeRoutine({ ...(b as object), dayType: (b as { dayType?: string }).dayType ?? t.dayType } as never)
          )
        );
        blocks.sort((a: RoutineBlock, b: RoutineBlock) => a.startTime.localeCompare(b.startTime));
        setRoutineBlocks(blocks);
      } else if (routineRes.status !== 401) {
        const j = await routineRes.json().catch(() => ({}));
        throw new Error(apiErrorMessage(j, 'Failed to load routine'));
      }

      if (goalRes.ok) {
        const goalJson = await goalRes.json();
        setGoals(Array.isArray(goalJson?.data) ? goalJson.data.map(normalizeGoal) : []);
      } else if (goalRes.status !== 401) {
        const j = await goalRes.json().catch(() => ({}));
        throw new Error(apiErrorMessage(j, 'Failed to load goals'));
      }
      setDataLoaded(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to load dashboard data:', error);
      setDataError(error instanceof Error ? error.message : 'Failed to load data');
    }
  }, [normalizeHabit, normalizeGoal, normalizeRoutine]);

  // Single data layer: one deduped fetch per auth session with abort on
  // unmount. State resets when the session ends.
  useEffect(() => {
    if (status !== 'authenticated') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auth-driven data layer with request dedupe
      setHabits([]);
      setHabitLogs([]);
      setRoutineBlocks([]);
      setGoals([]);
      setDataLoaded(false);
      return;
    }
    if (!inflightFetch) {
      inflightFetch = fetchAll().finally(() => {
        inflightFetch = null;
      });
    } else {
      inflightFetch.then(() => undefined).catch(() => undefined);
    }
    return () => abortRef.current?.abort();
  }, [fetchAll, status]);

  const reloadData = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

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
          description: habit.description,
          tier: habit.tier,
          categoryId: habit.categoryId,
          color: habit.color,
          icon: habit.icon,
          frequencyType: habit.frequencyType,
          frequencyValue: habit.frequencyValue,
          targetCount: habit.targetCount,
          startDate: habit.startDate,
          endDate: habit.endDate,
          reminderTime: habit.reminderTime,
          reminderEnabled: habit.reminderEnabled,
        }),
      });
      const json = await throwIfNotOk(response, 'Failed to create habit') as { data: never };
      const saved = normalizeHabit(json.data);
      setHabits(prev => prev.map(item => item.id === localHabit.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addHabit failed:', error);
      // Roll back the optimistic item so the UI never shows unsaved data.
      setHabits(prev => prev.filter(item => item.id !== localHabit.id));
      throw error;
    }
  }, [normalizeHabit, status]);

  const updateHabit = useCallback(async (id: string, updates: Partial<Habit>) => {
    const prev = habits.find(h => h.id === id);
    setHabits(prevList => prevList.map(h => h.id === id ? { ...h, ...updates } : h));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const { id: _omit, ...fields } = updates;
      const response = await fetch(`/api/habits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const json = await throwIfNotOk(response, 'Failed to update habit') as { data: never };
      const saved = normalizeHabit(json.data);
      setHabits(prevList => prevList.map(h => h.id === id ? saved : h));
    } catch (error) {
      console.error('updateHabit failed:', error);
      if (prev) setHabits(prevList => prevList.map(h => h.id === id ? prev : h));
      throw error;
    }
  }, [habits, normalizeHabit, status]);

  const archiveHabit = useCallback(async (id: string) => {
    return updateHabit(id, { status: 'ARCHIVED' });
  }, [updateHabit]);

  const deleteHabit = useCallback(async (id: string) => {
    const prev = habits;
    setHabits(prevList => prevList.filter(h => h.id !== id));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const response = await fetch(`/api/habits/${id}`, { method: 'DELETE' });
      await throwIfNotOk(response, 'Failed to delete habit');
    } catch (error) {
      console.error('deleteHabit failed:', error);
      setHabits(prev);
      throw error;
    }
  }, [habits, status]);

  const logHabit = useCallback(async (habitId: string, date: string, statusValue: LogStatus, note?: string) => {
    const previous = habitLogs.find(l => l.habitId === habitId && l.date === date);
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
      const json = await throwIfNotOk(response, 'Failed to save habit log') as { data?: { log?: { id?: string; status?: LogStatus; note?: string | null; completedAt?: string | Date | null }; id?: string; status?: LogStatus; note?: string | null; completedAt?: string | Date | null } };
      // The log route nests the record under `data.log`; accept both shapes.
      const savedLog = json.data?.log ?? json.data;
      setHabitLogs(prev => prev.map(log => log.habitId === habitId && log.date === date ? {
        ...log,
        id: savedLog?.id ?? log.id,
        status: savedLog?.status ?? statusValue,
        note: savedLog?.note ?? note,
        completedAt: savedLog?.completedAt ? String(savedLog.completedAt) : log.completedAt,
      } : log));
    } catch (error) {
      console.error('logHabit failed:', error);
      // Roll back optimistic toggle.
      setHabitLogs(prev => {
        if (!previous) return prev.filter(l => !(l.habitId === habitId && l.date === date));
        return prev.map(l => l.habitId === habitId && l.date === date ? previous : l);
      });
      throw error;
    }
  }, [habitLogs, status]);

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
      const json = await throwIfNotOk(response, 'Failed to create routine block') as { data: never };
      const saved = normalizeRoutine(json.data);
      setRoutineBlocks(prev => prev.map(item => item.id === localBlock.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addRoutineBlock failed:', error);
      setRoutineBlocks(prev => prev.filter(item => item.id !== localBlock.id));
      throw error;
    }
  }, [normalizeRoutine, status]);

  const updateRoutineBlock = useCallback(async (id: string, updates: Partial<RoutineBlock>) => {
    const prev = routineBlocks.find(b => b.id === id);
    setRoutineBlocks(prevList => prevList.map(b => b.id === id ? { ...b, ...updates } : b));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const { id: _omit, overlapWarning: _warn, ...fields } = updates;
      const response = await fetch('/api/routine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      });
      const json = await throwIfNotOk(response, 'Failed to update routine block') as { data: never };
      const saved = normalizeRoutine(json.data);
      setRoutineBlocks(prevList => prevList.map(b => b.id === id ? saved : b));
    } catch (error) {
      console.error('updateRoutineBlock failed:', error);
      if (prev) setRoutineBlocks(prevList => prevList.map(b => b.id === id ? prev : b));
      throw error;
    }
  }, [routineBlocks, normalizeRoutine, status]);

  const deleteRoutineBlock = useCallback(async (id: string) => {
    const prev = routineBlocks;
    setRoutineBlocks(prevList => prevList.filter(b => b.id !== id));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const response = await fetch('/api/routine', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await throwIfNotOk(response, 'Failed to delete routine block');
    } catch (error) {
      console.error('deleteRoutineBlock failed:', error);
      setRoutineBlocks(prev);
      throw error;
    }
  }, [routineBlocks, status]);

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
        body: JSON.stringify({
          title: goal.title,
          description: goal.description,
          type: goal.type,
          priority: goal.priority,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          unit: goal.unit,
          startDate: goal.startDate,
          endDate: goal.endDate,
        }),
      });
      const json = await throwIfNotOk(response, 'Failed to create goal') as { data: never };
      const saved = normalizeGoal(json.data);
      setGoals(prev => prev.map(item => item.id === localGoal.id ? saved : item));
      return saved;
    } catch (error) {
      console.error('addGoal failed:', error);
      setGoals(prev => prev.filter(item => item.id !== localGoal.id));
      throw error;
    }
  }, [normalizeGoal, status]);

  const updateGoal = useCallback(async (id: string, updates: Partial<Goal>) => {
    const prev = goals.find(g => g.id === id);
    setGoals(prevList => prevList.map(g => g.id === id ? { ...g, ...updates } : g));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const { id: _omit, ...fields } = updates;
      const response = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const json = await throwIfNotOk(response, 'Failed to update goal') as { data: never };
      const saved = normalizeGoal(json.data);
      setGoals(prevList => prevList.map(g => g.id === id ? saved : g));
    } catch (error) {
      console.error('updateGoal failed:', error);
      if (prev) setGoals(prevList => prevList.map(g => g.id === id ? prev : g));
      throw error;
    }
  }, [goals, normalizeGoal, status]);

  const deleteGoal = useCallback(async (id: string) => {
    const prev = goals;
    setGoals(prevList => prevList.filter(g => g.id !== id));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const response = await fetch(`/api/goals/${id}`, {
        method: 'DELETE',
      });
      await throwIfNotOk(response, 'Failed to delete goal');
    } catch (error) {
      console.error('deleteGoal failed:', error);
      setGoals(prev);
      throw error;
    }
  }, [goals, status]);

  const updateGoalProgress = useCallback(async (id: string, value: number) => {
    const prev = goals.find(g => g.id === id);
    const target = prev?.targetValue ?? value;
    const clamped = Math.min(target, Math.max(0, value));
    setGoals(prevList => prevList.map(g => {
      if (g.id !== id) return g;
      return { ...g, currentValue: clamped, status: clamped >= g.targetValue ? 'COMPLETED' : 'ACTIVE' };
    }));

    if (status !== 'authenticated' || id.startsWith('local-')) {
      return;
    }

    try {
      const response = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue: clamped }),
      });
      const json = await throwIfNotOk(response, 'Failed to update goal progress') as { data: never };
      const saved = normalizeGoal(json.data);
      setGoals(prevList => prevList.map(g => g.id === id ? saved : g));
    } catch (error) {
      console.error('updateGoalProgress failed:', error);
      if (prev) setGoals(prevList => prevList.map(g => g.id === id ? prev : g));
      throw error;
    }
  }, [goals, normalizeGoal, status]);

  // ── Day Meta ─────────────────────────────────────────────────────────────────
  const getDayMeta = useCallback((date: string): DayMeta => {
    return dayMeta[date] || { date, dayType: 'NORMAL', contextTags: [] };
  }, [dayMeta]);

  const setDayMeta = useCallback((date: string, meta: Partial<DayMeta>) => {
    setDayMetaMap(prev => ({
      ...prev,
      [date]: { ...(prev[date] || { date, dayType: 'NORMAL' as DayType, contextTags: [] }), ...meta, date },
    }));
  }, []);

  // ── Undo ─────────────────────────────────────────────────────────────────────
  const pushUndo = useCallback((fn: () => void) => {
    setUndoStack(prev => [...prev.slice(-9), fn]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (!last) return prev;
      last();
      return prev.slice(0, -1);
    });
  }, []);

  return (
    <AppContext.Provider value={{
      habits, habitLogs, dataLoaded, dataError, reloadData,
      addHabit, updateHabit, archiveHabit, deleteHabit, logHabit, getLogForDate,
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

// Re-exported here so existing `import { useApp } from '@/context/AppContext'`
// code keeps working. New code should import from '@/context/useApp'.
export { useApp } from './useApp';

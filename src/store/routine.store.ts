/**
 * Routine zustand store.
 *
 * Holds the user's routine templates and the routine resolved for a specific
 * day. Reads/writes hit the real API routes:
 *   GET  /api/routine (templates), /api/routine/today?date=
 *   POST /api/routine (create template)
 *
 * Block completion is applied optimistically to the loaded day routine:
 * today's API surface has no routine-log endpoint wired up, so the patch is
 * kept in local store state.
 */

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import type { RoutineBlock, RoutineTemplate } from '@prisma/client';
import type {
  DayRoutine,
  DayRoutineBlock,
  RoutineLogStatus,
} from '@/types/routine';

export interface RoutineTemplateItem extends RoutineTemplate {
  blocks: RoutineBlock[];
  _count?: { blocks: number };
}

export type BlockLog = NonNullable<DayRoutineBlock['log']>;

export type RoutineDayType =
  | 'WORKDAY'
  | 'WEEKEND'
  | 'HOLIDAY'
  | 'EXAM_DAY'
  | 'LOW_ENERGY'
  | 'CUSTOM';

export interface CreateTemplateInput {
  name: string;
  description?: string;
  dayType: RoutineDayType;
  isDefault?: boolean;
  color?: string;
  icon?: string;
}

export interface LogBlockInput {
  date: string;
  status: RoutineLogStatus;
  actualStartTime?: string;
  actualEndTime?: string;
  durationMinutes?: number;
  focusRating?: number;
  productivityRating?: number;
  energyLevel?: number;
  note?: string;
}

interface RoutineState {
  templates: RoutineTemplateItem[];
  dayRoutine: DayRoutine | null;
  loading: boolean;
  error: string | null;
  fetchRoutineForDate: (date?: string) => Promise<DayRoutine>;
  fetchTemplates: () => Promise<RoutineTemplateItem[]>;
  createTemplate: (
    input: CreateTemplateInput
  ) => Promise<RoutineTemplateItem>;
  logBlockCompletion: (blockId: string, input: LogBlockInput) => void;
  clear: () => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function buildBlockLog(input: LogBlockInput): BlockLog {
  return {
    id: `local-${Date.now()}`,
    status: input.status,
    actualStartTime: input.actualStartTime ?? null,
    actualEndTime: input.actualEndTime ?? null,
    durationMinutes: input.durationMinutes ?? null,
    focusRating: input.focusRating ?? null,
    productivityRating: input.productivityRating ?? null,
    note: input.note ?? null,
  };
}

export const useRoutineStore = create<RoutineState>()((set, get) => ({
  templates: [],
  dayRoutine: null,
  loading: false,
  error: null,

  /**
   * Fetch the routine resolved for a given date (defaults to today) via
   * GET /api/routine/today.
   */
  fetchRoutineForDate: async (date) => {
    set({ loading: true, error: null });
    try {
      const routine = await apiRequest<DayRoutine>('/api/routine/today', {
        query: date ? { date } : {},
      });
      set({ dayRoutine: routine, loading: false });
      return routine;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch routine');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Fetch all routine templates via GET /api/routine.
   */
  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const templates = await apiRequest<RoutineTemplateItem[]>('/api/routine');
      set({ templates, loading: false });
      return templates;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch templates');
      set({ loading: false, error: message });
      throw err;
    }
  },

  createTemplate: async (input) => {
    set({ loading: true, error: null });
    try {
      const template = await apiRequest<RoutineTemplateItem>('/api/routine', {
        method: 'POST',
        body: input,
      });
      set((state) => ({
        templates: [template, ...state.templates],
        loading: false,
      }));
      return template;
    } catch (err) {
      const message = errorMessage(err, 'Failed to create template');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Optimistically attach a completion log to a block inside the currently
   * loaded day routine. There is no routine-log endpoint yet, so no network
   * call is made.
   */
  logBlockCompletion: (blockId, input) => {
    if (!get().dayRoutine) return;

    const log = buildBlockLog(input);
    set((state) => ({
      dayRoutine: state.dayRoutine
        ? {
            ...state.dayRoutine,
            blocks: state.dayRoutine.blocks.map((block) =>
              block.id === blockId ? { ...block, log } : block
            ),
          }
        : state.dayRoutine,
    }));
  },

  clear: () => {
    set({ templates: [], dayRoutine: null });
  },

  reset: () => {
    set({
      templates: [],
      dayRoutine: null,
      loading: false,
      error: null,
    });
  },
}));
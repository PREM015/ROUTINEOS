'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError, apiErrorMessage } from '@/lib/api-client';
import type { RoutineLogStatus } from '@/generated/prisma';
import type {
  ResolvedDailyRoutine,
  ResolvedRoutineBlock,
  ResolvedBlockLog,
} from '@/types/routine';

/**
 * The single fetch of `GET /api/routine/today` for `/routine`.
 *
 * ## Why this hook exists
 *
 * The page previously issued the request **twice**: once through
 * `AppContext`'s `routineBlocks` (`GET /api/routine`, every template, every
 * block, for every day type) and once through `RoutineList` for the selected
 * date's logs. Two consequences: the first answer had no logs in it, so the
 * second was not redundant but the page still could not be rendered from one
 * source; and the debug panel added a third, user-triggered one.
 *
 * One request, one payload, and every derived number on the page computed from
 * it. `AppContext`'s routine slice is no longer read here at all.
 *
 * ## Optimism
 *
 * A tick applies locally first and rolls back on failure. The rollback restores
 * the **previous log object**, not `null`: a block whose log the user never
 * touched must go back to having no log, and a block they had already filled in
 * must get their note and ratings back, not lose them to an error.
 */
export type RoutineDaySource = 'NATURAL' | 'EXCEPTION';

export interface RoutineDayLogInput {
  status?: RoutineLogStatus;
  note?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  focusRating?: number | null;
  productivityRating?: number | null;
  energyLevel?: number | null;
  /** Remove the log entirely rather than writing a status. */
  clear?: boolean;
}

export interface RoutineDay {
  data: ResolvedDailyRoutine | null;
  isLoading: boolean;
  /** Set only for a failed load. Never used to show the empty state. */
  error: string | null;
  refetch: () => Promise<void>;
  /** Write a log optimistically. Resolves to `false` if it had to be rolled back. */
  setLog: (blockId: string, input: RoutineDayLogInput) => Promise<boolean>;
  /** Block ids with a write in flight, for disabling their controls. */
  pendingBlockIds: readonly string[];
}

function replaceLog(
  blocks: ResolvedRoutineBlock[],
  blockId: string,
  log: ResolvedBlockLog | null
): ResolvedRoutineBlock[] {
  return blocks.map((block) => (block.id === blockId ? { ...block, log } : block));
}

export function useRoutineDay(date: string): RoutineDay {
  const [data, setData] = useState<ResolvedDailyRoutine | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingBlockIds, setPendingBlockIds] = useState<readonly string[]>([]);

  // The in-flight request for the *current* date. A response for a date the user
  // has already navigated away from is discarded rather than painted.
  const requestRef = useRef<AbortController | null>(null);

const load = useCallback(async () => {
    if (!date) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      // `apiRequest` unwraps the `{ success, data }` envelope, so what lands in
      // state is the resolved routine rather than the envelope.
      const resolved = await apiRequest<ResolvedDailyRoutine>('/api/routine/today', {
        query: { date },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setData(resolved ?? null);
      setIsLoading(false);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof DOMException && caught.name === 'AbortError') return;

      if (caught instanceof ApiError && caught.status === 0) {
        setError('You appear to be offline. This day may be out of date.');
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not load this day');
      }

      // Deliberately leave `data` alone. Swapping a good payload for `null` on a
      // failed refetch turns a transient blip into an empty schedule, and the
      // caller renders `error` instead of the empty state.
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/keyed data fetch
    void load();
    return () => {
      requestRef.current?.abort();
    };
  }, [load]);

  const setLog = useCallback(
    async (blockId: string, input: RoutineDayLogInput): Promise<boolean> => {
      // Snapshot *before* the optimistic write so the rollback is exact.
      const previousLog =
        data?.blocks.find((block) => block.id === blockId)?.log ?? null;

      setPendingBlockIds((current) =>
        current.includes(blockId) ? current : [...current, blockId]
      );

      // Optimistic: a status-only tick synthesises a log with just that status;
      // `null` is a real untick and means "no log at all".
      const optimisticLog: ResolvedBlockLog | null =
        input.clear === true
          ? null
          : {
              id: previousLog?.id ?? `optimistic-${blockId}`,
              status: input.status ?? previousLog?.status ?? 'COMPLETED',
              actualStartTime: input.actualStartTime ?? previousLog?.actualStartTime ?? null,
              actualEndTime: input.actualEndTime ?? previousLog?.actualEndTime ?? null,
              durationMinutes: previousLog?.durationMinutes ?? null,
              focusRating: input.focusRating ?? previousLog?.focusRating ?? null,
              productivityRating:
                input.productivityRating ?? previousLog?.productivityRating ?? null,
              energyLevel: input.energyLevel ?? previousLog?.energyLevel ?? null,
              note: input.note !== undefined ? input.note : (previousLog?.note ?? null),
            };

      setData((current) =>
        current ? { ...current, blocks: replaceLog(current.blocks, blockId, optimisticLog) } : current
      );

      try {
        // `setLog` is the write that must distinguish the three outcomes: saved,
        // refused (a closed retroactive window), or offline. It returns a
        // boolean rather than throwing so the optimistic rollback happens in
        // exactly one place.
        await apiRequest('/api/routine/today', {
          method: 'POST',
          body: { blockId, date, ...input },
        });

        setData((current) =>
          current ? { ...current, blocks: replaceLog(current.blocks, blockId, optimisticLog) } : current
        );
        return true;
      } catch (caught) {
        setData((current) =>
          current ? { ...current, blocks: replaceLog(current.blocks, blockId, previousLog) } : current
        );
        setError(
          caught instanceof ApiError && caught.status === 403
            ? caught.message
            : apiErrorMessage(caught instanceof ApiError ? { error: caught.message } : null, 'Not saved')
        );
        // Surfaced by the caller as a toast; the store keeps its own state clean.
        console.error('Failed to write routine log:', caught);
        return false;
      } finally {
        setPendingBlockIds((current) => current.filter((id) => id !== blockId));
      }
    },
    [data, date]
  );

  return {
    data,
    isLoading,
    error,
    refetch: load,
    setLog,
    pendingBlockIds,
  };
}

export default useRoutineDay;
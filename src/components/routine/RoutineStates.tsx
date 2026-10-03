'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CalendarOff, Coffee, RotateCw, WifiOff } from 'lucide-react';
import { Button, EmptyState, Skeleton, Select } from '@/components/ui';
import { PanelEmpty } from '@/components/today/ui';
import { cn } from '@/lib/utils';

/**
 * Every non-normal state `/routine` can be in.
 *
 * ## Why these are separate components and not `if`s in the page
 *
 * The plan for this page lists thirteen states, and the previous version had one
 * — a single `EmptyState` reading "No routine blocks yet" — which was rendered
 * for *every* reason there might be nothing to show: a failed load, a rest day,
 * a day type with no template, and a genuinely empty template all looked
 * identical. A user whose request timed out was told to go and add a block.
 *
 * Each of these is now visually distinct and says what actually happened, with
 * the action that makes sense for that state and no other.
 */

/** Timeline-shaped placeholder: a rail plus five block rows. */
export function TimelineSkeleton() {
  // Deliberately varied heights: five identical bars read as a loading spinner
  // that failed, whereas a stepped silhouette reads as "a schedule is coming".
  const rowHeights = ['h-14', 'h-11', 'h-16', 'h-12', 'h-9'];

  return (
    <div className="flex gap-4" aria-hidden="true">
      <div className="w-14 shrink-0 space-y-3 pt-1">
        {['06:00', '09:00', '12:00', '15:00', '18:00'].map((hour) => (
          <Skeleton key={hour} className="h-3 w-10 rounded" shine />
        ))}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {rowHeights.map((height) => (
          <div key={height} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" shine />
            <Skeleton className={cn('w-full rounded-xl', height)} shine />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder for the sticky rail. */
export function RailSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-28 w-full rounded-xl" shine />
      <Skeleton className="h-32 w-full rounded-xl" shine />
      <Skeleton className="h-20 w-full rounded-xl" shine />
    </div>
  );
}

/** Placeholder for the day-type strip. */
export function TabsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-2 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-10 w-28 shrink-0 rounded-xl" shine />
      ))}
    </div>
  );
}

export function RoutineLoadingState() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading your schedule…</span>
      <TimelineSkeleton />
    </div>
  );
}

/**
 * A failed load. **Never** the empty state.
 *
 * The distinction is the point: "we could not reach your schedule" and "you have
 * no blocks" call for opposite user actions, and collapsing them means a user
 * with a network problem is told to go and build a schedule they already have.
 */
export function RoutineErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const offline = /offline|network|reach/i.test(message);

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        {offline ? (
          <WifiOff size={20} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
        ) : (
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {offline ? "You appear to be offline" : "This day could not be loaded"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {message} Your schedule is still saved &mdash; nothing has been lost.
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={onRetry} className="shrink-0">
        <RotateCw size={14} />
        Try again
      </Button>
    </div>
  );
}

/** The day type has a template but no blocks. */
export function EmptyBlocksState({
  dayTypeName,
  onAdd,
  onCopyFrom,
  copyTargets,
}: {
  dayTypeName: string;
  onAdd: () => void;
  onCopyFrom?: (dayTypeId: string) => void;
  copyTargets?: Array<{ id: string; name: string; blockCount: number }>;
}) {
  return (
    <EmptyState
      icon={<CalendarOff size={28} />}
      title={`${dayTypeName} has no blocks yet`}
      description="Add your first time block and it will appear here, in time order."
      action={
        <div className="flex flex-col items-center gap-2">
          <Button variant="primary" onClick={onAdd}>
            Add your first block
          </Button>
          {copyTargets && copyTargets.length > 0 && onCopyFrom && (
            <Select
              label="Or copy blocks from another day"
              value=""
              onChange={(event) => onCopyFrom(event.target.value)}
              options={[
                { value: '', label: 'Copy from…' },
                ...copyTargets.map((target) => ({
                  value: target.id,
                  label: `${target.name} (${target.blockCount})`,
                })),
              ]}
              className="min-w-56"
            />
          )}
        </div>
      }
    />
  );
}

/**
 * No template at all for this day type.
 *
 * Distinct from the empty case: there is nothing to add *to* until a template
 * exists. The editor creates one on demand, so the fix is one tap either way —
 * but telling the user which of the two situations they are in is the difference
 * between "add a block" and "set this day up".
 */
export function NoTemplateState({
  dayTypeName,
  onSetUp,
}: {
  dayTypeName: string;
  onSetUp: () => void;
}) {
  return (
    <PanelEmpty
      icon={<CalendarOff size={22} />}
      title={`${dayTypeName} isn't set up yet`}
      description="This day type has no schedule at all. Create one and start adding blocks."
      action={
        <Button variant="primary" onClick={onSetUp}>
          Set up {dayTypeName}
        </Button>
      }
    />
  );
}

/**
 * A rest day.
 *
 * A positive state, not an error and not an absence. The blocks still render —
 * a user who scheduled sleep before marking a rest day should still see it —
 * but they are framed as a plan rather than a to-do list.
 */
export function RestDayBanner({
  reason,
  onChange,
  blocksRemaining,
}: {
  reason: string | null;
  onChange: () => void;
  blocksRemaining: number;
}) {
  return (
    <section
      aria-label="Rest day"
      className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <Coffee size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Rest day
            {reason ? <span className="text-muted-foreground"> — {reason}</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {blocksRemaining > 0
              ? `${blocksRemaining} block${blocksRemaining === 1 ? '' : 's'} still scheduled below, kept as a plan.`
              : 'Nothing scheduled today. Nothing is expected of you.'}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onChange} className="shrink-0">
        Change this day&apos;s type
      </Button>
    </section>
  );
}

/** The whole day is done. Calm, and with nothing to add to it. */
export function DayCompleteBanner({ onUndoLast }: { onUndoLast?: () => void }) {
  return (
    <section
      aria-label="Day complete"
      className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-foreground">
        <span className="font-medium">Day complete.</span>{' '}
        <span className="text-muted-foreground">Everything you planned is ticked off.</span>
      </p>
      {onUndoLast && (
        <Button variant="ghost" size="sm" onClick={onUndoLast} className="shrink-0">
          Undo last
        </Button>
      )}
    </section>
  );
}

/** Offline, but the page still has data on screen. */
export function OfflineNotice() {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground"
    >
      <WifiOff size={14} className="shrink-0 text-warning" aria-hidden="true" />
      You are offline. Ticks and edits will fail until you reconnect.
    </p>
  );
}

/** The read-only notice for a date outside the editable window. */
export function ReadOnlyNotice({ daysAgo, windowDays }: { daysAgo: number; windowDays: number }) {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      This day is {daysAgo} days back and your editing window is {windowDays} day
      {windowDays === 1 ? '' : 's'}, so it is read-only.
    </p>
  );
}

/** Generic footer for a section, kept here so spacing stays consistent. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}
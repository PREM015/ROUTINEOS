'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

/**
 * ## Daily check-in control
 *
 * A 44px target that fills and can be filled again.
 *
 * This is only safe to design as a satisfying interaction *because* the server
 * fix landed. The previous check-in wrote `status: 'COMPLETED'`, which is
 * terminal, so ticking a daily goal removed it from `findActiveInDateWindow` and
 * therefore from `/api/goals/today` for the rest of its window — the circle the
 * user had just clicked disappeared, and un-ticking was only possible from
 * `/today`. It was a one-way door, so it could not be animated as anything but a
 * confirmation.
 *
 * Now a daily goal stays `ACTIVE` for its whole window and "done today" means a
 * `GoalProgress` row exists for today. So:
 *
 * - the card **stays exactly where it is** after a tick;
 * - the undo is a real inverse, because undo *deletes* the row rather than
 *   appending a `0` (which would have left the day summing to 1 — read as done);
 * - the consistency strip's today-cell changes in the same commit.
 *
 * ### Motion
 *
 * Fill, then a single 1px settle. Nothing pulses, blooms or glows: this page's
 * motion vocabulary is "watch the trajectory assemble", and a check-off is a
 * position update, not an achievement. The reduced-motion path swaps the scale
 * for an opacity change so the state change still reads.
 */

export interface CheckInControlProps {
  done: boolean;
  /** True while this goal's request is in flight. Disables only this control. */
  busy?: boolean;
  onToggle: (next: boolean) => void;
  /** Used for the accessible name — "Mark Morning read done". */
  goalTitle: string;
  className?: string;
}

export function CheckInControl({
  done,
  busy = false,
  onToggle,
  goalTitle,
  className,
}: CheckInControlProps) {
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      onClick={(event) => {
        // The card is also clickable (it opens the drawer), so the check-in must
        // not double as "open this goal".
        event.stopPropagation();
        onToggle(!done);
      }}
      disabled={busy}
      aria-pressed={done}
      aria-label={done ? `Undo ${goalTitle} for today` : `Mark ${goalTitle} done for today`}
      className={cn(
        'relative grid h-11 w-11 shrink-0 place-items-center rounded-full',
        'border transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-wait disabled:opacity-60',
        'motion-reduce:transition-none',
        done
          ? 'border-transparent'
          : 'border-border hover:border-pace-ahead hover:bg-pace-ahead-wash',
        className
      )}
      style={done ? { background: 'var(--pace-ahead)' } : undefined}
    >
      {/*
        The ring wipe. `scale` rather than `width` so it animates on the
        compositor and never triggers layout — this control can be tapped in a
        long list.
      */}
      {!reduced && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2"
          style={{
            borderColor: 'var(--pace-ahead)',
            transformOrigin: 'center',
          }}
          initial={{ scale: 0.85, opacity: 0.5 }}
          animate={done ? { scale: 1, opacity: 0 } : { scale: 0.85, opacity: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
        />
      )}

      {/*
        The tick, stroke-drawn. `pathLength` gives the draw-on effect without
        measuring the path.
      */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center"
        initial={false}
      >
        <motion.span
          className="block"
          style={{ color: done ? 'var(--primary-foreground)' : 'var(--pace-idle)' }}
          initial={false}
        >
          <motion.svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            animate={reduced ? { opacity: done ? 1 : 0 } : { pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: 'easeOut' }}
          >
            <Check size={20} strokeWidth={3} />
          </motion.svg>
        </motion.span>
      </motion.span>

      {/*
        Idle affordance: a hollow ring, so the control reads as "something you
        can do here" before it is touched. `aria-hidden` — the button's own label
        already says what it does.
      */}
      {!done && (
        <span
          aria-hidden="true"
          className="absolute inset-[7px] rounded-full border border-dashed border-border"
        />
      )}

      {busy && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-spin rounded-full border-2 border-background"
          style={{ borderTopColor: 'var(--pace-ahead)' }}
        />
      )}
    </button>
  );
}
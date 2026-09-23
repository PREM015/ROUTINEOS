'use client';

/**
 * BreakNotification — prominent banner prompting the user to take a break.
 *
 * Shown when a long focus stretch is ending. Reports the time until the next
 * planned break (`nextBreakIn` minutes) and offers "Take a break now" plus a
 * dismiss action. Purely visual; the parent owns the timer logic that decides
 * when to render it.
 *
 * Usage:
 *   <BreakNotification nextBreakIn={2} onDismiss={hide} onTakeBreak={startBreak} />
 */

import { Coffee, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export interface BreakNotificationProps {
  /** Minutes until the scheduled break. 0/undefined means the break is due now. */
  nextBreakIn?: number;
  onDismiss: () => void;
  onTakeBreak?: () => void;
  className?: string;
}

export function BreakNotification({
  nextBreakIn,
  onDismiss,
  onTakeBreak,
  className,
}: BreakNotificationProps) {
  const dueNow = nextBreakIn === undefined || nextBreakIn <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      role="alert"
      aria-live="assertive"
      className={cn(
        'relative overflow-hidden rounded-2xl border shadow-lg',
        dueNow
          ? 'border-green-300 bg-gradient-to-r from-green-50 to-emerald-50'
          : 'border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
            dueNow ? 'bg-emerald-600' : 'bg-blue-600'
          )}
          aria-hidden="true"
        >
          <Coffee className="h-6 w-6 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-gray-900">
            {dueNow ? 'Break time!' : 'A break is coming up'}
          </h3>
          <p className="mt-0.5 text-sm text-gray-600">
            {dueNow
              ? 'You have been focusing for a long stretch. Stand up, stretch and recharge.'
              : nextBreakIn === 1
                ? `Your next break starts in 1 minute. Wrap up your current task.`
                : `Your next break starts in ${nextBreakIn} minutes. Wrap up your current task.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onTakeBreak && (
            <Button variant={dueNow ? 'success' : 'default'} onClick={onTakeBreak}>
              Take a break now
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss break reminder">
            <X className="h-4 w-4" />
            Dismiss
          </Button>
        </div>
      </div>

      {!dueNow && (
        <motion.div
          className="h-1.5 w-full"
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: (nextBreakIn ?? 0) * 60, ease: 'linear' }}
          style={{ backgroundColor: '#3b82f6' }}
        />
      )}
    </motion.div>
  );
}

export default BreakNotification;
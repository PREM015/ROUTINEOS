"use client";

/**
 * Onboarding wizard.
 *
 * Every step used to own a `useState` island and discard it in `onNext`, so the
 * whole flow was a pure animation: no timezone, sleep target, template, habit
 * or goal was ever written, while the final step told the user "Your RoutineOS
 * is configured." The state now lives here and each step persists as the user
 * advances, so what they typed is what the account has.
 *
 * Failures are surfaced per step rather than swallowed: a failed write shows an
 * error and keeps the user on the step so they can retry.
 */

import { useCallback, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { TimezoneStep } from '@/components/onboarding/TimezoneStep';
import { SleepStep } from '@/components/onboarding/SleepStep';
import { RoutineStep } from '@/components/onboarding/RoutineStep';
import { HabitStep } from '@/components/onboarding/HabitStep';
import { GoalStep } from '@/components/onboarding/GoalStep';
import { DashboardStep } from '@/components/onboarding/DashboardStep';
import { EASE } from '@/lib/motion';
import { apiRequest, ApiError } from '@/lib/api-client';

const MAX_STEP = 6;

/** Sensible fallbacks so the habit/goal rows satisfy the non-null columns. */
const DEFAULT_HABIT = {
  tier: 'GROWTH' as const,
  frequencyType: 'DAILY' as const,
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedSummary, setAppliedSummary] = useState<string[]>([]);
  const reduce = useReducedMotion();

  // ── Collected answers (previously thrown away on every step) ────────────────
  const [timezone, setTimezone] = useState<string>(
    () =>
      (typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : '') || 'UTC'
  );
  const [bedtime, setBedtime] = useState('22:00');
  const [waketime, setWaketime] = useState('06:00');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [habits, setHabits] = useState<string[]>(['', '', '']);
  const [goal, setGoal] = useState('');

  const goTo = (delta: number) => {
    setDirection(delta);
    setStep((current) => Math.min(MAX_STEP, Math.max(0, current + delta)));
  };

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiError ? err.message : fallback;

  // ── Step 1: timezone ───────────────────────────────────────────────────────
  const saveTimezone = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: { timezone },
      });
    } catch (err) {
      setError(message(err, 'Could not save your timezone.'));
      return;
    } finally {
      setSaving(false);
    }
    goTo(1);
  }, [timezone]);

  // ── Step 2: sleep targets ──────────────────────────────────────────────────
  const saveSleep = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // `targetBedtime` also drives the bedtime reminder, so enable it when
      // the user sets a target.
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: {
          targetBedtime: bedtime || null,
          targetWakeTime: waketime || null,
          ...(bedtime ? { sleepReminderTime: bedtime, sleepReminder: true } : {}),
        },
      });
    } catch (err) {
      setError(message(err, 'Could not save your sleep schedule.'));
      return;
    } finally {
      setSaving(false);
    }
    goTo(1);
  }, [bedtime, waketime]);

  // ── Step 3: routine template ───────────────────────────────────────────────
  const saveRoutine = useCallback(async () => {
    if (!templateId) {
      goTo(1);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/templates/use', {
        method: 'POST',
        body: { templateId },
      });
      setAppliedSummary((current) => [...current, 'Routine template']);
    } catch (err) {
      // A template is a nice-to-have; don't trap the user on this step.
      setError(
        `${message(err, 'Could not apply that template.')} You can pick one later from Templates.`
      );
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }
    goTo(1);
  }, [templateId]);

  // ── Step 4: habits ─────────────────────────────────────────────────────────
  const saveHabits = useCallback(async () => {
    const names = habits.map((h) => h.trim()).filter(Boolean);
    if (names.length === 0) {
      goTo(1);
      return;
    }

    setSaving(true);
    setError(null);
    const created: string[] = [];
    try {
      for (const name of names) {
        await apiRequest('/api/habits', {
          method: 'POST',
          body: { name, ...DEFAULT_HABIT },
        });
        created.push(name);
      }
    } catch (err) {
      // Keep whatever was created; report what failed.
      if (created.length > 0) {
        setAppliedSummary((current) => [
          ...current,
          `${created.length} habit${created.length === 1 ? '' : 's'}`,
        ]);
      }
      setError(
        `${message(err, 'Could not create a habit.')}${
          created.length > 0
            ? ` Created ${created.length} of ${names.length}.`
            : ''
        }`
      );
      setSaving(false);
      return;
    }

    setAppliedSummary((current) => [
      ...current,
      `${created.length} habit${created.length === 1 ? '' : 's'}`,
    ]);
    setSaving(false);
    goTo(1);
  }, [habits]);

  // ── Step 5: goal ───────────────────────────────────────────────────────────
  const saveGoal = useCallback(async () => {
    const title = goal.trim();
    if (!title) {
      goTo(1);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const now = new Date();
      const end = new Date(now.getTime());
      end.setMonth(end.getMonth() + 1);
      await apiRequest('/api/goals', {
        method: 'POST',
        body: {
          title,
          type: 'MONTHLY',
          targetValue: 1,
          startDate: now.toISOString(),
          endDate: end.toISOString(),
        },
      });
    } catch (err) {
      setError(message(err, 'Could not create your goal.'));
      setSaving(false);
      return;
    }

    setAppliedSummary((current) => [...current, '1 goal']);
    setSaving(false);
    goTo(1);
  }, [goal]);

  // ── Step 6: mark onboarding complete ────────────────────────────────────────
  const finish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/auth/complete-onboarding', { method: 'POST' });
    } catch (err) {
      setError(
        `${message(err, 'Could not finalise setup.')} You can continue anyway.`
      );
    } finally {
      setSaving(false);
    }
  }, []);

  const stepVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 48 : -48 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -48 : 48 }),
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 bg-background">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="gradient-mesh-animated absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />
      </div>
      {step > 0 && step < MAX_STEP && (
        <div className="relative mb-6 w-full max-w-2xl">
          <div className="h-2 overflow-hidden rounded-full bg-muted shadow-soft">
            <motion.div
              className="shimmer-active glow-primary h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${(step / MAX_STEP) * 100}%` }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </div>
        </div>
      )}

      <div className="relative w-full max-w-2xl rounded-2xl glass-panel glow-primary p-8 shadow-long sm:p-10">
        {error && (
          <div
            className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={reduce ? undefined : stepVariants}
            initial={reduce ? false : 'enter'}
            animate={reduce ? { opacity: 1 } : 'center'}
            exit={reduce ? undefined : 'exit'}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {step === 0 && (
              <WelcomeStep
                onNext={() => {
                  setError(null);
                  goTo(1);
                }}
              />
            )}
            {step === 1 && (
              <TimezoneStep
                timezone={timezone}
                onChange={setTimezone}
                onNext={() => void saveTimezone()}
                onBack={() => goTo(-1)}
                saving={saving}
              />
            )}
            {step === 2 && (
              <SleepStep
                bedtime={bedtime}
                waketime={waketime}
                onBedtimeChange={setBedtime}
                onWaketimeChange={setWaketime}
                onNext={() => void saveSleep()}
                onBack={() => goTo(-1)}
                saving={saving}
              />
            )}
            {step === 3 && (
              <RoutineStep
                selectedId={templateId}
                onSelect={setTemplateId}
                onNext={() => void saveRoutine()}
                onBack={() => goTo(-1)}
                saving={saving}
              />
            )}
            {step === 4 && (
              <HabitStep
                habits={habits}
                onChange={setHabits}
                onNext={() => void saveHabits()}
                onBack={() => goTo(-1)}
                saving={saving}
              />
            )}
            {step === 5 && (
              <GoalStep
                goal={goal}
                onChange={setGoal}
                onNext={() => void saveGoal()}
                onBack={() => goTo(-1)}
                saving={saving}
              />
            )}
            {step === 6 && (
              <DashboardStep
                appliedSummary={appliedSummary}
                error={error}
                saving={saving}
                onFinish={() => void finish()}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

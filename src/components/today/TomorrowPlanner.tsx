'use client';

import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, AlertCircle, Loader2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { GlassPanel } from '@/components/today/ui';
import { format } from 'date-fns';

interface TomorrowPlan {
  id: string;
  date: string;
  dayTypeId: string | null;
  dayType: string;
  status: 'PENDING' | 'SELECTED' | 'CONFIRMED' | 'SYNCED' | 'FALLBACK_APPLIED';
  isManual: boolean;
  selectedAt: string | null;
  confirmedAt: string | null;
  changedAt: string | null;
  previousDayTypeId: string | null;
  routineVersion: number;
  notificationsScheduled: boolean;
  localSynced: boolean;
  serverSynced: boolean;
  dayTypeName?: string | null;
  dayTypeColor?: string | null;
}

interface DayTypeOption {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
}

interface TomorrowPlannerProps {
  date: string;
}

export function TomorrowPlanner({ date }: TomorrowPlannerProps) {
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [dayTypes, setDayTypes] = useState<DayTypeOption[]>([]);
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchPlan();
  }, []);

  async function fetchPlan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/today/tomorrow-plan', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setPlan(json.data.plan);
        setDayTypes(json.data.availableDayTypes);
        if (json.data.plan?.dayTypeId) {
          setSelectedDayTypeId(json.data.plan.dayTypeId);
        }
      } else {
        setError(json.error || 'Failed to load plan');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect() {
    if (!selectedDayTypeId) return;
    setActionLoading('select');
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/today/tomorrow-plan/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dayTypeId: selectedDayTypeId }),
      });
      const json = await res.json();
      if (json.success) {
        setPlan(json.data.plan);
        setSuccess('Day type selected. Please confirm to generate tomorrow\'s routine.');
      } else {
        setError(json.error || 'Failed to select day type');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConfirm() {
    const dayTypeId = plan?.dayTypeId || selectedDayTypeId;
    if (!dayTypeId) return;
    setActionLoading('confirm');
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/today/tomorrow-plan/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dayTypeId }),
      });
      const json = await res.json();
      if (json.success) {
        setPlan(json.data.plan);
        setSuccess(`Tomorrow's routine generated! ${json.data.notificationsScheduled} notifications scheduled.`);
      } else {
        setError(json.error || 'Failed to confirm day type');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleChange() {
    if (!selectedDayTypeId || selectedDayTypeId === plan?.dayTypeId) return;
    setActionLoading('change');
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/today/tomorrow-plan/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dayTypeId: selectedDayTypeId }),
      });
      const json = await res.json();
      if (json.success) {
        setPlan(json.data.plan);
        setSuccess(`Day type changed! ${json.data.notificationsScheduled} notifications rescheduled.`);
      } else {
        setError(json.error || 'Failed to change day type');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <GlassPanel accent="planning" className="p-4 sm:p-5" aria-busy="true" aria-label="Loading tomorrow's plan">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading tomorrow&rsquo;s plan...</span>
        </div>
      </GlassPanel>
    );
  }

  // Falls back to the `date` prop (the day this planner was mounted on) rather
// than to `Date.now()`, so the heading names the day the parent asked about
// instead of a clock reading.
  const tomorrow = plan?.date ? new Date(plan.date) : new Date(date);
  const formattedDate = format(tomorrow, 'EEEE, MMMM d');
  const status = plan?.status || 'PENDING';

  const statusConfig: Record<
    TomorrowPlan['status'],
    { label: string; color: string; icon: React.ReactNode }
  > = {
    PENDING: { label: 'Pending selection', color: 'text-amber-600 bg-amber-500/10', icon: <Clock className="h-4 w-4" /> },
    SELECTED: { label: 'Selected - awaiting confirmation', color: 'text-blue-600 bg-blue-500/10', icon: <CheckCircle2 className="h-4 w-4" /> },
    CONFIRMED: { label: 'Confirmed & scheduled', color: 'text-emerald-600 bg-emerald-500/10', icon: <CheckCircle2 className="h-4 w-4" /> },
    SYNCED: { label: 'Synced with server', color: 'text-sky-600 bg-sky-500/10', icon: <CheckCircle2 className="h-4 w-4" /> },
    FALLBACK_APPLIED: { label: 'Fallback applied (no selection)', color: 'text-amber-600 bg-amber-500/10', icon: <AlertCircle className="h-4 w-4" /> },
  };

  const currentStatus = statusConfig[status] || statusConfig.PENDING;
  const selectedDayType = dayTypes.find(d => d.id === plan?.dayTypeId);

  return (
    <GlassPanel accent="planning" className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Plan Tomorrow</h3>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${currentStatus.color}`}>
          {currentStatus.icon}
          {currentStatus.label}
        </span>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-muted/50">
        <p className="text-sm font-medium text-foreground">{formattedDate}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Select and confirm tomorrow&rsquo;s DayType to generate routine blocks, sleep schedule, and notifications in advance.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm" role="status">
          {success}
        </div>
      )}

      <div className="space-y-4">
<div>
          <Select
            id="day-type-select"
            label="Tomorrow's DayType"
            value={selectedDayTypeId}
            onChange={(event) => setSelectedDayTypeId(event.target.value)}
            disabled={status === 'CONFIRMED' || status === 'SYNCED' || actionLoading !== null}
            placeholder="Select a DayType"
            options={dayTypes.map((dt) => ({
              value: dt.id,
              // The "(default)" hint lived inside the compound `SelectItem`
              // children. A native `<select>` renders text only, so it has to be
              // part of the option label or the hint is lost.
              label: dt.isDefault ? `${dt.name} (default)` : dt.name,
            }))}
          />
          {selectedDayType && (
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedDayType.slug === 'work-day' ? 'Typical work/school day schedule' :
               selectedDayType.slug === 'weekend' ? 'Weekend schedule with later start' :
               selectedDayType.slug === 'holiday' ? 'Holiday schedule - minimal blocks' :
               selectedDayType.slug === 'exam-day' ? 'Exam day - focused study blocks' :
               selectedDayType.slug === 'low-energy' ? 'Low energy day - lighter schedule' :
               'Custom day type'}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          {status === 'PENDING' && (
            <Button
              onClick={handleSelect}
              isLoading={actionLoading === 'select'}
              className="flex-1"
              disabled={!selectedDayTypeId}
            >
              Select DayType
            </Button>
          )}

          {status === 'SELECTED' && (
            <>
              <Button
                onClick={handleConfirm}
                isLoading={actionLoading === 'confirm'}
                className="flex-1"
              >
                Confirm & Generate Routine
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedDayTypeId('')}
                disabled={actionLoading !== null}
                className="flex-1"
              >
                Change Selection
              </Button>
            </>
          )}

          {(status === 'CONFIRMED' || status === 'SYNCED') && (
            <>
              <Button
                variant="outline"
                onClick={handleChange}
                isLoading={actionLoading === 'change'}
                className="flex-1"
                disabled={actionLoading !== null}
              >
                Change DayType
              </Button>
              <Button variant="ghost" disabled className="flex-1">
                {plan?.notificationsScheduled ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {plan.notificationsScheduled ? `${plan.routineVersion} routine blocks, notifications scheduled` : 'Routine ready'}
                  </>
                ) : (
                  'Routine generated'
                )}
              </Button>
            </>
          )}

          {status === 'FALLBACK_APPLIED' && (
            <Button
              onClick={handleChange}
              isLoading={actionLoading === 'change'}
              className="flex-1"
              disabled={actionLoading !== null}
            >
              Override Fallback
            </Button>
          )}
        </div>

        {(status === 'CONFIRMED' || status === 'SYNCED') && plan?.dayTypeId && (
          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-foreground mb-2">What&rsquo;s Ready for Tomorrow</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Routine blocks generated
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Sleep schedule configured
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {plan.notificationsScheduled ? 'Notifications scheduled' : 'Notifications pending'}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Habit reminders prepared
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Goal deadline reminders ready
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-muted/30">
        <div className="flex items-start gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>How it works:</strong> Select tomorrow&rsquo;s DayType today. Once confirmed, your routine blocks, sleep schedule, habit reminders, and goal notifications will be generated and scheduled automatically.</p>
            <p>You can change your selection before tomorrow begins. If you don&rsquo;t select by midnight, a fallback DayType will be applied based on the weekday.</p>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export default TomorrowPlanner;
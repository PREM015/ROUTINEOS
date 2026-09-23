'use client';

/**
 * Settings — Routine
 * Lists the user's routine templates (GET /api/routine) and creates a new
 * template (POST /api/routine). Templates are the building blocks that the
 * routine planner uses per day type.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Rows3, ShieldAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface RoutineTemplateRow {
  id: string;
  name: string;
  description: string | null;
  dayType: string;
  isDefault: boolean;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  estimatedDuration: number | null;
  createdAt: string;
  updatedAt: string;
}

const DAY_TYPE_OPTIONS = [
  { value: 'WORKDAY', label: 'Workday' },
  { value: 'WEEKEND', label: 'Weekend' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'EXAM_DAY', label: 'Exam day' },
  { value: 'LOW_ENERGY', label: 'Low energy' },
  { value: 'CUSTOM', label: 'Custom' },
];

const DAY_TYPE_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'default'> = {
  WORKDAY: 'primary',
  WEEKEND: 'success',
  HOLIDAY: 'warning',
  EXAM_DAY: 'warning',
  LOW_ENERGY: 'default',
  CUSTOM: 'default',
};

export default function RoutineSettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [templates, setTemplates] = useState<RoutineTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dayType, setDayType] = useState('CUSTOM');
  const [isDefault, setIsDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await apiRequest<RoutineTemplateRow[]>('/api/routine'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routine templates.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/routine', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          dayType,
          isDefault,
        },
      });
      setCreated(true);
      window.setTimeout(() => setCreated(false), 1600);
      setName('');
      setDescription('');
      setIsDefault(false);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create routine template.');
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  const variantFor = (dayType: string): 'primary' | 'success' | 'warning' | 'default' =>
    DAY_TYPE_COLORS[dayType] ?? 'default';

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Routine</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Templates used by the routine planner for different day types.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400" role="status">
          {notice}
        </div>
      )}

      <Card>
        <div className="flex items-center gap-2 border-b border-border px-6 py-4">
          <Rows3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Templates</h2>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : templates.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No routine templates yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {templates.map((template) => (
                <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg" aria-hidden="true">{template.icon ?? '🗓️'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{template.name}</p>
                        {template.isDefault && <Badge variant="primary">Default</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {template.description ?? 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={variantFor(template.dayType)}>{template.dayType}</Badge>
                    {template.estimatedDuration !== null && (
                      <span className="text-xs text-muted-foreground/60">
                        {template.estimatedDuration} min
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">Create template</h2>
        </div>
        <div className="space-y-4 p-6">
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Morning focus"
          />
          <Input
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this routine for?"
          />
          <Select
            label="Day type"
            value={dayType}
            onChange={(event) => setDayType(event.target.value)}
            options={DAY_TYPE_OPTIONS}
          />
          <div className="flex items-end">
            <Switch checked={isDefault} onChange={setIsDefault} label="Set as default template" />
          </div>
          <Button
            onClick={() => void create()}
            isLoading={creating}
            disabled={name.trim().length === 0}
          >
            Create template
          </Button>
          {created && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Template created
            </span>
          )}
        </div>
      </Card>
    </main>
  );
}
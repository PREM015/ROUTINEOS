'use client';

/**
 * Settings — Routine
 *
 * Full CRUD over the user's routine templates:
 *   GET    /api/routine              list
 *   POST   /api/routine              create
 *   PUT    /api/routine              update  (name / description / default)
 *   DELETE /api/routine              delete
 *
 * Previously this page could only create. `PUT` and `DELETE` were fully
 * implemented server-side but had no UI, and the `notice` banner was rendered
 * from a state variable that was only ever assigned `null` — an unreachable
 * element. The banner is now driven by real outcomes.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Pencil,
  Rows3,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_DAY_TYPES as DEFAULT_DAY_TYPE_DEFS } from '@/constants/day-types';
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

/**
 * Derived from the shared canonical definition, so the labels match the ones
 * /routine and /today show. This was a fourth, differently-cased copy
 * ("Workday", "Low energy") — exactly the drift that made the day-type pickers
 * look unsynced.
 */
const DAY_TYPE_OPTIONS = DEFAULT_DAY_TYPE_DEFS.map((dt) => ({
  value: dt.enumValue,
  label: dt.name,
}));

const DAY_TYPE_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'default'> = {
  WORKDAY: 'primary',
  WEEKEND: 'success',
  HOLIDAY: 'warning',
  EXAM_DAY: 'warning',
  LOW_ENERGY: 'default',
  CUSTOM: 'default',
};

type EditableTemplate = Pick<
  RoutineTemplateRow,
  'id' | 'name' | 'description' | 'isDefault'
>;

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

  const [editing, setEditing] = useState<EditableTemplate | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // Guarded: an unauthenticated visit used to fire a guaranteed-401 fetch that
  // could never be retried, leaving a permanent error banner.
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void load();
  }, [load, isAuthenticated]);
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
      setNotice(`Template “${name.trim()}” created.`);
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

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/routine', {
        method: 'PUT',
        body: {
          id: editing.id,
          name: editing.name.trim(),
          description: editing.description?.trim() || '',
          isDefault: editing.isDefault,
        },
      });
      setNotice(`Template “${editing.name.trim()}” updated.`);
      setEditing(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update template.');
    } finally {
      setSavingEdit(false);
    }
  };

  const makeDefault = async (template: RoutineTemplateRow) => {
    setBusyId(template.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/routine', {
        method: 'PUT',
        body: { id: template.id, isDefault: true },
      });
      setNotice(`“${template.name}” is now the default for ${template.dayType.toLowerCase().replace(/_/g, ' ')} days.`);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to set default template.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (template: RoutineTemplateRow) => {
    setBusyId(template.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/routine', {
        method: 'DELETE',
        body: { id: template.id },
      });
      setNotice(`Template “${template.name}” deleted.`);
      setConfirmDeleteId(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete template.');
    } finally {
      setBusyId(null);
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
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </Link>
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
        <div className="mb-6 flex items-start gap-2 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
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
              No routine templates yet. Create one below to get started.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {templates.map((template) => {
                const isEditing = editing?.id === template.id;
                return (
                  <li key={template.id} className="py-3">
                    {isEditing && editing ? (
                      <div className="space-y-3">
                        <Input
                          label="Name"
                          value={editing.name}
                          onChange={(event) =>
                            setEditing({ ...editing, name: event.target.value })
                          }
                        />
                        <Input
                          label="Description"
                          value={editing.description ?? ''}
                          onChange={(event) =>
                            setEditing({ ...editing, description: event.target.value })
                          }
                        />
                        <Switch
                          checked={editing.isDefault}
                          onChange={(checked) =>
                            setEditing({ ...editing, isDefault: checked })
                          }
                          label="Default for this day type"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => void saveEdit()}
                            isLoading={savingEdit}
                            disabled={editing.name.trim().length === 0}
                          >
                            Save changes
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(null)}
                            disabled={savingEdit}
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : confirmDeleteId === template.id ? (
                      <div className="space-y-2">
                        <p className="text-sm text-foreground">
                          Delete “{template.name}”? This also removes its routine
                          blocks and cannot be undone.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => void remove(template)}
                            isLoading={busyId === template.id}
                          >
                            Yes, delete it
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={busyId === template.id}
                          >
                            Keep it
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-lg" aria-hidden="true">
                            {template.icon ?? '🗓️'}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {template.name}
                              </p>
                              {template.isDefault && <Badge variant="primary">Default</Badge>}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {template.description ?? 'No description'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={variantFor(template.dayType)}>
                            {template.dayType}
                          </Badge>
                          {template.estimatedDuration !== null && (
                            <span className="text-xs text-muted-foreground/60">
                              {template.estimatedDuration} min
                            </span>
                          )}
                          {!template.isDefault && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void makeDefault(template)}
                              disabled={busyId === template.id}
                              isLoading={busyId === template.id}
                              title={`Use for ${template.dayType.toLowerCase().replace(/_/g, ' ')} days`}
                            >
                              <Star className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Make default
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditing({
                                id: template.id,
                                name: template.name,
                                description: template.description,
                                isDefault: template.isDefault,
                              })
                            }
                            disabled={busyId === template.id}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setConfirmDeleteId(template.id)}
                            disabled={busyId === template.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
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
            maxLength={100}
            helperText="Up to 100 characters."
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
        </div>
      </Card>
    </main>
  );
}

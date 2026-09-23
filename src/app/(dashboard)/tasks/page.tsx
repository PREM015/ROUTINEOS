'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskPriority, TaskStatus } from '@prisma/client';
import { CalendarDays, CheckCircle2, Circle, ListTodo, Plus } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import type { TaskListItem } from '@/types/projects';
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';

type Filter = 'OPEN' | 'TODAY' | 'OVERDUE' | 'COMPLETED';

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'OPEN', label: 'Open' },
  { id: 'TODAY', label: 'Due today' },
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'COMPLETED', label: 'Completed' },
];

const PRIORITY_VARIANT: Record<TaskPriority, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  LOW: 'default',
  MEDIUM: 'primary',
  HIGH: 'warning',
  URGENT: 'danger',
  CRITICAL: 'danger',
  PERSONAL: 'primary',
  ACADEMIC: 'primary',
  NON_PROFIT: 'primary',
  PROFESSIONAL: 'primary',
};

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Tasks Page
 * Browse, filter and complete tasks, plus quick-create new ones.
 */
export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<TaskListItem[]>('/api/tasks?limit=100');
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = tasks ?? [];
    return list.filter((task) => {
      const due = task.dueDate ? new Date(task.dueDate) : null;
      if (filter === 'COMPLETED') return task.status === 'COMPLETED';
      if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
      if (filter === 'TODAY') return due !== null && isToday(due);
      if (filter === 'OVERDUE') return due !== null && due < new Date() && !isToday(due);
      return true;
    });
  }, [tasks, filter]);

  const toggleComplete = async (task: TaskListItem) => {
    const next: TaskStatus = task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    setBusyId(task.id);
    try {
      await apiRequest(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: next } });
      setTasks((current) =>
        (current ?? []).map((item) => (item.id === task.id ? { ...item, status: next } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (title.trim().length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      await apiRequest('/api/tasks', {
        method: 'POST',
        body: {
          title: title.trim(),
          priority,
          ...(dueDate ? { dueDate: new Date(`${dueDate}T12:00:00`).toISOString() } : {}),
        },
      });
      setTitle('');
      setPriority('MEDIUM');
      setDueDate('');
      setDialogOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <ListTodo className="h-7 w-7 text-primary" />
            Tasks
          </h1>
          <p className="mt-2 text-muted-foreground">Capture, prioritize and check off your work.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New task
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            variant={filter === item.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!tasks ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10 text-muted-foreground/60" />}
          title="Nothing here"
          description="No tasks match this filter. Create one to get started."
          action={{ label: 'New task', onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <Card className="divide-y divide-border p-0">
          {filtered.map((task) => {
            const done = task.status === 'COMPLETED';
            return (
              <div key={task.id} className="flex items-start gap-3 p-4">
                <button
                  type="button"
                  onClick={() => void toggleComplete(task)}
                  disabled={busyId === task.id}
                  aria-pressed={done}
                  aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                  className="mt-0.5 text-muted-foreground/60 transition-colors hover:text-emerald-600 dark:text-emerald-400 disabled:opacity-50"
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={done ? 'text-muted-foreground/60 line-through' : 'text-foreground'}>
                    {task.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
                    {task.project && <span>{task.project.name}</span>}
                    {task.dueDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(new Date(task.dueDate))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New task"
        description="Add a task to your list."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()} isLoading={creating}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
          />
          <Select
            label="Priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
            options={PRIORITY_OPTIONS}
          />
          <Input
            label="Due date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}

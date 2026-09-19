'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { TaskPriority, TaskStatus } from '@prisma/client';
import { ArrowLeft, CalendarDays, GitBranch, ListTree, Tag, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import type { TaskWithRelations } from '@/types/projects';
import { Badge, Button, Card, Input, Select, Spinner } from '@/components/ui';

const STATUS_OPTIONS: ReadonlyArray<{ value: TaskStatus; label: string }> = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_OPTIONS: ReadonlyArray<{ value: TaskPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'CRITICAL', label: 'Critical' },
];

/**
 * Task Detail Page
 * View and edit a single task, its subtasks, dependencies and tags.
 */
export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<TaskWithRelations>(`/api/tasks/${id}`);
      setTask(data);
      setTitle(data.title);
      setStatus(data.status);
      setPriority(data.priority);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<TaskWithRelations>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: { title: title.trim(), status, priority },
      });
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' });
      router.push('/tasks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
      setDeleting(false);
    }
  };

  if (error && !task) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/tasks"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tasks
      </Link>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <Card className="p-6">
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              options={[...STATUS_OPTIONS]}
            />
            <Select
              label="Priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
              options={[...PRIORITY_OPTIONS]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {task.project && <Badge variant="primary">{task.project.name}</Badge>}
            {task.goal && <Badge variant="default">{task.goal.title}</Badge>}
            {task.dueDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Due {formatDate(new Date(task.dueDate))}
              </span>
            )}
            {task.tags.map(({ tag }) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5"
              >
                <Tag className="h-3 w-3" />
                {tag.name}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => void remove()}
              isLoading={deleting}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
            <Button onClick={() => void save()} isLoading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      </Card>

      {task.subtasks.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <ListTree className="h-5 w-5 text-blue-600" />
            Subtasks
          </h2>
          <ul className="space-y-2">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/tasks/${subtask.id}`} className="truncate text-gray-900 hover:underline">
                  {subtask.title}
                </Link>
                <Badge variant={subtask.status === 'COMPLETED' ? 'success' : 'default'}>
                  {subtask.status.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(task.dependsOn.length > 0 || task.blocks.length > 0) && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <GitBranch className="h-5 w-5 text-blue-600" />
            Dependencies
          </h2>
          {task.dependsOn.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Depends on
              </p>
              <ul className="space-y-1 text-sm">
                {task.dependsOn.map((dependency) => (
                  <li key={dependency.id} className="text-gray-700">
                    {dependency.dependsOn.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {task.blocks.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Blocks
              </p>
              <ul className="space-y-1 text-sm">
                {task.blocks.map((dependency) => (
                  <li key={dependency.id} className="text-gray-700">
                    {dependency.task.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

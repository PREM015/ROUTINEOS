"use client";

/**
 * AddProjectModal — a dialog form to create a project (name, description,
 * color, due date). Submits POST /api/projects and reports the created project
 * via `onCreated`.
 *
 * Usage:
 *   <AddProjectModal open={open} onOpenChange={setOpen} onCreated={refresh} />
 */
import * as React from 'react';
import { FolderKanban } from 'lucide-react';
import type { Project } from '@/generated/prisma';
import { apiRequest, extractFieldErrors } from '@/lib/api-client';
import { focusFirstInvalidField } from '@/lib/utils';
import { Button, Input, Textarea } from '@/components/ui';
import Dialog from '@/components/ui/Dialog';
import ColorPicker from '@/components/ui/ColorPicker';
import { notifyGoalsDataChanged } from '@/lib/app-events';

export interface AddProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created project so lists can refresh. */
  onCreated: (project: Project) => void;
}

export default function AddProjectModal({ open, onOpenChange, onCreated }: AddProjectModalProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [color, setColor] = React.useState('#3b82f6');
  const [dueDate, setDueDate] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setName('');
    setDescription('');
    setColor('#3b82f6');
    setDueDate('');
    setErrors({});
    setError(null);
  };

  const create = async () => {
    if (creating) return;
    const trimmedName = name.trim();

    const nextErrors: Record<string, string> = {};
    if (trimmedName.length === 0) nextErrors.name = 'Project name is required';
    else if (trimmedName.length > 200)
      nextErrors.name = 'Project name must be 200 characters or less';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setError(null);
      focusFirstInvalidField();
      return;
    }

    setCreating(true);
    setErrors({});
    setError(null);
    try {
      const project = await apiRequest<Project>('/api/projects', {
        method: 'POST',
        body: {
          name: trimmedName,
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          color,
          ...(dueDate.length > 0 ? { endDate: dueDate } : {}),
        },
      });
      reset();
      onOpenChange(false);
      onCreated(project);
      notifyGoalsDataChanged();
    } catch (err) {
      const fieldErrors = extractFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        focusFirstInvalidField();
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create project');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!creating) onOpenChange(next);
      }}
      title="New project"
      description="Group goals and tasks under a project to track progress as a whole."
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void create()} isLoading={creating}>
            {!creating && <FolderKanban className="mr-1.5 h-4 w-4" />}
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Launch SEO refresh"
          maxLength={200}
          error={errors.name}
          autoFocus
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this project about?"
          rows={3}
          error={errors.description}
        />
        <ColorPicker label="Color" value={color} onChange={setColor} />
        <Input
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={errors.endDate}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
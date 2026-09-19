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
import type { Project } from '@prisma/client';
import { apiRequest } from '@/lib/api-client';
import { Button, Input, Textarea } from '@/components/ui';
import Dialog from '@/components/ui/Dialog';
import ColorPicker from '@/components/ui/ColorPicker';

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
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setName('');
    setDescription('');
    setColor('#3b82f6');
    setDueDate('');
    setError(null);
  };

  const create = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || creating) {
      setError('Project name is required');
      return;
    }
    if (trimmedName.length > 200) {
      setError('Project name must be 200 characters or less');
      return;
    }

    setCreating(true);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
          autoFocus
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this project about?"
          rows={3}
        />
        <ColorPicker label="Color" value={color} onChange={setColor} />
        <Input
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
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
"use client";

/**
 * TagManager — manages the authenticated user's global tag library.
 *
 * Loads the user's tags from GET /api/tags, creates new tags via
 * POST /api/tags and deletes them via DELETE /api/tags/[id]. Renders
 * loading / error / empty states and a tag creation form.
 *
 * Usage:
 *   <TagManager />
 */
import { useEffect, useState } from 'react';
import type { Tag } from '@prisma/client';
import { Plus, Tags } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Button, Card, EmptyState, Input, Spinner } from '@/components/ui';
import TagBadge from './TagBadge';

export default function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTags = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Tag[]>('/api/tags');
      setTags(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTags();
  }, []);

  const createTag = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await apiRequest<Tag>('/api/tags', {
        method: 'POST',
        body: { name: trimmed.slice(0, 50) },
      });
      setTags((prev) => [...prev, created]);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setCreating(false);
    }
  };

  const deleteTag = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setError(null);
    try {
      await apiRequest<unknown>(`/api/tags/${id}`, { method: 'DELETE' });
      setTags((prev) => prev.filter((tag) => tag.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Tags className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Tags</h2>
      </div>

      <form
        className="mb-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void createTag();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag name"
          aria-label="New tag name"
          maxLength={50}
          className="flex-1"
        />
        <Button
          type="submit"
          isLoading={creating}
          disabled={name.trim().length === 0}
          className="shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </form>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {tags.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-10 w-10 text-gray-300" />}
          title="No tags yet"
          description="Create your first tag to organize journal entries, habits, and tasks."
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <TagBadge
              key={tag.id}
              label={tag.name}
              color={tag.color}
              onRemove={() => {
                void deleteTag(tag.id);
              }}
            />
          ))}
        </div>
      )}

      {deletingId && (
        <p className="mt-3 text-xs text-gray-500" aria-live="polite">
          Deleting tag…
        </p>
      )}
    </Card>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { Modal } from '@/components/ui';
import { Button, Input, Switch, Textarea, ColorPicker } from '@/components/ui';
import { apiRequest, ApiError, apiErrorMessage } from '@/lib/api-client';
import { normalizeDayTypeSlug, previewDayTypeSlug } from '@/lib/routine/day-type-slug';
import type { DayTypeDefinition } from '@/types/routine';

/**
 * Create / edit / archive a day type, extracted from the page.
 *
 * The page previously carried ~140 lines of form state for a modal, which meant
 * the day-type form and the page's own re-render shared a single `editError`
 * that the page rendered *and* the modal rendered — so a failed save printed the
 * message twice.
 *
 * ## isDefault is sent on create
 *
 * It was not. The create payload omitted `isDefault` entirely, so the "Set as
 * default" switch was inert in create mode and worked only in edit mode — the
 * two modes disagreed about the same control.
 */
const FORM_ID = 'day-type-form';

export function DayTypeEditor({
  open,
  definition,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** `null` for create mode. */
  definition: DayTypeDefinition | null;
  /** The next sort order, so a new day type lands at the end of the strip. */
  nextSortOrder: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = definition !== null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#64748b');
  const [icon, setIcon] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (definition) {
      setName(definition.name);
      setDescription(definition.description ?? '');
      setColor(definition.color ?? '#64748b');
      setIcon(definition.icon ?? '');
      setSortOrder(definition.sortOrder);
      setIsDefault(definition.isDefault);
      return;
    }
    setName('');
    setDescription('');
    setColor('#64748b');
    setIcon('');
    setSortOrder(nextSortOrder);
    setIsDefault(false);
  }, [open, definition, nextSortOrder]);

  const counts = definition?._count;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // One guard for both buttons. The create path had none, so double-clicking
    // "Create Day Type" fired two POSTs and the second failed with "a day type
    // with this slug already exists".
    if (submitting) return;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      color,
      icon: icon.trim() || null,
      sortOrder,
      ...(isEdit && { isDefault }),
      ...(!isEdit && { slug: normalizeDayTypeSlug(name), isDefault }),
    };

    try {
      await apiRequest(isEdit ? `/api/day-types/${definition.id}` : '/api/day-types', {
        method: isEdit ? 'PUT' : 'POST',
        body: payload,
      });
      onSaved(isEdit ? 'Day type saved' : 'Day type created');
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? apiErrorMessage({ error: caught.message }, 'Could not save this day type')
          : 'Could not save this day type'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const setArchived = async (isArchived: boolean) => {
    if (!definition) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/day-types/${definition.id}`, {
        method: 'PUT',
        body: { isArchived },
      });
      onSaved(isArchived ? 'Day type archived' : 'Day type restored');
      onClose();
    } catch (caught) {
      // "Cannot archive a default day type" and "Cannot archive your only active
      // day type" both arrive here and are both things the user asked for
      // directly, so the message is shown verbatim rather than replaced.
      setError(
        caught instanceof ApiError
          ? apiErrorMessage({ error: caught.message }, 'Could not update this day type')
          : 'Could not update this day type'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? 'Edit day type' : 'Create day type'}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {isEdit && !definition.isArchived && (
            <Button
              type="button"
              variant="danger"
              onClick={() => void setArchived(true)}
              disabled={submitting}
            >
              <Archive size={14} className="mr-1" />
              Archive
            </Button>
          )}
          {isEdit && definition.isArchived && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void setArchived(false)}
              disabled={submitting}
            >
              <ArchiveRestore size={14} className="mr-1" />
              Restore
            </Button>
          )}
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={submitting}>
            {isEdit ? 'Save changes' : 'Create day type'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. College day"
          required
          autoFocus
          // The slug is the value the uniqueness constraint is enforced on, so
          // show it while typing rather than letting the user discover a
          // collision only after submitting.
          helperText={
            !isEdit && name.trim()
              ? `Saved as "${previewDayTypeSlug(name) || '—'}"`
              : undefined
          }
        />
        <Textarea
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is this day type for?"
          rows={2}
        />
        <ColorPicker label="Colour" value={color} onChange={setColor} />
        <Input
          label="Icon (emoji)"
          value={icon}
          onChange={(event) => setIcon(event.target.value)}
          placeholder="📚"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            type="number"
            label="Sort order"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number.parseInt(event.target.value, 10) || 0)}
            min={0}
          />
          <div className="flex items-end pb-1">
            <Switch checked={isDefault} onChange={setIsDefault} label="Set as default" />
          </div>
        </div>

        {isEdit && counts && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            In use by {counts.routineTemplates} template
            {counts.routineTemplates === 1 ? '' : 's'}, {counts.habitAssignments} habit
            {counts.habitAssignments === 1 ? '' : 's'}, {counts.goalAssignments} goal
            {counts.goalAssignments === 1 ? '' : 's'} and {counts.routineExceptions} date
            {counts.routineExceptions === 1 ? '' : 's'}. Archiving keeps them linked; it only
            hides the day type from pickers.
          </p>
        )}

        {/* One error region. */}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
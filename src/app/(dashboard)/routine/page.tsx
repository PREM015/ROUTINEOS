'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarRange, Plus, Pencil, Trash2 } from 'lucide-react';
import RoutineList from '@/components/routine/RoutineList';
import AddRoutineBlockModal from '@/components/routine/AddRoutineBlockModal';
import RoutineScheduleDebug from '@/components/routine/RoutineScheduleDebug';
import { useApp } from '@/context/AppContext';
import { Button, Input, Modal, ColorPicker, Switch } from '@/components/ui';
import { fetchWithAuth } from '@/lib/api-client';
import { slugToDayType } from '@/constants/routine';
import { DEFAULT_DAY_TYPES as DEFAULT_DAY_TYPE_DEFS } from '@/constants/day-types';
import type { DayType } from '@/generated/prisma';
import type { DayTypeDefinition, DayTypeOption } from '@/types/routine';



/**
 * Last-resort tab list, used only when the account genuinely has no
 * `DayTypeDefinition` rows (e.g. every one archived or deleted).
 *
 * These were a third, differently-named copy of the defaults — "Weekday" and
 * "Low Energy" here versus "Work Day" and "Low Energy Day" in the seed script
 * and the picker — which is part of why the two screens looked unsynced. It now
 * reads the single shared definition. New accounts never hit this path because
 * registration seeds the rows.
 */
const DEFAULT_DAY_TYPES: DayTypeOption[] = DEFAULT_DAY_TYPE_DEFS.map((dt) => ({
  value: dt.enumValue,
  label: dt.name,
  color: dt.color,
  icon: dt.icon,
}));

const FALLBACK_DAY_TYPES: DayTypeOption[] = DEFAULT_DAY_TYPES;

/** The submit button lives in the modal's pinned footer, so it targets the form by id. */
const DAY_TYPE_FORM_ID = 'day-type-form';

export default function RoutinePage() {
  const { selectedRoutineTab, setSelectedRoutineTab, routineBlocks } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [dayTypes, setDayTypes] = useState<DayTypeDefinition[]>([]);
  const [dayTypeError, setDayTypeError] = useState<string | null>(null);
  const [dayTypeLoading, setDayTypeLoading] = useState(true);
  const [editDayType, setEditDayType] = useState<DayTypeDefinition | null>(null);
  const [isCreatingDayType, setIsCreatingDayType] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('#64748b');
  const [editIcon, setEditIcon] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const loadDayTypes = useCallback(async () => {
    try {
      setDayTypeLoading(true);
      const res = await fetchWithAuth('/api/day-types');
      if (res.ok) {
        const json = await res.json();
        // The endpoint returns archived rows too so they stay visible (and
        // restorable) in the management table; the filters below derive the
        // active subset for tabs and pickers.
        setDayTypes(json.data || []);
      } else {
        setDayTypeError('Failed to load day types');
      }
    } catch (error) {
      setDayTypeError('Failed to load day types');
      console.error('Failed to load day types:', error);
    } finally {
      setDayTypeLoading(false);
    }
  }, []);

  // Fetch day types on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void loadDayTypes();
  }, [loadDayTypes]);

  const handleCreateDayType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      const slug = editName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const res = await fetchWithAuth('/api/day-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          slug,
          description: editDescription.trim() || undefined,
          color: editColor,
          icon: editIcon.trim() || undefined,
          sortOrder: editSortOrder,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create day type');
      }

      await loadDayTypes();
      closeEditModal();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to create day type');
    }
  };

  const handleUpdateDayType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDayType || !editName.trim()) return;

    setEditSubmitting(true);
    setEditError(null);

    try {
      const res = await fetchWithAuth(`/api/day-types/${editDayType.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          color: editColor,
          icon: editIcon.trim() || undefined,
          isDefault: editIsDefault,
          sortOrder: editSortOrder,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update day type');
      }

      await loadDayTypes();
      closeEditModal();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update day type');
    } finally {
      setEditSubmitting(false);
    }
  };

  /**
   * Archive (soft delete), not remove. The service refuses to archive a default
   * day type or the last active one, and a hard delete would silently detach
   * templates, exceptions and habit assignments via `onDelete: SetNull`.
   */
  const handleDeleteDayType = async () => {
    if (!editDayType) return;

    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetchWithAuth(`/api/day-types/${editDayType.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to archive day type');
      }

      await loadDayTypes();
      closeEditModal();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to archive day type');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleUnarchiveDayType = async () => {
    if (!editDayType) return;

    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetchWithAuth(`/api/day-types/${editDayType.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to restore day type');
      }

      await loadDayTypes();
      closeEditModal();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to restore day type');
    } finally {
      setEditSubmitting(false);
    }
  };

  const openEditModal = (dt: DayTypeDefinition) => {
    setEditDayType(dt);
    setEditName(dt.name);
    setEditDescription(dt.description ?? '');
    setEditColor(dt.color || '#64748b');
    setEditIcon(dt.icon ?? '');
    setEditIsDefault(dt.isDefault);
    setEditSortOrder(dt.sortOrder);
    setEditError(null);
  };

  const openCreateModal = () => {
    setEditDayType(null);
    setIsCreatingDayType(true);
    setEditName('');
    setEditDescription('');
    setEditColor('#64748b');
    setEditIcon('');
    setEditIsDefault(false);
    setEditSortOrder(dayTypes.length);
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditDayType(null);
    setIsCreatingDayType(false);
    setEditName('');
    setEditDescription('');
    setEditColor('#64748b');
    setEditIcon('');
    setEditIsDefault(false);
    setEditError(null);
  };

  // Build tabs from day types (non-archived) + fallback to defaults.
  //
  // `value` is a *classification*, not an identity: every user-defined day type
  // ("Focus", "Evening", ...) classifies as 'CUSTOM', so any number of them can
  // share one value. Identity is the DayTypeDefinition row's stable `id`, which
  // is what the tab key and the picker's option value use.
  const activeDayTypes = dayTypes.filter(dt => !dt.isArchived);
  const toTabValue = (slug: string): DayType => slugToDayType(slug);
  // Fall back to `value` only for the built-in defaults, which have no row id
  // and whose values are distinct.
  const tabKey = (tab: DayTypeOption): string => tab.dayTypeId ?? tab.value;
  const tabs: DayTypeOption[] = activeDayTypes.length > 0
    ? activeDayTypes.map(dt => ({ dayTypeId: dt.id, value: toTabValue(dt.slug), label: dt.name, color: dt.color, icon: dt.icon }))
    : DEFAULT_DAY_TYPES;
  // The tab the modal opens on, so a block added from a specific tab keeps that
  // tab's day-type identity instead of the first row sharing its classification.
  const activeTab: DayTypeOption | undefined =
    tabs.find(tab => tab.dayTypeId && tab.value === selectedRoutineTab) ??
    tabs.find(tab => !tab.dayTypeId && tab.value === selectedRoutineTab);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Routine</h1>
          <p className="mt-1 text-sm text-muted-foreground">Shape your weekly rhythm and keep your day structured.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setModalOpen(true)} variant="primary">
            <Plus size={16} /> Add block
          </Button>
          <Button onClick={openCreateModal} variant="outline">
            <Plus size={16} /> Add Day Type
          </Button>
        </div>
      </div>

      {/* Day Type Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Routine day type">
        {dayTypeLoading ? (
          <div className="flex gap-2">
            {DEFAULT_DAY_TYPES.map((tab) => (
              <div key={tabKey(tab)} className="h-10 w-24 animate-pulse bg-muted rounded-xl" />
            ))}
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tabKey(tab)}
              className="flex items-center gap-1.5 group"
              role="presentation"
            >
              <button
                role="tab"
                aria-selected={selectedRoutineTab === tab.value}
                onClick={() => setSelectedRoutineTab(tab.value)}
                className={`rounded-xl border px-3 py-2 text-sm whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                  selectedRoutineTab === tab.value
                    ? 'border-primary/40 bg-primary/10 text-primary shadow-soft'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
                style={tab.color ? { borderColor: tab.color } : undefined}
              >
                {tab.icon && <span style={{ color: tab.color ?? undefined }}>{tab.icon}</span>}
                {tab.label}
              </button>
              {!dayTypeLoading && activeDayTypes.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const dt = tab.dayTypeId
                      ? activeDayTypes.find(d => d.id === tab.dayTypeId)
                      : undefined;
                    if (dt) openEditModal(dt);
                  }}
                  className="p-0.5 rounded hover:bg-muted transition opacity-0 group-hover:opacity-100"
                  aria-label={`Edit ${tab.label}`}
                >
                  <Pencil size={12} className="text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Day types are loaded from the API; a silent failure here would leave the
          tabs empty with no indication anything went wrong. */}
      {dayTypeError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {dayTypeError}. Day types may be unavailable.
        </p>
      )}

      <div className="glass-panel glow-primary rounded-2xl p-5 shadow-soft">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange size={16} className="text-primary" />
            {routineBlocks.filter((block) => block.dayType === selectedRoutineTab).length} blocks scheduled
          </div>
        </div>
        <RoutineList />
      </div>

      <AddRoutineBlockModal
        key={activeTab?.dayTypeId ?? activeTab?.value ?? selectedRoutineTab}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultDayType={activeTab?.value ?? selectedRoutineTab}
        defaultDayTypeId={activeTab?.dayTypeId}
        dayTypes={activeDayTypes.length > 0
          ? activeDayTypes.map(dt => ({
              value: toTabValue(dt.slug),
              label: dt.name,
              color: dt.color,
              icon: dt.icon,
              dayTypeId: dt.id,
            }))
          : FALLBACK_DAY_TYPES
        }
      />

      {/* Day Type Edit/Create Modal */}
      <Modal
        isOpen={!!editDayType || isCreatingDayType}
        onClose={closeEditModal}
        title={editDayType ? 'Edit Day Type' : 'Create Day Type'}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeEditModal} disabled={editSubmitting}>Cancel</Button>
            {editDayType && !editDayType.isArchived && (
              <Button type="button" variant="danger" onClick={handleDeleteDayType} disabled={editSubmitting}>
                <Trash2 size={14} className="mr-1" /> Archive
              </Button>
            )}
            {editDayType?.isArchived && (
              <Button type="button" variant="secondary" onClick={handleUnarchiveDayType} disabled={editSubmitting}>
                Restore
              </Button>
            )}
            <Button type="submit" form={DAY_TYPE_FORM_ID} variant="primary" disabled={editSubmitting}>
              {editSubmitting ? 'Saving...' : editDayType ? 'Save Changes' : 'Create Day Type'}
            </Button>
          </>
        }
      >
        <form id={DAY_TYPE_FORM_ID} onSubmit={editDayType ? handleUpdateDayType : handleCreateDayType} className="space-y-4">
          <Input
            label="Name"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="e.g. College Day"
            autoFocus
            error={editError ?? undefined}
          />
          <Input
            label="Description (optional)"
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            placeholder="What is this day type for?"
          />
          <ColorPicker
            label="Color"
            value={editColor}
            onChange={setEditColor}
          />
          <Input
            label="Icon (emoji or class)"
            value={editIcon}
            onChange={e => setEditIcon(e.target.value)}
            placeholder="📚 or lucide-icon-name"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="number"
              label="Sort Order"
              value={editSortOrder}
              onChange={e => setEditSortOrder(parseInt(e.target.value) || 0)}
              min="0"
            />
            <div className="flex items-end">
              <Switch checked={editIsDefault} onChange={setEditIsDefault} label="Set as default" />
            </div>
          </div>
          {editError && (
            <p role="alert" className="text-sm text-red-400">{editError}</p>
          )}
        </form>
      </Modal>

      <div className="mt-8">
        <RoutineScheduleDebug />
      </div>
    </div>
  );
}

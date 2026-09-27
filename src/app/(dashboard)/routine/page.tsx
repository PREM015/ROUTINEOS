'use client';

import { useState, useEffect } from 'react';
import { CalendarRange, Plus, Pencil, Trash2 } from 'lucide-react';
import RoutineList from '@/components/routine/RoutineList';
import AddRoutineBlockModal from '@/components/routine/AddRoutineBlockModal';
import RoutineScheduleDebug from '@/components/routine/RoutineScheduleDebug';
import { useApp } from '@/context/AppContext';
import { Button, Input, Modal, ColorPicker, Switch } from '@/components/ui';
import { fetchWithAuth } from '@/lib/api-client';
import { isDayType } from '@/constants/routine';
import type { DayType } from '@/generated/prisma';
import type { DayTypeDefinition, DayTypeOption } from '@/types/routine';



const DEFAULT_DAY_TYPES: DayTypeOption[] = [
  { value: 'WORKDAY', label: 'Weekday' },
  { value: 'WEEKEND', label: 'Weekend' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'EXAM_DAY', label: 'Exam Day' },
  { value: 'LOW_ENERGY', label: 'Low Energy' },
  { value: 'CUSTOM', label: 'Custom' },
];

const FALLBACK_DAY_TYPES: DayTypeOption[] = DEFAULT_DAY_TYPES;

export default function RoutinePage() {
  const { selectedRoutineTab, setSelectedRoutineTab, routineBlocks } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [dayTypes, setDayTypes] = useState<DayTypeDefinition[]>([]);
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

  // Fetch day types on mount
  useEffect(() => {
    loadDayTypes();
  }, []);

  const loadDayTypes = async () => {
    try {
      setDayTypeLoading(true);
      const res = await fetchWithAuth('/api/day-types');
      if (res.ok) {
        const json = await res.json();
        setDayTypes(json.data || []);
      }
    } catch (error) {
      console.error('Failed to load day types:', error);
    } finally {
      setDayTypeLoading(false);
    }
  };

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

  const handleDeleteDayType = async () => {
    if (!editDayType) return;

    try {
      const res = await fetchWithAuth(`/api/day-types/${editDayType.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete day type');
      }

      await loadDayTypes();
      closeEditModal();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to delete day type');
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
  // `value` is a *classification*, not an identity: `toTabValue` collapses every
  // slug that isn't a real DayType enum member to 'CUSTOM', so any number of
  // user-defined day types ("Focus", "Evening", ...) all map to 'CUSTOM'.
  // Keying the tabs by `value` therefore produced duplicate `CUSTOM` keys as
  // soon as a second non-enum day type existed. Identity is the DayType
  // row's stable `id`, so that is what the key uses; multiple CUSTOM-classified
  // day types remain perfectly valid, they just need distinct ids.
  const activeDayTypes = dayTypes.filter(dt => !dt.isArchived);
  const toTabValue = (slug: string): DayType => {
    const derived = slug.toUpperCase().replace(/-/g, '_');
    return isDayType(derived) ? derived : 'CUSTOM';
  };
  // Fall back to `value` only for the built-in defaults, which have no row id
  // and whose values are distinct.
  const tabKey = (tab: DayTypeOption): string => tab.dayTypeId ?? tab.value;
  const tabs: DayTypeOption[] = activeDayTypes.length > 0
    ? activeDayTypes.map(dt => ({ dayTypeId: dt.id, value: toTabValue(dt.slug), label: dt.name, color: dt.color, icon: dt.icon }))
    : DEFAULT_DAY_TYPES;

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
                    const dt = activeDayTypes.find(d => d.slug.toUpperCase().replace(/-/g, '_') === tab.value);
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultDayType={selectedRoutineTab}
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
      <Modal isOpen={!!editDayType || isCreatingDayType} onClose={closeEditModal} title={editDayType ? 'Edit Day Type' : 'Create Day Type'}>
        <form onSubmit={editDayType ? handleUpdateDayType : handleCreateDayType} className="space-y-4">
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
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={closeEditModal} disabled={editSubmitting}>Cancel</Button>
            {editDayType && (() => {
              const dt = activeDayTypes.find(d => d.id === editDayType.id);
              if (dt?._count && (dt._count.routineTemplates > 0 || dt._count.routineExceptions > 0 || dt._count.habitAssignments > 0)) {
                return (
                  <Button type="button" variant="danger" onClick={handleDeleteDayType} disabled={editSubmitting}>
                    <Trash2 size={14} className="mr-1" /> Archive
                  </Button>
                );
              }
              return null;
            })()}
            <Button type="submit" variant="primary" disabled={editSubmitting}>
              {editSubmitting ? 'Saving...' : editDayType ? 'Save Changes' : 'Create Day Type'}
            </Button>
          </div>
        </form>
      </Modal>

      <div className="mt-8">
        <RoutineScheduleDebug />
      </div>
    </div>
  );
}

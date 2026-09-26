'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Modal, Input, Select, Button, Textarea, Switch, ColorPicker } from '@/components/ui';

interface AddRoutineBlockModalProps {
  open: boolean;
  onClose: () => void;
  defaultDayType?: string;
}

const CATEGORIES = [
  'Health', 'GATE', 'DSA', 'Web Dev / AI', 'SSB', 'College', 'Personal', 'Work', 'Study'
];

const DAY_TYPES = [
  { value: 'WEEKDAY', label: 'Weekday' },
  { value: 'WEEKEND', label: 'Weekend' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'EXAM_DAY', label: 'Exam Day' },
  { value: 'LOW_ENERGY', label: 'Low Energy' },
  { value: 'CUSTOM', label: 'Custom' },
];

const ENERGY_OPTIONS = [
  { value: '', label: 'Default energy' },
  { value: 'HIGH', label: 'High energy' },
  { value: 'MEDIUM', label: 'Medium energy' },
  { value: 'LOW', label: 'Low energy' },
];

export default function AddRoutineBlockModal({ open, onClose, defaultDayType = 'WEEKDAY' }: AddRoutineBlockModalProps) {
  const { addRoutineBlock, routineBlocks } = useApp();
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('07:00');
  const [category, setCategory] = useState('Personal');
  const [dayType, setDayType] = useState(defaultDayType);
  const [trackCompletion, setTrackCompletion] = useState(true);
  const [description, setDescription] = useState('');
  const [energyLevel, setEnergyLevel] = useState('');
  const [color, setColor] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!title.trim()) e.title = 'Title is required';
    if (!startTime || !HH_MM.test(startTime)) e.startTime = 'Start time must be HH:mm';
    if (!endTime || !HH_MM.test(endTime)) e.endTime = 'End time must be HH:mm';

    // Overlap is a warning, not a blocker. Overnight blocks (end <= start)
    // are allowed and flagged by the server.
    const sameDayBlocks = routineBlocks.filter(b => b.dayType === dayType);
    const hasConflict = sameDayBlocks.some(b => {
      return startTime < b.endTime && endTime > b.startTime;
    });
    if (hasConflict) e.conflict = 'This block overlaps with an existing block — it will be flagged.';

    setErrors(e);
    return !e.title && !e.startTime && !e.endTime;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // sortOrder is per-day-type: new blocks go last within that tab.
      const siblingCount = routineBlocks.filter(b => b.dayType === dayType).length;
      const saved = await addRoutineBlock({
        dayType,
        startTime,
        endTime,
        title: title.trim(),
        category,
        sortOrder: siblingCount,
        trackCompletion,
        description: description.trim() || undefined,
        energyLevel: energyLevel === '' ? undefined : (energyLevel as 'HIGH' | 'MEDIUM' | 'LOW'),
        color: color.trim() || undefined,
      });
      if (saved.overlapWarning) {
        setErrors(prev => ({ ...prev, conflict: 'Saved with an overlap warning.' }));
      }

      // Reset
      setTitle('');
      setStartTime('06:00');
      setEndTime('07:00');
      setCategory('Personal');
      setDescription('');
      setEnergyLevel('');
      setColor('');
      setErrors({});
      setSubmitError(null);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create block');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Add Routine Block">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Morning Workout"
          error={errors.title}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start Time"
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            error={errors.startTime}
          />
          <Input
            label="End Time"
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            error={errors.endTime}
          />
        </div>

        <Select
          label="Category"
          value={category}
          onChange={e => setCategory(e.target.value)}
          options={CATEGORIES.map(c => ({ value: c, label: c }))}
        />

        <Select
          label="Day Type"
          value={dayType}
          onChange={e => setDayType(e.target.value)}
          options={DAY_TYPES}
        />

        <Select
          label="Energy Level"
          value={energyLevel}
          onChange={e => setEnergyLevel(e.target.value)}
          options={ENERGY_OPTIONS}
        />

        <Textarea
          label="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What is this block about?"
          rows={2}
        />

        <ColorPicker
          label="Color (optional)"
          value={color || '#64748b'}
          onChange={setColor}
        />

        <Switch checked={trackCompletion} onChange={setTrackCompletion} label="Track completion for this block" />

        {errors.conflict && (
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            ⚠ {errors.conflict}
          </p>
        )}

        {submitError && (
          <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {submitError}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting} className="flex-1">Cancel</Button>
          <Button type="submit" variant="default" disabled={submitting} className="flex-1">
            {submitting ? 'Adding...' : 'Add Block'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

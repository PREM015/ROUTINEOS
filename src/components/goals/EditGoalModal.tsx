'use client';

import React, { useEffect, useState } from 'react';
import { useApp, type Goal } from '@/context/AppContext';
import { Modal, Input, Select, Button, Textarea } from '@/components/ui';

interface EditGoalModalProps {
  goal: Goal | null;
  onClose: () => void;
}

export default function EditGoalModal({ goal, onClose }: EditGoalModalProps) {
  const { updateGoal } = useApp();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Goal['priority']>('MEDIUM');
  const [status, setStatus] = useState<Goal['status']>('ACTIVE');
  const [targetValue, setTargetValue] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [unit, setUnit] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? '');
      setPriority(goal.priority);
      setStatus(goal.status);
      setTargetValue(String(goal.targetValue));
      setCurrentValue(String(goal.currentValue));
      setUnit(goal.unit ?? '');
      setEndDate(goal.endDate);
      setError(null);
      setSaving(false);
    }
  }, [goal]);

  if (!goal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!title.trim()) { setError('Title is required'); return; }
    const target = parseFloat(targetValue);
    const current = parseFloat(currentValue || '0');
    if (goal.type !== 'DAILY' && (!(target > 0) || isNaN(target))) {
      setError('Target must be a positive number');
      return;
    }
    if (isNaN(current) || current < 0) { setError('Progress must be 0 or more'); return; }

    setSaving(true);
    setError(null);
    try {
      await updateGoal(goal.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        targetValue: goal.type === 'DAILY' ? 1 : target,
        currentValue: Math.min(current, goal.type === 'DAILY' ? 1 : target),
        unit: unit.trim() || undefined,
        endDate: endDate || goal.endDate,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!goal} onClose={onClose} title="Edit Goal">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Goal['priority'])}
            options={[
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
              { value: 'CRITICAL', label: 'Critical' },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Goal['status'])}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'ON_HOLD', label: 'Paused' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
        </div>

        {goal.type !== 'DAILY' && (
          <div className="grid grid-cols-3 gap-4">
            <Input label="Target" type="number" min="0" step="0.5" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
            <Input label="Progress" type="number" min="0" step="0.5" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
            <Input label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        )}

        <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

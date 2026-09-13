'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Modal, Input, Select, Button, Textarea } from '@/components/ui';
import { getTodayString } from '@/lib/dates';

interface AddGoalModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
}

export default function AddGoalModal({ open, onClose, defaultType = 'WEEKLY' }: AddGoalModalProps) {
  const { addGoal } = useApp();
  const today = getTodayString();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'WEEKLY' | 'MONTHLY' | 'YEARLY'>(defaultType);
  const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required';
    if (!targetValue || isNaN(Number(targetValue)) || Number(targetValue) <= 0)
      e.targetValue = 'Target must be a positive number';
    if (!endDate) e.endDate = 'End date is required';
    if (endDate && startDate >= endDate) e.endDate = 'End date must be after start date';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    addGoal({
      type,
      priority,
      status: 'ACTIVE',
      title: title.trim(),
      description: description.trim() || undefined,
      targetValue: parseFloat(targetValue),
      currentValue: 0,
      unit: unit.trim() || undefined,
      startDate,
      endDate,
    });

    setTitle(''); setDescription(''); setTargetValue(''); setUnit(''); setErrors({});
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Goal">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Goal Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Complete 5 LeetCode mediums"
          error={errors.title}
          autoFocus
        />

        <Textarea
          label="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Any additional context..."
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Type"
            value={type}
            onChange={e => setType(e.target.value as any)}
            options={[
              { value: 'WEEKLY', label: 'Weekly' },
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'YEARLY', label: 'Yearly' },
            ]}
          />
          <Select
            label="Priority"
            value={priority}
            onChange={e => setPriority(e.target.value as any)}
            options={[
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Target Value"
            type="number"
            min="0"
            step="0.5"
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            placeholder="e.g. 5"
            error={errors.targetValue}
          />
          <Input
            label="Unit (optional)"
            value={unit}
            onChange={e => setUnit(e.target.value)}
            placeholder="e.g. problems, pages, km"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start Date"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <Input
            label="End Date"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            error={errors.endDate}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1">Add Goal</Button>
        </div>
      </form>
    </Modal>
  );
}

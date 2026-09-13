'use client'

import React, { useState } from 'react';
import { Modal, Input, Select, Button } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { getTodayString } from '@/lib/dates';

interface AddHabitModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { label: 'Health', value: 'Health' },
  { label: 'Discipline', value: 'Discipline' },
  { label: 'Mind', value: 'Mind' },
  { label: 'Learning', value: 'Learning' },
  { label: 'Career', value: 'Career' },
  { label: 'Personal', value: 'Personal' },
  { label: 'Finance', value: 'Finance' },
  { label: 'Environment', value: 'Environment' },
  { label: 'Social', value: 'Social' },
  { label: 'Creativity', value: 'Creativity' },
];

export default function AddHabitModal({ open, onClose }: AddHabitModalProps) {
  const { addHabit } = useApp();
  const [name, setName] = useState('');
  const [tier, setTier] = useState('GROWTH');
  const [category, setCategory] = useState('Personal');
  const [frequencyType, setFrequencyType] = useState('DAILY');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addHabit({
      name: name.trim(),
      tier: tier as any,
      status: 'ACTIVE',
      category,
      frequencyType: frequencyType as any,
      frequencyValue: undefined,
      startDate: getTodayString(),
    });
    
    setName('');
    setTier('GROWTH');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add New Habit">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input 
          label="Habit Name" 
          value={name} 
          onChange={e => setName(e.target.value)} 
          placeholder="e.g. Morning Workout"
          required 
          autoFocus
        />
        
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Tier"
            value={tier}
            onChange={e => setTier(e.target.value)}
            options={[
              { label: 'Non-Negotiable', value: 'NON_NEGOTIABLE' },
              { label: 'Growth', value: 'GROWTH' },
              { label: 'Bonus', value: 'BONUS' }
            ]}
          />
          <Select
            label="Category"
            value={category}
            onChange={e => setCategory(e.target.value)}
            options={CATEGORIES}
          />
        </div>

        <Select
          label="Frequency"
          value={frequencyType}
          onChange={e => setFrequencyType(e.target.value)}
          options={[
            { label: 'Everyday', value: 'DAILY' },
            { label: 'Weekdays Only', value: 'WEEKDAYS' },
            { label: 'Weekends Only', value: 'WEEKENDS' },
          ]}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>Add Habit</Button>
        </div>
      </form>
    </Modal>
  );
}

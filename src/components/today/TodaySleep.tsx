'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';

interface SleepData {
  actualBedtime: string | null;
  actualWakeTime: string | null;
  actualDurationMinutes: number | null;
  quality: number | null;
  feltRested: boolean | null;
}

interface TodaySleepProps {
  date: string;
}

export function TodaySleep({ date }: TodaySleepProps) {
  const [sleep, setSleep] = useState<SleepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchSleep();
  }, [date]);

  async function fetchSleep() {
    try {
      const res = await fetch(`/api/sleep?date=${date}`);
      const data = await res.json();
      
      if (data.success && data.data) {
        setSleep(data.data);
      }
    } catch (error) {
      console.error('Error fetching sleep:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSleep(formData: {
    actualBedtime: string;
    actualWakeTime: string;
    quality?: number;
    feltRested?: boolean;
  }) {
    try {
      const res = await fetch('/api/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          ...formData,
        }),
      });

      if (res.ok) {
        fetchSleep();
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error saving sleep:', error);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Sleep</h3>
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {sleep ? 'Edit' : 'Log Sleep'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Sleep</DialogTitle>
            </DialogHeader>
            <SleepForm onSave={saveSleep} initialData={sleep} />
          </DialogContent>
        </Dialog>
      </div>

      {sleep ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Bedtime</p>
            <p className="text-xl font-semibold">{sleep.actualBedtime || '--:--'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Wake Time</p>
            <p className="text-xl font-semibold">{sleep.actualWakeTime || '--:--'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Duration</p>
            <p className="text-xl font-semibold">
              {sleep.actualDurationMinutes
                ? formatDuration(sleep.actualDurationMinutes)
                : '--'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Quality</p>
            <p className="text-xl font-semibold">
              {sleep.quality ? `${sleep.quality}/5` : '--'}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No sleep data logged</p>
        </div>
      )}
    </Card>
  );
}

function SleepForm({
  onSave,
  initialData,
}: {
  onSave: (data: any) => void;
  initialData: SleepData | null;
}) {
  const [formData, setFormData] = useState({
    actualBedtime: initialData?.actualBedtime || '',
    actualWakeTime: initialData?.actualWakeTime || '',
    quality: initialData?.quality || 3,
    feltRested: initialData?.feltRested || false,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Bedtime</label>
        <Input
          type="time"
          value={formData.actualBedtime}
          onChange={(e) =>
            setFormData({ ...formData, actualBedtime: e.target.value })
          }
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Wake Time</label>
        <Input
          type="time"
          value={formData.actualWakeTime}
          onChange={(e) =>
            setFormData({ ...formData, actualWakeTime: e.target.value })
          }
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Quality (1-5)
        </label>
        <Input
          type="number"
          min="1"
          max="5"
          value={formData.quality}
          onChange={(e) =>
            setFormData({ ...formData, quality: parseInt(e.target.value) })
          }
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="feltRested"
          checked={formData.feltRested}
          onChange={(e) =>
            setFormData({ ...formData, feltRested: e.target.checked })
          }
        />
        <label htmlFor="feltRested" className="text-sm">
          I felt rested
        </label>
      </div>

      <Button type="submit" className="w-full">
        Save Sleep Data
      </Button>
    </form>
  );
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
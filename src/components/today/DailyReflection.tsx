'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Slider } from '@/components/ui/Slider';

interface ReflectionData {
  energy: number | null;
  mood: number | null;
  stress: number | null;
  focus: number | null;
  reflectionText: string | null;
  biggestWin: string | null;
  biggestDifficulty: string | null;
}

interface DailyReflectionProps {
  date: string;
}

export function DailyReflection({ date }: DailyReflectionProps) {
  const [reflection, setReflection] = useState<ReflectionData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ReflectionData>({
    energy: 3,
    mood: 3,
    stress: 3,
    focus: 3,
    reflectionText: '',
    biggestWin: '',
    biggestDifficulty: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReflection();
  }, [date]);

  async function fetchReflection() {
    try {
      const res = await fetch(`/api/reflections?date=${date}`);
      const data = await res.json();
      
      if (data.success && data.data) {
        setReflection(data.data);
        setFormData(data.data);
      }
    } catch (error) {
      console.error('Error fetching reflection:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveReflection() {
    try {
      const res = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          ...formData,
        }),
      });

      if (res.ok) {
        fetchReflection();
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error saving reflection:', error);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!isEditing && !reflection) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Daily Reflection</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">Take a moment to reflect on your day</p>
          <Button onClick={() => setIsEditing(true)}>
            Start Reflection
          </Button>
        </div>
      </Card>
    );
  }

  if (isEditing) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">Daily Reflection</h3>

        <div className="space-y-6">
          {/* Energy */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Energy Level: {formData.energy}/5
            </label>
            <Slider
              value={[formData.energy || 3]}
              onValueChange={([value]) =>
                setFormData({ ...formData, energy: value })
              }
              min={1}
              max={5}
              step={1}
            />
          </div>

          {/* Mood */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Mood: {formData.mood}/5
            </label>
            <Slider
              value={[formData.mood || 3]}
              onValueChange={([value]) =>
                setFormData({ ...formData, mood: value })
              }
              min={1}
              max={5}
              step={1}
            />
          </div>

          {/* Stress */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Stress: {formData.stress}/5
            </label>
            <Slider
              value={[formData.stress || 3]}
              onValueChange={([value]) =>
                setFormData({ ...formData, stress: value })
              }
              min={1}
              max={5}
              step={1}
            />
          </div>

          {/* Focus */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Focus: {formData.focus}/5
            </label>
            <Slider
              value={[formData.focus || 3]}
              onValueChange={([value]) =>
                setFormData({ ...formData, focus: value })
              }
              min={1}
              max={5}
              step={1}
            />
          </div>

          {/* Biggest Win */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Biggest Win Today
            </label>
            <Textarea
              value={formData.biggestWin || ''}
              onChange={(e) =>
                setFormData({ ...formData, biggestWin: e.target.value })
              }
              placeholder="What went well today?"
              rows={2}
            />
          </div>

          {/* Biggest Difficulty */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Biggest Challenge
            </label>
            <Textarea
              value={formData.biggestDifficulty || ''}
              onChange={(e) =>
                setFormData({ ...formData, biggestDifficulty: e.target.value })
              }
              placeholder="What was difficult?"
              rows={2}
            />
          </div>

          {/* General Reflection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Overall Reflection
            </label>
            <Textarea
              value={formData.reflectionText || ''}
              onChange={(e) =>
                setFormData({ ...formData, reflectionText: e.target.value })
              }
              placeholder="Any other thoughts about today?"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={saveReflection} className="flex-1">
              Save Reflection
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setFormData(reflection || {
                  energy: 3,
                  mood: 3,
                  stress: 3,
                  focus: 3,
                  reflectionText: '',
                  biggestWin: '',
                  biggestDifficulty: '',
                });
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Daily Reflection</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
      </div>

      <div className="space-y-4">
        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 pb-4 border-b">
          <div className="text-center">
            <p className="text-sm text-gray-600">Energy</p>
            <p className="text-2xl font-bold">{reflection.energy || '-'}/5</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Mood</p>
            <p className="text-2xl font-bold">{reflection.mood || '-'}/5</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Stress</p>
            <p className="text-2xl font-bold">{reflection.stress || '-'}/5</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Focus</p>
            <p className="text-2xl font-bold">{reflection.focus || '-'}/5</p>
          </div>
        </div>

        {/* Wins and Challenges */}
        {reflection.biggestWin && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              Biggest Win
            </p>
            <p className="text-gray-900">{reflection.biggestWin}</p>
          </div>
        )}

        {reflection.biggestDifficulty && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              Biggest Challenge
            </p>
            <p className="text-gray-900">{reflection.biggestDifficulty}</p>
          </div>
        )}

        {reflection.reflectionText && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              Overall Reflection
            </p>
            <p className="text-gray-900">{reflection.reflectionText}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Slider } from '@/components/ui/Slider';

interface ReflectionData {
  energy: number | null;
  mood: number | null;
  stress: number | null;
  focus: number | null;
  reflectionText: string;
  biggestWin: string;
  biggestDifficulty: string;
  lessonsLearned: string;
  gratitude: string;
  improvements: string;
  tomorrowFocus: string;
}

interface DailyReflectionProps {
  date: string;
}

const EMPTY: ReflectionData = {
  energy: 3,
  mood: 3,
  stress: 3,
  focus: 3,
  reflectionText: '',
  biggestWin: '',
  biggestDifficulty: '',
  lessonsLearned: '',
  gratitude: '',
  improvements: '',
  tomorrowFocus: '',
};

function parseGratitude(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.join(', ');
    } catch {
      // plain string
    }
    return value;
  }
  return '';
}

function parsePriorities(value: unknown): string {
  if (Array.isArray(value)) return value.join('\n');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.join('\n');
    } catch {
      // plain string
    }
    return value;
  }
  return '';
}

export function DailyReflection({ date }: DailyReflectionProps) {
  const [saved, setSaved] = useState<ReflectionData | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ReflectionData>(EMPTY);
  const [prioritiesText, setPrioritiesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchReflection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reflections?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load reflection');
      if (data.success && data.data) {
        const d = data.data;
        const loaded: ReflectionData = {
          energy: d.energy ?? 3,
          mood: d.mood ?? 3,
          stress: d.stress ?? 3,
          focus: d.focus ?? 3,
          reflectionText: d.reflectionText ?? '',
          biggestWin: d.biggestWin ?? '',
          biggestDifficulty: d.biggestDifficulty ?? '',
          lessonsLearned: d.lessonsLearned ?? '',
          gratitude: parseGratitude(d.gratitude),
          improvements: d.improvements ?? '',
          tomorrowFocus: d.tomorrowFocus ?? '',
        };
        setSaved(loaded);
        setHasSaved(true);
        setFormData(loaded);
        setPrioritiesText(parsePriorities(d.tomorrowPriorities));
        setIsEditing(false);
      } else {
        // No saved reflection: show empty form defaults WITHOUT saving.
        setSaved(null);
        setHasSaved(false);
        setFormData(EMPTY);
        setPrioritiesText('');
        setIsEditing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reflection');
    } finally {
      setLoading(false);
    }
  }, [date]);

  // Load once per date. Saving happens ONLY via the Save button below.
  useEffect(() => {
    fetchReflection();
  }, [fetchReflection]);

  async function saveReflection() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const priorities = prioritiesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          energy: formData.energy ?? 3,
          mood: formData.mood ?? 3,
          stress: formData.stress ?? 3,
          focus: formData.focus ?? 3,
          reflectionText: formData.reflectionText || undefined,
          biggestWin: formData.biggestWin || undefined,
          biggestDifficulty: formData.biggestDifficulty || undefined,
          lessonsLearned: formData.lessonsLearned || undefined,
          gratitude: formData.gratitude || undefined,
          improvements: formData.improvements || undefined,
          tomorrowFocus: formData.tomorrowFocus || undefined,
          tomorrowPriorities: priorities.length > 0 ? priorities : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save reflection');
      setNotice('Reflection saved.');
      await fetchReflection();
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reflection');
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<ReflectionData>) =>
    setFormData((prev) => ({ ...prev, ...patch }));

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

  if (!isEditing && !hasSaved) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Daily Reflection</h3>
        </div>
        {error && <p role="alert" className="text-sm text-red-500 mb-3">{error}</p>}
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
    const sliders = [
      { key: 'energy' as const, label: 'Energy Level' },
      { key: 'mood' as const, label: 'Mood' },
      { key: 'stress' as const, label: 'Stress' },
      { key: 'focus' as const, label: 'Focus' },
    ];
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">Daily Reflection</h3>

        <div className="space-y-6">
          {sliders.map(({ key, label }) => (
            <div key={key}>
              <label htmlFor={`reflection-${key}`} className="block text-sm font-medium mb-2">
                {label}: {formData[key] ?? 3}/5
              </label>
              <Slider
                value={[formData[key] || 3]}
                onValueChange={([value]) => set({ [key]: value ?? 3 })}
                min={1}
                max={5}
                step={1}
              />
            </div>
          ))}

          <div>
            <label htmlFor="reflection-win" className="block text-sm font-medium mb-2">Biggest Win Today</label>
            <Textarea
              id="reflection-win"
              value={formData.biggestWin}
              onChange={(e) => set({ biggestWin: e.target.value })}
              placeholder="What went well today?"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="reflection-difficulty" className="block text-sm font-medium mb-2">Biggest Challenge</label>
            <Textarea
              id="reflection-difficulty"
              value={formData.biggestDifficulty}
              onChange={(e) => set({ biggestDifficulty: e.target.value })}
              placeholder="What was difficult?"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="reflection-text" className="block text-sm font-medium mb-2">Overall Reflection</label>
            <Textarea
              id="reflection-text"
              value={formData.reflectionText}
              onChange={(e) => set({ reflectionText: e.target.value })}
              placeholder="Any other thoughts about today?"
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="reflection-gratitude" className="block text-sm font-medium mb-2">Gratitude (optional)</label>
            <Textarea
              id="reflection-gratitude"
              value={formData.gratitude}
              onChange={(e) => set({ gratitude: e.target.value })}
              placeholder="What are you grateful for?"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="reflection-lessons" className="block text-sm font-medium mb-2">Lessons Learned (optional)</label>
            <Textarea
              id="reflection-lessons"
              value={formData.lessonsLearned}
              onChange={(e) => set({ lessonsLearned: e.target.value })}
              placeholder="What did you learn?"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="reflection-improvements" className="block text-sm font-medium mb-2">Improvements (optional)</label>
            <Textarea
              id="reflection-improvements"
              value={formData.improvements}
              onChange={(e) => set({ improvements: e.target.value })}
              placeholder="What would you do differently?"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="reflection-tomorrow" className="block text-sm font-medium mb-2">Tomorrow&apos;s Focus (optional)</label>
            <Textarea
              id="reflection-tomorrow"
              value={formData.tomorrowFocus}
              onChange={(e) => set({ tomorrowFocus: e.target.value })}
              placeholder="What is the main focus tomorrow?"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="reflection-priorities" className="block text-sm font-medium mb-2">
              Tomorrow&apos;s Priorities (optional, one per line)
            </label>
            <Textarea
              id="reflection-priorities"
              value={prioritiesText}
              onChange={(e) => setPrioritiesText(e.target.value)}
              placeholder={'Top priority\nSecond priority'}
              rows={3}
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button onClick={saveReflection} disabled={saving} className="flex-1">
              {saving ? 'Saving...' : 'Save Reflection'}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setIsEditing(false);
                setError(null);
                if (saved) {
                  setFormData(saved);
                } else {
                  setFormData(EMPTY);
                  setPrioritiesText('');
                }
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

      {notice && <p role="status" className="text-sm text-emerald-600 mb-3">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-500 mb-3">{error}</p>}

      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4 pb-4 border-b">
          {(['energy', 'mood', 'stress', 'focus'] as const).map((k) => (
            <div key={k} className="text-center">
              <p className="text-sm text-gray-600 capitalize">{k}</p>
              <p className="text-2xl font-bold">{saved?.[k] ?? '-'}/5</p>
            </div>
          ))}
        </div>

        {saved?.biggestWin && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Biggest Win</p>
            <p className="text-gray-900">{saved.biggestWin}</p>
          </div>
        )}

        {saved?.biggestDifficulty && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Biggest Challenge</p>
            <p className="text-gray-900">{saved.biggestDifficulty}</p>
          </div>
        )}

        {saved?.reflectionText && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Overall Reflection</p>
            <p className="text-gray-900">{saved.reflectionText}</p>
          </div>
        )}

        {saved?.gratitude && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Gratitude</p>
            <p className="text-gray-900">{saved.gratitude}</p>
          </div>
        )}

        {saved?.tomorrowFocus && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Tomorrow&apos;s Focus</p>
            <p className="text-gray-900">{saved.tomorrowFocus}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

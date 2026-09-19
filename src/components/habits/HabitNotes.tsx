'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Save, Loader2, StickyNote } from 'lucide-react';

interface HabitNotesProps {
  habitId: string;
}

interface NoteEntry {
  date: string;
  note: string;
}

/**
 * HabitNotes
 * Shows per-log notes from the habit's recent logs and lets the user
 * add/edit a note for today's log entry.
 */
export default function HabitNotes({ habitId }: HabitNotesProps) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [todayNote, setTodayNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load the habit's logs to extract notes ───────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/habits/${habitId}`);
        if (!res.ok) throw new Error('Failed to load habit');
        const json = await res.json();
        const logs: Array<{ date: string; note: string | null; status: string }> =
          json.data?.logs ?? [];

        const noteEntries: NoteEntry[] = logs
          .filter((l) => l.note)
          .map((l) => ({ date: l.date, note: l.note! }))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 20); // most recent 20 notes

        setNotes(noteEntries);

        // Pre-fill today's note if one exists
        const todayLog = logs.find((l) => l.date === today);
        if (todayLog?.note) setTodayNote(todayLog.note);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load notes');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [habitId, today]);

  // ── Save note for today's log ─────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/habits/${habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          status: 'COMPLETED',
          note: todayNote,
        }),
      });
      if (!res.ok) throw new Error('Failed to save note');

      // Update local notes list
      setNotes((prev) => {
        const updated = prev.filter((n) => n.date !== today);
        if (todayNote.trim()) {
          updated.unshift({ date: today, note: todayNote });
        }
        return updated;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-zinc-800/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Add/edit today's note ── */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Note for today — {format(new Date(), 'MMM d, yyyy')}
        </label>
        <textarea
          ref={textareaRef}
          value={todayNote}
          onChange={(e) => setTodayNote(e.target.value)}
          rows={3}
          placeholder="What do you want to remember about today's session?"
          className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-zinc-600"
        />

        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        {saved && <p className="mt-1 text-xs text-emerald-400">Note saved!</p>}

        <div className="mt-2 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !todayNote.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* ── Past notes ── */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Past Notes
        </h3>

        {notes.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center text-zinc-600">
            <StickyNote size={32} className="mb-2 opacity-40" />
            <p className="text-sm">No notes yet. Add one above after completing this habit.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {notes.map((entry) => (
              <li key={entry.date} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-xs text-zinc-500 mb-1.5">
                  {format(new Date(entry.date + 'T12:00:00'), 'EEEE, MMM d, yyyy')}
                </p>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{entry.note}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

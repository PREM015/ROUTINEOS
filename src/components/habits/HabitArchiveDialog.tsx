'use client';

import { useState } from 'react';

// ── Props for the default export (legacy interface) ───────────────────────────
export interface HabitArchiveDialogProps {
  habit: { id: string; name: string };
  open: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

/**
 * Default export — original interface used by existing code.
 * Kept intact for backwards compatibility.
 */
export default function HabitArchiveDialogDefault({ habit, open, onConfirm, onCancel }: HabitArchiveDialogProps) {
  const [reason, setReason] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-xl font-bold mb-2 text-gray-900">Archive Habit</h2>
        <p className="text-gray-600 mb-4">Are you sure you want to archive <strong>{habit.name}</strong>?</p>
        <label className="block mb-6">
          <span className="block text-sm font-medium text-gray-700 mb-2">Reason (Optional)</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full border rounded-md p-3 text-sm focus:ring-blue-500 focus:border-blue-500" rows={3} />
        </label>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition">Cancel</button>
          <button onClick={() => onConfirm(reason)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition">Archive Habit</button>
        </div>
      </div>
    </div>
  );
}

// ── Props for the named export used by HabitDetailClient ─────────────────────
interface HabitArchiveDialogNamedProps {
  habitId: string;
  habitName: string;
  onClose: () => void;
  onArchived: () => void;
}

/**
 * Named export — used by HabitDetailClient.
 * Calls /api/habits/[id]/archive and fires onArchived() on success.
 */
export function HabitArchiveDialog({ habitId, habitName, onClose, onArchived }: HabitArchiveDialogNamedProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habitId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to archive habit');
      onArchived();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground mb-2">Archive Habit</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Archive <strong className="text-foreground">{habitName}</strong>? Your history will be preserved.
        </p>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <label className="block mb-5">
          <span className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Reason (optional)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why are you archiving this habit?"
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? 'Archiving…' : 'Archive Habit'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp, RoutineBlock } from '@/context/AppContext';
import { Clock, Trash2, AlertTriangle, CheckCircle2, Circle, Pencil } from 'lucide-react';
import { EmptyState, Modal, Input, Button } from '@/components/ui';
import { timeToMinutes, getTodayString } from '@/lib/dates';

function hasConflict(a: RoutineBlock, b: RoutineBlock): boolean {
  if (a.id === b.id || a.dayType !== b.dayType) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  // Skip overnight blocks in conflict math (they wrap past midnight).
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && aEnd > bStart;
}

const CATEGORY_COLORS: Record<string, string> = {
  Health: 'bg-emerald-500/20 text-emerald-400',
  GATE: 'bg-blue-500/20 text-blue-400',
  DSA: 'bg-purple-500/20 text-purple-400',
  'Web Dev / AI': 'bg-cyan-500/20 text-cyan-400',
  SSB: 'bg-orange-500/20 text-orange-400',
  College: 'bg-yellow-500/20 text-yellow-400',
  Personal: 'bg-zinc-500/20 text-zinc-400',
  Work: 'bg-red-500/20 text-red-400',
  Study: 'bg-indigo-500/20 text-indigo-400',
};

interface DayLog {
  routineBlockId: string;
  status: string;
}

export default function RoutineList() {
  const { routineBlocks, deleteRoutineBlock, updateRoutineBlock, selectedRoutineTab, selectedDate } = useApp();
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const [editing, setEditing] = useState<RoutineBlock | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RoutineBlock | null>(null);
  const [dayLogs, setDayLogs] = useState<DayLog[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const today = selectedDate || getTodayString();

  // Clock reads happen after mount: no hydration mismatch.
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  // Load today's completion logs for these blocks.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/routine/today?date=${today}`);
        if (!res.ok) return;
        const json = await res.json();
        const logs: DayLog[] = [];
        const data = json?.data;
        const blocks = Array.isArray(data?.blocks) ? data.blocks : Array.isArray(data) ? data : [];
        for (const b of blocks) {
          const log = b?.log ?? b?.todayLog;
          if (log && (b.id || b.blockId)) {
            logs.push({ routineBlockId: b.id ?? b.blockId, status: log.status });
          }
        }
        if (!cancelled) setDayLogs(logs);
      } catch {
        // Offline or not ready: today toggles still work optimistically.
      }
    };
    load();
    return () => { cancelled = true; };
  }, [today, routineBlocks.length]);

  const filteredBlocks = useMemo(
    () => routineBlocks
      .filter(b => b.dayType === selectedRoutineTab)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [routineBlocks, selectedRoutineTab]
  );

  const loggedStatus = (id: string) => dayLogs.find(l => l.routineBlockId === id)?.status;

  const trackable = filteredBlocks.filter(b => b.trackCompletion);
  const doneCount = trackable.filter(b => loggedStatus(b.id) === 'COMPLETED').length;
  const progressPct = trackable.length > 0 ? Math.round((doneCount / trackable.length) * 100) : 0;

  const isCurrentBlock = (block: RoutineBlock) => {
    if (nowMinutes === null) return false;
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    if (end <= start) return nowMinutes >= start || nowMinutes < end;
    return nowMinutes >= start && nowMinutes < end;
  };
  const isPastBlock = (block: RoutineBlock) => {
    if (nowMinutes === null) return false;
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    if (end <= start) return false;
    return end < nowMinutes;
  };

  const openEdit = (block: RoutineBlock) => {
    setEditing(block);
    setEditTitle(block.title);
    setEditStart(block.startTime);
    setEditEnd(block.endTime);
    setEditError(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || editSaving) return;
    const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!editTitle.trim()) { setEditError('Title is required'); return; }
    if (!HH_MM.test(editStart) || !HH_MM.test(editEnd)) { setEditError('Times must be HH:mm'); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateRoutineBlock(editing.id, { title: editTitle.trim(), startTime: editStart, endTime: editEnd });
      setEditing(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const toggleDone = async (block: RoutineBlock) => {
    if (togglingId) return;
    const current = loggedStatus(block.id);
    const next = current === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
    setTogglingId(block.id);
    setActionError(null);
    // Optimistic update.
    setDayLogs(prev => {
      const rest = prev.filter(l => l.routineBlockId !== block.id);
      return [...rest, { routineBlockId: block.id, status: next }];
    });
    try {
      const res = await fetch('/api/routine/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id, date: today, status: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to log block');
      }
    } catch (err) {
      // Roll back.
      setDayLogs(prev => prev.filter(l => l.routineBlockId !== block.id));
      setActionError(err instanceof Error ? err.message : 'Failed to log block');
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDeleteBlock = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    setActionError(null);
    try {
      await deleteRoutineBlock(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete block');
    }
  };

  if (filteredBlocks.length === 0) {
    return (
      <EmptyState
        icon={<Clock size={28} />}
        title="No routine blocks yet"
        description="Add time blocks to build your schedule for this day type."
      />
    );
  }

  return (
    <div>
      {/* Day progress */}
      {trackable.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
            <span>Today&apos;s progress</span>
            <span>{doneCount}/{trackable.length} done · {progressPct}%</span>
          </div>
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5 }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
            />
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-400">{actionError}</p>
      )}

      <div className="relative pl-5 border-l border-border space-y-8 py-1 ml-2">
        <AnimatePresence>
          {filteredBlocks.map((block, idx) => {
            const current = isCurrentBlock(block);
            const past = isPastBlock(block);
            const status = loggedStatus(block.id);
            const done = status === 'COMPLETED';
            const conflict = filteredBlocks.some(b => hasConflict(block, b));
            const catColor = CATEGORY_COLORS[block.category || ''] || 'bg-zinc-700/20 text-zinc-400';
            const rawDuration = timeToMinutes(block.endTime) - timeToMinutes(block.startTime);
            const duration = rawDuration <= 0 ? rawDuration + 24 * 60 : rawDuration;
            const durationLabel = duration >= 60
              ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ''}`
              : `${duration}m`;

            return (
              <motion.div
                key={block.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ delay: Math.min(idx * 0.05, 0.3) }}
                className={`relative group ${past && !done ? 'opacity-40' : ''}`}
              >
                {/* Timeline dot */}
                <div className={`absolute -left-[26px] top-2 w-3 h-3 rounded-full border-2 transition-all ${
                  current
                    ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                    : past
                    ? 'bg-zinc-800 border-zinc-700'
                    : 'bg-muted border-muted-foreground/40 group-hover:border-muted-foreground'
                }`} />

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-0">
                      <Clock size={11} className="shrink-0" />
                      <span className="shrink-0">{block.startTime} – {block.endTime}</span>
                      <span className="text-zinc-700">{durationLabel}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {block.trackCompletion && (
                        <button
                          onClick={() => toggleDone(block)}
                          disabled={togglingId === block.id}
                          aria-label={done ? `Mark ${block.title} not done` : `Mark ${block.title} done`}
                          className={`p-1 rounded-md transition disabled:opacity-50 ${done ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'}`}
                          title={done ? 'Mark not done' : 'Mark done today'}
                        >
                          {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(block)}
                        className="p-1 rounded-md text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 transition"
                        title="Edit block"
                        aria-label={`Edit ${block.title}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(block)}
                        className="p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Delete block"
                        aria-label={`Delete ${block.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className={`text-sm font-semibold ${current ? 'text-emerald-400' : done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {block.title}
                    {current && <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">NOW</span>}
                    {done && <span className="ml-2 text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">DONE</span>}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {block.category && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catColor}`}>
                        {block.category}
                      </span>
                    )}
                    {conflict && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400">
                        <AlertTriangle size={10} /> Overlaps another block
                      </span>
                    )}
                    {block.overlapWarning && !conflict && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400">
                        <AlertTriangle size={10} /> Overlap warning
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Edit modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Block">
        <form onSubmit={saveEdit} className="space-y-4">
          <Input label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required autoFocus />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start" type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
            <Input label="End" type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
          </div>
          {editError && <p role="alert" className="text-sm text-red-400">{editError}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={editSaving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={editSaving}>{editSaving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete block?">
        <p className="text-sm text-zinc-400">
          &ldquo;{confirmDelete?.title}&rdquo; ({confirmDelete?.startTime} – {confirmDelete?.endTime}) will be removed permanently.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="primary" onClick={confirmDeleteBlock}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

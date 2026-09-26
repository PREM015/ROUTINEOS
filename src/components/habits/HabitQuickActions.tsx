"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, FastForward, PauseCircle, PlayCircle, Edit2, Archive } from "lucide-react";
import type { Habit } from "@/types/habit";

interface HabitQuickActionsProps {
  habit: Habit;
  onSkip: () => void;
  /** Optional parent hook to open the edit modal for this habit. */
  onEdit?: (habit: Habit) => void;
  /** Optional refetch hook called after any successful mutation. */
  onChanged?: () => void | Promise<void>;
}

export default function HabitQuickActions({ habit, onSkip, onEdit, onChanged }: HabitQuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<"pause" | "resume" | "archive" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const close = () => setIsOpen(false);

  const post = async (action: Exclude<typeof busy, null>, body?: Record<string, unknown>) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habit.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} habit`);
      await onChanged?.();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} habit`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habit.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to delete habit");
      await onChanged?.();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete habit");
    } finally {
      setBusy(null);
    }
  };

  const handleEdit = () => {
    if (!onEdit) return;
    onEdit(habit);
    close();
  };

  const isPaused = habit.status === "PAUSED";

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        aria-label="Habit actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-52 rounded-md border border-border bg-card shadow-floating z-10 py-1 text-sm overflow-hidden">
          <button
            onClick={() => { onSkip(); close(); }}
            className="w-full text-left px-4 py-2 text-foreground hover:bg-muted flex items-center space-x-2"
          >
            <FastForward size={16} />
            <span>Skip Today</span>
          </button>

          {!isPaused ? (
            <button
              onClick={() => post("pause", { reason: "Paused from habit menu" })}
              disabled={busy !== null}
              className="w-full text-left px-4 py-2 text-foreground hover:bg-muted flex items-center space-x-2 disabled:opacity-50"
            >
              <PauseCircle size={16} />
              <span>Pause Habit</span>
            </button>
          ) : (
            <button
              onClick={() => post("resume")}
              disabled={busy !== null}
              className="w-full text-left px-4 py-2 text-foreground hover:bg-muted flex items-center space-x-2 disabled:opacity-50"
            >
              <PlayCircle size={16} />
              <span>Resume Habit</span>
            </button>
          )}

          {onEdit && (
            <button
              onClick={handleEdit}
              className="w-full text-left px-4 py-2 text-foreground hover:bg-muted flex items-center space-x-2"
            >
              <Edit2 size={16} />
              <span>Edit</span>
            </button>
          )}

          <div className="border-t border-border my-1" />

          <button
            onClick={() => post("archive", { reason: "Archived from habit menu" })}
            disabled={busy !== null}
            className="w-full text-left px-4 py-2 text-foreground hover:bg-muted flex items-center space-x-2 disabled:opacity-50"
          >
            <Archive size={16} />
            <span>Archive</span>
          </button>

          <button
            onClick={remove}
            disabled={busy !== null}
            className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center space-x-2 disabled:opacity-50"
          >
            <span>Delete permanently</span>
          </button>

          {error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
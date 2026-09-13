'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp, RoutineBlock } from '@/context/AppContext';
import { Clock, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { timeToMinutes } from '@/lib/dates';

function hasConflict(a: RoutineBlock, b: RoutineBlock): boolean {
  if (a.id === b.id || a.dayType !== b.dayType) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
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

export default function RoutineList() {
  const { routineBlocks, deleteRoutineBlock, selectedRoutineTab } = useApp();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredBlocks = routineBlocks
    .filter(b => b.dayType === selectedRoutineTab)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Current time check
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isCurrentBlock = (block: RoutineBlock) => {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    return currentMinutes >= start && currentMinutes < end;
  };
  const isPastBlock = (block: RoutineBlock) => {
    return timeToMinutes(block.endTime) < currentMinutes;
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
    <div className="relative pl-5 border-l border-zinc-800 space-y-8 py-1 ml-2">
      <AnimatePresence>
        {filteredBlocks.map((block, idx) => {
          const current = isCurrentBlock(block);
          const past = isPastBlock(block);
          const conflict = filteredBlocks.some(b => hasConflict(block, b));
          const catColor = CATEGORY_COLORS[block.category || ''] || 'bg-zinc-700/20 text-zinc-400';
          const duration = timeToMinutes(block.endTime) - timeToMinutes(block.startTime);
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
              transition={{ delay: idx * 0.05 }}
              className={`relative group ${past ? 'opacity-40' : ''}`}
              onMouseEnter={() => setHoveredId(block.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Timeline dot */}
              <div className={`absolute -left-[26px] top-2 w-3 h-3 rounded-full border-2 transition-all ${
                current
                  ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                  : past
                  ? 'bg-zinc-800 border-zinc-700'
                  : 'bg-black border-zinc-600 group-hover:border-zinc-400'
              }`} />

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Clock size={11} />
                    <span>{block.startTime} – {block.endTime}</span>
                    <span className="text-zinc-700">{durationLabel}</span>
                  </div>
                  {hoveredId === block.id && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => deleteRoutineBlock(block.id)}
                      className="p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Delete block"
                    >
                      <Trash2 size={13} />
                    </motion.button>
                  )}
                </div>

                <div className={`text-sm font-semibold ${current ? 'text-emerald-400' : 'text-zinc-200'}`}>
                  {block.title}
                  {current && <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">NOW</span>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {block.category && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catColor}`}>
                      {block.category}
                    </span>
                  )}
                  {block.trackCompletion && <CheckCircle2 size={11} className="text-zinc-600" />}
                  {conflict && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400">
                      <AlertTriangle size={10} /> Conflict
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

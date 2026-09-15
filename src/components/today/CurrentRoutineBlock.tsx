'use client';

import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface CurrentRoutineBlockProps {
  block: { name: string; duration: number; timeRemaining: number } | null;
}

export function CurrentRoutineBlock({ block }: CurrentRoutineBlockProps) {
  if (!block) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-400">
        No active routine block
      </div>
    );
  }

  const progress = ((block.duration - block.timeRemaining) / block.duration) * 100;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{block.name}</h3>
        <div className="flex items-center gap-2 text-zinc-400">
          <Clock className="w-4 h-4" />
          <span>{Math.floor(block.timeRemaining / 60)}m left</span>
        </div>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: \`\${progress}%\` }}
          className="h-full bg-blue-500 rounded-full"
        />
      </div>
    </div>
  );
}

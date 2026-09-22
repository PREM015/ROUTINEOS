"use client";

import { RoutineBlock, RoutineLog } from "@/types/routine";
import RoutineBlockCard from "./RoutineBlock";
import RoutineConflictAlert from "./RoutineConflictAlert";
import { detectConflicts } from "@/lib/routine/conflict";
import { getCurrentBlock } from "@/lib/routine/duration";
import { useEffect, useState } from "react";

interface RoutineTimelineProps {
  blocks: RoutineBlock[];
  logs: RoutineLog[];
  onToggleCompletion: (blockId: string, isCompleted: boolean) => void;
}

export default function RoutineTimeline({ blocks, logs, onToggleCompletion }: RoutineTimelineProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const conflicts = blocks
    .flatMap((block) => detectConflicts(block, blocks))
    .filter(
      (conflict, index, all) =>
        all.findIndex(
          (c) =>
            c.message === conflict.message &&
            c.blockId1 === conflict.blockId1 &&
            c.blockId2 === conflict.blockId2
        ) === index
    );
  const currentTime = now.toTimeString().slice(0, 5);
  const currentBlock = getCurrentBlock(blocks, currentTime);

  return (
    <div className="space-y-6">
      {conflicts.length > 0 && (
        <RoutineConflictAlert conflicts={conflicts} blocks={blocks} />
      )}
      
      <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-4 space-y-6 pb-4">
        {blocks.map(block => {
          const log = logs.find(l => l.routineBlockId === block.id);
          const isCompleted = log?.status === 'COMPLETED';
          const isCurrent = currentBlock?.id === block.id;

          return (
            <div key={block.id} className="relative pl-6">
              {/* Timeline dot */}
              <div className={`absolute -left-[9px] top-4 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 ${
                isCompleted ? 'bg-green-500' : isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'
              }`} />
              
              <RoutineBlockCard 
                block={block} 
                isCompleted={isCompleted} 
                isCurrent={isCurrent}
                onToggle={() => onToggleCompletion(block.id, !isCompleted)} 
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

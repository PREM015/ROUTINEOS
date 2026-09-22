"use client";

import { RoutineBlock } from "@/types/routine";
import { calculateBlockDuration, formatDuration } from "@/lib/routine/duration";
import RoutineCompletionToggle from "./RoutineCompletionToggle";
import { Clock } from "lucide-react";

interface RoutineBlockCardProps {
  block: RoutineBlock;
  isCompleted: boolean;
  isCurrent: boolean;
  onToggle: () => void;
}

export default function RoutineBlockCard({ block, isCompleted, isCurrent, onToggle }: RoutineBlockCardProps) {
  const duration = formatDuration(calculateBlockDuration(block.startTime, block.endTime));

  const getIcon = () => {
    if (block.icon) return <span className="text-base leading-none">{block.icon}</span>;
    return <Clock size={18} />;
  };

  const getColorClass = () => {
    if (isCompleted) return 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400';
    if (isCurrent) return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
    return 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700';
  };

  return (
    <div className={`p-4 rounded-lg border shadow-sm transition-all ${getColorClass()} ${isCompleted ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className={`mt-1 p-2 rounded-md ${isCurrent ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
            {getIcon()}
          </div>
          <div>
            <h4 className={`text-base font-medium ${isCompleted ? 'line-through' : 'text-gray-900 dark:text-gray-100'}`}>
              {block.title}
            </h4>
            <div className="flex items-center mt-1 text-sm text-gray-500 space-x-3">
              <span className="flex items-center space-x-1 font-mono">
                <Clock size={14} />
                <span>{block.startTime} - {block.endTime}</span>
              </span>
              <span>•</span>
              <span>{duration}</span>
            </div>
            {block.description && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{block.description}</p>
            )}
          </div>
        </div>
        
        <div className="pt-2">
          <RoutineCompletionToggle isCompleted={isCompleted} onToggle={onToggle} />
        </div>
      </div>
    </div>
  );
}

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
    if (isCompleted) return 'border-border bg-muted/40 text-muted-foreground';
    if (isCurrent) return 'glow-primary border-primary/40 bg-primary/10';
    return 'glass-panel border-white/10 dark:border-white/10';
  };

  return (
    <div className={`p-4 rounded-lg border shadow-soft transition-all duration-300 ease-out-expo ${getColorClass()} ${isCompleted ? 'opacity-75' : ''} hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className={`mt-1 p-2 rounded-md ${isCompleted ? 'bg-muted-foreground/10 text-muted-foreground' : isCurrent ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {getIcon()}
          </div>
          <div>
            <h4 className={`text-base font-medium ${isCompleted ? 'line-through' : 'text-foreground'}`}>
              {block.title}
            </h4>
            <div className="flex items-center mt-1 text-sm text-muted-foreground space-x-3">
              <span className="flex items-center space-x-1 font-mono">
                <Clock size={14} />
                <span>{block.startTime} - {block.endTime}</span>
              </span>
              <span>•</span>
              <span>{duration}</span>
            </div>
            {block.description && (
              <p className="mt-2 text-sm text-muted-foreground">{block.description}</p>
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

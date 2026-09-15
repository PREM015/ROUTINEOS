"use client";

import { Check } from "lucide-react";

export default function RoutineCompletionToggle({ isCompleted, onToggle }: { isCompleted: boolean, onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
        isCompleted 
          ? 'bg-green-500 border-green-500 text-white' 
          : 'border-gray-300 dark:border-gray-600 hover:border-green-400 text-transparent hover:text-green-200'
      }`}
      title={isCompleted ? "Mark incomplete" : "Mark complete"}
    >
      <Check size={18} strokeWidth={3} className={isCompleted ? "opacity-100" : "opacity-0 hover:opacity-50"} />
    </button>
  );
}

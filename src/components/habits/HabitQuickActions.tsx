"use client";

import { Habit } from "@/types/habit";
import { useState, useRef, useEffect } from "react";
import { MoreVertical, FastForward, PauseCircle, Edit2, Archive, CheckCircle } from "lucide-react";

interface HabitQuickActionsProps {
  habit: Habit;
  onSkip: () => void;
}

export default function HabitQuickActions({ habit, onSkip }: HabitQuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-100 dark:border-gray-700 z-10 py-1">
          <button 
            onClick={() => handleAction(onSkip)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2"
          >
            <FastForward size={16} />
            <span>Skip Today</span>
          </button>
          
          <button 
            onClick={() => handleAction(() => console.log('Pause', habit.id))}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2"
          >
            <PauseCircle size={16} />
            <span>Pause Habit</span>
          </button>
          
          <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
          
          <button 
            onClick={() => handleAction(() => console.log('Edit', habit.id))}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2"
          >
            <Edit2 size={16} />
            <span>Edit</span>
          </button>
          
          <button 
            onClick={() => handleAction(() => console.log('Archive', habit.id))}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
          >
            <Archive size={16} />
            <span>Archive</span>
          </button>
        </div>
      )}
    </div>
  );
}

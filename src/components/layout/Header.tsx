"use client";

import { Flame } from 'lucide-react';

export function Header() {
  return (
    <header className="h-16 border-b flex items-center justify-between px-6 bg-background">
      <h2 className="font-semibold text-lg hidden md:block">RoutineOS</h2>
      <div className="md:hidden font-bold">RoutineOS</div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/10 text-orange-500 rounded-full text-sm font-medium">
          <Flame className="w-4 h-4" />
          <span>12 Day Streak</span>
        </div>
        
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold cursor-pointer">
          U
        </div>
      </div>
    </header>
  );
}

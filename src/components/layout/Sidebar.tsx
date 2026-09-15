"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Calendar, Target, CheckSquare, Settings, Activity, Sparkles } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: 'Today', href: '/today', icon: CheckSquare },
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Habits', href: '/habits', icon: Activity },
    { name: 'Routine', href: '/routine', icon: Calendar },
    { name: 'Goals', href: '/goals', icon: Target },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen border-r bg-card p-4">
      <Link href="/" className="flex items-center gap-2 mb-8 px-2">
        <Sparkles className="w-6 h-6 text-primary" />
        <span className="font-bold text-lg">RoutineOS</span>
      </Link>
      
      <nav className="flex-1 space-y-1">
        {links.map(link => {
          const Icon = link.icon;
          const isActive = pathname.startsWith(link.href);
          
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              {link.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

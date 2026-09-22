"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Target, CheckSquare, Settings, Activity } from 'lucide-react';

export function MobileNav() {
  const pathname = usePathname();

  const links = [
    { name: 'Today', href: '/today', icon: CheckSquare },
    { name: 'Habits', href: '/habits', icon: Activity },
    { name: 'Dash', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Goals', href: '/goals', icon: Target },
    { name: 'More', href: '/settings', icon: Settings },
  ];

  return (
    <nav aria-label="Mobile" className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-background flex items-center justify-around px-2 z-50">
      {links.map(link => {
        const Icon = link.icon;
        const isActive = pathname.startsWith(link.href);
        
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{link.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileNav;

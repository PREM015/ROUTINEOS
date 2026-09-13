'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, UserCircle2 } from 'lucide-react';
import QuoteDisplay from '@/components/dashboard/QuoteDisplay';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-[#050816] text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-semibold text-white">RoutineOS</Link>
            <nav className="hidden items-center gap-3 text-sm text-slate-300 md:flex">
              <Link href="/" className="rounded-lg px-3 py-2 hover:bg-slate-800">Today</Link>
              <Link href="/habits" className="rounded-lg px-3 py-2 hover:bg-slate-800">Habits</Link>
              <Link href="/routine" className="rounded-lg px-3 py-2 hover:bg-slate-800">Routine</Link>
              <Link href="/goals" className="rounded-lg px-3 py-2 hover:bg-slate-800">Goals</Link>
              <Link href="/settings" className="rounded-lg px-3 py-2 hover:bg-slate-800">Settings</Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 md:flex md:items-center md:gap-2">
              <UserCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{session?.user?.name || 'User'}</span>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <QuoteDisplay />
        {children}
      </main>

      <footer className="border-t border-slate-800 bg-slate-950/80">
        <div className="mx-auto max-w-5xl px-4 py-5 text-center text-sm italic text-slate-300 sm:px-6">
          “The day you plant the tree is not the day you eat the fruit. Be patient, keep watering it, and trust the process.”
        </div>
      </footer>
    </div>
  );
}

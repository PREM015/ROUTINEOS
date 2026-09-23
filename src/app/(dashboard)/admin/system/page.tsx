'use client';

/**
 * Admin System
 * Composes the read-only system widgets behind an ADMIN role guard:
 *   - SystemStats  -> GET /api/admin/stats
 *   - SystemHealth -> GET /api/admin/analytics
 */

import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShieldAlert, ShieldX } from 'lucide-react';
import { SystemStats } from '@/components/admin/SystemStats';
import { SystemHealth } from '@/components/admin/SystemHealth';

export default function AdminSystemPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-7xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-28 rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldX className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">Access denied</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You need administrator privileges to view this page.
            </p>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">System Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Raw statistics and health indicators for the platform.
        </p>
      </div>

      <div className="space-y-6">
        <SystemStats />
        <SystemHealth />
      </div>
    </main>
  );
}
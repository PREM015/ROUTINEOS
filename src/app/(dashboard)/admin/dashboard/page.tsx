'use client';

/**
 * Admin Dashboard
 * Composes the read-only admin widgets behind an ADMIN role guard. Each widget
 * fetches its own data:
 *   - SystemStats   -> GET /api/admin/stats
 *   - SystemHealth  -> GET /api/admin/analytics
 *   - AuditLogTable -> GET /api/admin/audit-log
 */

import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShieldAlert, ShieldX } from 'lucide-react';
import { SystemStats } from '@/components/admin/SystemStats';
import { SystemHealth } from '@/components/admin/SystemHealth';
import { AuditLogTable } from '@/components/admin/AuditLogTable';

function AdminLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-7xl px-4 py-8">
        <AdminLoading />
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
            <p className="mt-2 text-sm text-gray-600">
              You must be signed in to view the admin dashboard.
            </p>
            <a
              href="/login"
              className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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
            <ShieldX className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-bold">Access denied</h1>
            <p className="mt-2 text-sm text-gray-600">
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
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Platform-wide statistics, system health and audit activity.
        </p>
      </div>

      <div className="space-y-6">
        <SystemStats />
        <SystemHealth />
        <Card>
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-bold">Audit Log</h2>
            <p className="mt-1 text-sm text-gray-600">
              Recent security and activity events.
            </p>
          </div>
          <AuditLogTable />
        </Card>
      </div>
    </main>
  );
}
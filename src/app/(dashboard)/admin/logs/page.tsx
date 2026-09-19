'use client';

/**
 * Admin Logs
 * Renders the read-only audit log table. The table component fetches
 * GET /api/admin/audit-log itself; per-user drill-downs are available on the
 * admin user detail page.
 */

import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShieldAlert, ShieldX } from 'lucide-react';
import { AuditLogTable } from '@/components/admin/AuditLogTable';

export default function AdminLogsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-80 rounded-xl" />
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
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-600">
          Security and activity events across the platform.
        </p>
      </div>

      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold">Recent events</h2>
        </div>
        <AuditLogTable />
      </Card>
    </main>
  );
}
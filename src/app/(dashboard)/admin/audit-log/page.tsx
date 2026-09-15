import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuditLogTable } from '@/components/admin/AuditLogTable';

export default async function AdminAuditLogPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <AuditLogTable />
    </div>
  );
}

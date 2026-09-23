import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AuditLogTable } from '@/components/admin/AuditLogTable';

export default async function AdminAuditLogPage() {
  const session = await auth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- session role guard
  if ((session?.user as any)?.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <AuditLogTable />
    </div>
  );
}

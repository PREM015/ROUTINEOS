import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { UserTable } from '@/components/admin/UserTable';

export default async function AdminUsersPage() {
  const session = await auth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- session role guard
  if ((session?.user as any)?.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">User Management</h1>
      <UserTable />
    </div>
  );
}

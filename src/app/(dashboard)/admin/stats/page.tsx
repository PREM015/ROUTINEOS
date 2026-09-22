import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SystemStats } from '@/components/admin/SystemStats';

export default async function AdminStatsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">System Statistics</h1>
      <SystemStats />
    </div>
  );
}

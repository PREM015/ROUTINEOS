import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { Metadata } from 'next';
import HabitDetailClient from './HabitDetailClient';

interface HabitDetailPageProps {
  params: { id: string };
}

// ── Server-side metadata ──────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: HabitDetailPageProps
): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: 'Habit' };

  try {
    const repo = new HabitRepository();
    const habit = await repo.findWithRelations(params.id, session.user.id);
    return {
      title: habit ? `${habit.name} — RoutineOS` : 'Habit — RoutineOS',
      description: habit?.description ?? undefined,
    };
  } catch {
    return { title: 'Habit — RoutineOS' };
  }
}

// ── Server component — auth + ownership guard ────────────────────────────────
export default async function HabitDetailPage({ params }: HabitDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const repo = new HabitRepository();
  const habit = await repo.findWithRelations(params.id, session.user.id);

  if (!habit) notFound();

  // Pass serialisable data down to the client shell
  return <HabitDetailClient habit={JSON.parse(JSON.stringify(habit))} />;
}

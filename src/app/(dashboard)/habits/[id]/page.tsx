import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { Metadata } from 'next';
import HabitDetailClient from './HabitDetailClient';
import { userIdFromSession } from '@/types/ids';

/**
 * `params` is a Promise in Next 15+ (synchronous access was removed in 16).
 * Declaring it as a plain object made `params.id` `undefined` at runtime, so
 * this page either 404'd or — worse — resolved to an arbitrary habit of the
 * user via `findFirst({ where: { userId } })` and titled itself with that
 * habit's name. Every habit link in the app led here.
 */
interface HabitDetailPageProps {
  params: Promise<{ id: string }>;
}

// ── Server-side metadata ──────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: HabitDetailPageProps
): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: 'Habit' };

  try {
    const { id } = await params;
    const repo = new HabitRepository();
    const habit = await repo.findWithRelations(id, userIdFromSession(session));
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

  const { id } = await params;
  const repo = new HabitRepository();
  const habit = await repo.findWithRelations(id, userIdFromSession(session));

  if (!habit) notFound();

  // Pass serialisable data down to the client shell
  return <HabitDetailClient habit={JSON.parse(JSON.stringify(habit))} />;
}

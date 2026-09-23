'use client';

import { useEffect, useMemo, useState } from 'react';
import { Award, Flame, Trophy } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

interface SafeUser {
  id: string;
  name: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface UserStats {
  totalHabits: number;
  activeHabits: number;
  totalGoals: number;
  completedGoals: number;
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
  averageScore: number;
}

interface ProfileResponse {
  profile: SafeUser;
  stats: UserStats;
}

interface LeaderboardRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  averageScore: number;
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Leaderboard Page
 * Ranks community members by their 90-day average score, with streak stats.
 */
export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const users = await apiRequest<SafeUser[]>('/api/users/search?q=&limit=25');
        const profiles = await Promise.all(
          users.map(async (user): Promise<LeaderboardRow | null> => {
            try {
              const data = await apiRequest<ProfileResponse>(`/api/users/${user.id}/profile`);
              return {
                id: user.id,
                name: data.profile.displayName ?? data.profile.name ?? 'Anonymous',
                avatarUrl: data.profile.avatarUrl ?? user.avatarUrl,
                averageScore: data.stats.averageScore,
                currentStreak: data.stats.currentStreak,
                longestStreak: data.stats.longestStreak,
                totalDays: data.stats.totalDays,
              };
            } catch {
              return null;
            }
          }),
        );
        if (!cancelled) {
          setRows(
            profiles
              .filter((row): row is LeaderboardRow => row !== null)
              .sort(
                (a, b) =>
                  b.averageScore - a.averageScore ||
                  b.currentStreak - a.currentStreak ||
                  b.totalDays - a.totalDays,
              ),
          );
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const top = useMemo(() => rows?.slice(0, 3) ?? [], [rows]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Trophy className="h-7 w-7 text-amber-500" />
          Leaderboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Community members ranked by 90-day average score and consistency.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!rows ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Award className="h-10 w-10 text-muted-foreground/60" />}
          title="No one to rank yet"
          description="Once more people join and track their routines, they will appear here."
        />
      ) : (
        <>
          {top.length > 0 && (
            <div className="mb-6 grid grid-cols-3 gap-3">
              {top.map((row, index) => (
                <Card
                  key={row.id}
                  className={cn(
                    'flex flex-col items-center p-4 text-center',
                    index === 0 && 'ring-2 ring-amber-400',
                  )}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {MEDALS[index] ?? '🏅'}
                  </span>
                  <p className="mt-2 truncate text-sm font-semibold text-foreground">{row.name}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-primary">
                    {Math.round(row.averageScore)}
                  </p>
                  <p className="text-xs text-muted-foreground">avg score</p>
                </Card>
              ))}
            </div>
          )}

          <Card className="divide-y divide-border p-0">
            {rows.map((row, index) => (
              <div key={row.id} className="flex items-center gap-3 p-4">
                <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    row.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {row.name}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                  <Flame className="h-3.5 w-3.5" />
                  {row.currentStreak}
                </span>
                <span className="w-14 text-right text-sm font-bold tabular-nums text-foreground">
                  {Math.round(row.averageScore)}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

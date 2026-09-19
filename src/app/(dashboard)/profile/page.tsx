'use client';

import { useEffect, useState } from 'react';
import { Award, Flame, Target, User as UserIcon } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Badge, Button, Card, Input, Spinner, Textarea } from '@/components/ui';

interface ProfileStats {
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
  profile: {
    id: string;
    name: string | null;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    timezone: string;
    preferredLanguage: string;
  };
  stats: ProfileStats;
}

/**
 * Profile Page
 * View aggregated stats and edit the signed-in user's profile details.
 */
export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [timezone, setTimezone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setDisplayName(user.displayName ?? '');
    setBio(user.bio ?? '');
    setAvatarUrl(user.avatarUrl ?? '');
    setTimezone(user.timezone ?? 'UTC');
    setPreferredLanguage(user.preferredLanguage ?? 'en');
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiRequest<ProfileResponse>(`/api/users/${user.id}/profile`);
        if (!cancelled) setStats(data.stats);
      } catch {
        // Stats are non-critical; ignore failures.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const patch = {
      name: name.trim() || null,
      displayName: displayName.trim() || null,
      bio: bio.trim() || null,
      avatarUrl: avatarUrl.trim() || null,
      timezone,
      preferredLanguage,
    };
    try {
      await apiRequest('/api/auth/update-profile', { method: 'PATCH', body: patch });
      updateUser(patch);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-xl font-semibold text-gray-500">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            (user.displayName ?? user.name ?? user.email).charAt(0).toUpperCase()
          )}
        </span>
        <div>
          <h1 className="text-3xl font-bold">{user.displayName ?? user.name ?? 'Your profile'}</h1>
          <p className="text-gray-600">{user.email}</p>
        </div>
      </div>

      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Current streak', value: stats.currentStreak, icon: <Flame className="h-3.5 w-3.5" /> },
            { label: 'Longest streak', value: stats.longestStreak, icon: <Award className="h-3.5 w-3.5" /> },
            { label: 'Avg score', value: Math.round(stats.averageScore), icon: <Target className="h-3.5 w-3.5" /> },
            { label: 'Goals done', value: stats.completedGoals, icon: <Target className="h-3.5 w-3.5" /> },
          ].map((item) => (
            <Card key={item.label} className="p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                {item.icon}
                {item.label}
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{item.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <UserIcon className="h-5 w-5 text-blue-600" />
          Edit profile
        </h2>
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <Input
            label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Textarea
            label="Bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={3}
          />
          <Input
            label="Avatar URL"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://…"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="UTC"
            />
            <Input
              label="Preferred language"
              value={preferredLanguage}
              onChange={(event) => setPreferredLanguage(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {saved && (
            <p className="text-sm text-green-600" aria-live="polite">
              Profile saved.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void save()} isLoading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Badge variant="default">Role: {user.role}</Badge>
        {user.twoFactorEnabled && <Badge variant="success">2FA enabled</Badge>}
        {user.onboardingCompletedAt && <Badge variant="primary">Onboarded</Badge>}
      </div>
    </div>
  );
}

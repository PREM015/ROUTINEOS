'use client';

/**
 * Admin User Detail
 * Loads a user's public profile + aggregated stats (GET /api/users/[id]/profile)
 * and their audit trail (GET /api/admin/audit-log?userId=<id>). Admin controls
 * update the role/active state via PATCH /api/admin/users/[id] and delete the
 * account via DELETE /api/admin/users/[id].
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldAlert, ShieldX, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { getRelativeTime } from '@/lib/utils';

interface ProfileUser {
  id: string;
  name: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  timezone: string;
  preferredLanguage: string;
  onboardingCompletedAt: string | null;
  createdAt: string;
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

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  location: string | null;
  createdAt: string;
}

interface AdminUserRow {
  id: string;
  role: string;
  isActive: boolean;
}

const ROLE_OPTIONS = [
  { value: 'USER', label: 'User' },
  { value: 'MODERATOR', label: 'Moderator' },
  { value: 'ADMIN', label: 'Admin' },
];

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const { user: me, isAuthenticated, isLoading: authLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<string>('USER');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileData, logsData, adminRow] = await Promise.all([
        apiRequest<{ profile: ProfileUser; stats: UserStats }>(
          `/api/users/${userId}/profile`
        ),
        apiRequest<AuditLogEntry[]>('/api/admin/audit-log', {
          query: { userId, limit: 100 },
        }),
        apiRequest<AdminUserRow>(`/api/admin/users/${userId}`),
      ]);
      setProfile(profileData.profile);
      setStats(profileData.stats);
      setLogs(logsData);
      setRole(adminRow.role);
      setIsActive(adminRow.isActive);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !me) {
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

  if (me.role !== 'ADMIN') {
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

  if (!userId) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <Card className="p-8 text-center text-sm text-gray-600">Invalid user id.</Card>
      </main>
    );
  }

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: { role, isActive },
      });
      setNotice('User updated.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!userId) return;
    if (!window.confirm('Delete this user account? This action cannot be undone.')) return;
    setDeleting(true);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
      setNotice('User account deleted.');
      setProfile(null);
      setStats(null);
      setLogs([]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to delete user.');
    } finally {
      setDeleting(false);
    }
  };

  const statCards = stats
    ? [
        { label: 'Habits', value: `${stats.totalHabits} (${stats.activeHabits} active)` },
        { label: 'Goals', value: `${stats.totalGoals} (${stats.completedGoals} completed)` },
        { label: 'Streak', value: `${stats.currentStreak} current / ${stats.longestStreak} longest` },
        { label: 'Completions', value: String(stats.totalDays) },
        { label: 'Avg score', value: stats.averageScore.toFixed(1) },
      ]
    : [];

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <a href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </a>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading && !profile && (
        <div className="mt-6 space-y-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {!loading && profile && (
        <div className="mt-6 space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  {profile.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatarUrl}
                      alt={profile.name ?? 'User avatar'}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
                      {(profile.displayName ?? profile.name ?? profile.id).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h1 className="text-2xl font-bold">{profile.displayName ?? profile.name ?? 'Unnamed user'}</h1>
                    <p className="mt-1 text-sm text-gray-600">{profile.bio ?? 'No bio yet.'}</p>
                  </div>
                </div>
                <Badge variant={isActive ? 'success' : 'danger'}>
                  {isActive ? 'Active' : 'Suspended'}
                </Badge>
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">User id</dt>
                  <dd className="mt-1 font-mono text-sm">{profile.id}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Timezone</dt>
                  <dd className="mt-1 text-sm">{profile.timezone}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Language</dt>
                  <dd className="mt-1 text-sm">{profile.preferredLanguage}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Joined</dt>
                  <dd className="mt-1 text-sm">{new Date(profile.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Onboarding</dt>
                  <dd className="mt-1 text-sm">
                    {profile.onboardingCompletedAt ? 'Completed' : 'Pending'}
                  </dd>
                </div>
              </dl>

              {notice && (
                <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                  {notice}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 border-t border-gray-100 pt-6 sm:grid-cols-2">
                <div>
                  <Select
                    label="Role"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    options={ROLE_OPTIONS}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <Switch checked={isActive} onChange={setIsActive} label="Account active" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={handleSave} isLoading={saving} disabled={deleting}>
                  Save changes
                </Button>
                <Button variant="danger" onClick={handleDelete} isLoading={deleting} disabled={saving || profile.id === me.id}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete account
                </Button>
                {profile.id === me.id && (
                  <span className="self-center text-xs text-gray-500">
                    You cannot delete your own account.
                  </span>
                )}
              </div>
            </div>
          </Card>

          {statCards.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {statCards.map((stat) => (
                <Card key={stat.label} className="p-4">
                  <h3 className="text-xs font-medium uppercase text-gray-500">{stat.label}</h3>
                  <p className="mt-2 text-base font-semibold text-gray-900">{stat.value}</p>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-bold">Activity</h2>
              <p className="mt-1 text-sm text-gray-600">
                Audit trail for this user (GET /api/admin/audit-log?userId=...).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3">When</th>
                    <th className="px-6 py-3">Action</th>
                    <th className="px-6 py-3">Resource</th>
                    <th className="px-6 py-3">IP / Location</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        No activity recorded.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-6 py-3 whitespace-nowrap">
                          {getRelativeTime(log.createdAt)}
                        </td>
                        <td className="px-6 py-3">
                          <Badge>{log.action}</Badge>
                        </td>
                        <td className="px-6 py-3">
                          <span className="font-mono text-xs">
                            {log.entityType ?? '-'}
                            {log.entityId ? ` / ${log.entityId}` : ''}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {log.ipAddress ?? '-'}
                          {log.location ? ` · ${log.location}` : ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
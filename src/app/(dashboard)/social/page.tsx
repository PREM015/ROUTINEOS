'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Search, UserPlus, UserMinus, Users } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Button, Card, EmptyState, Input, Spinner } from '@/components/ui';

type Tab = 'following' | 'followers' | 'discover';

interface SocialUser {
  id: string;
  name: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isMutual?: boolean;
}

function displayName(user: SocialUser): string {
  return user.displayName ?? user.name ?? 'Anonymous';
}

function UserRow({
  user,
  action,
}: {
  user: SocialUser;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          displayName(user).charAt(0).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{displayName(user)}</span>
        {user.isMutual && <span className="text-xs text-gray-500">Follows you back</span>}
      </span>
      {action}
    </div>
  );
}

/**
 * Social Page
 * Manage who you follow, see your followers, and discover new people.
 */
export default function SocialPage() {
  const [tab, setTab] = useState<Tab>('following');
  const [following, setFollowing] = useState<SocialUser[] | null>(null);
  const [followers, setFollowers] = useState<SocialUser[] | null>(null);
  const [results, setResults] = useState<SocialUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    try {
      const [followingData, followersData] = await Promise.all([
        apiRequest<SocialUser[]>('/api/social/following'),
        apiRequest<SocialUser[]>('/api/social/followers'),
      ]);
      setFollowing(followingData);
      setFollowers(followersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const search = useCallback(async (value: string) => {
    if (value.trim().length === 0) {
      setResults(null);
      return;
    }
    try {
      const data = await apiRequest<SocialUser[]>(
        `/api/users/search?q=${encodeURIComponent(value.trim())}&limit=20`,
      );
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  }, []);

  useEffect(() => {
    if (tab !== 'discover') return;
    const timer = setTimeout(() => void search(query), 300);
    return () => clearTimeout(timer);
  }, [query, tab, search]);

  const follow = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    try {
      await apiRequest('/api/social/follow', { method: 'POST', body: { userId } });
      await loadLists();
      if (tab === 'discover') await search(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to follow user');
    } finally {
      setBusyId(null);
    }
  };

  const unfollow = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    try {
      await apiRequest('/api/social/unfollow', { method: 'POST', body: { userId } });
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unfollow user');
    } finally {
      setBusyId(null);
    }
  };

  const list = tab === 'following' ? following : tab === 'followers' ? followers : results;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Users className="h-7 w-7 text-blue-600" />
          Social
        </h1>
        <p className="mt-2 text-gray-600">Connect with others and follow their progress.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            { id: 'following', label: `Following${following ? ` (${following.length})` : ''}` },
            { id: 'followers', label: `Followers${followers ? ` (${followers.length})` : ''}` },
            { id: 'discover', label: 'Discover' },
          ] as const
        ).map((item) => (
          <Button
            key={item.id}
            variant={tab === item.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {tab === 'discover' && (
        <div className="mb-6">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, display name or email…"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
      )}

      {!list ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10 text-gray-300" />}
          title={
            tab === 'following'
              ? 'Not following anyone yet'
              : tab === 'followers'
                ? 'No followers yet'
                : 'No matching users'
          }
          description={
            tab === 'discover'
              ? 'Try a different search term.'
              : 'Use Discover to find people to follow.'
          }
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {list.map((user) => {
            const isFollowing = (following ?? []).some((item) => item.id === user.id);
            if (tab === 'followers') {
              return (
                <UserRow
                  key={user.id}
                  user={user}
                  action={
                    !isFollowing ? (
                      <Button
                        size="sm"
                        onClick={() => void follow(user.id)}
                        isLoading={busyId === user.id}
                      >
                        <UserPlus className="mr-1.5 h-4 w-4" />
                        Follow
                      </Button>
                    ) : undefined
                  }
                />
              );
            }
            return (
              <UserRow
                key={user.id}
                user={user}
                action={
                  isFollowing ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void unfollow(user.id)}
                      isLoading={busyId === user.id}
                    >
                      <UserMinus className="mr-1.5 h-4 w-4" />
                      Unfollow
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void follow(user.id)}
                      isLoading={busyId === user.id}
                    >
                      <UserPlus className="mr-1.5 h-4 w-4" />
                      Follow
                    </Button>
                  )
                }
              />
            );
          })}
        </Card>
      )}
    </div>
  );
}

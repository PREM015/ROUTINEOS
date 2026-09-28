"use client";

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastActive: string;
  _count: { habits: number };
}

export function UserTable() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One loader, used by both the mount fetch and the retry, so the two cannot
  // drift apart.
  const load = useCallback(async (isCancelled: () => boolean) => {
    try {
      setError(null);
      const res = await fetch('/api/admin/users');
      // `res.ok` was never checked, so a 403 or 500 parsed to an object with no
      // `users` key and became an empty table. The `.catch(() => setLoading(false))`
      // did the same for a network failure — an admin table that looks like
      // "no users exist", with no way to tell it from a real result.
      if (!res.ok) {
        throw new Error(`Could not load users (status ${res.status})`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Could not load users');
      }
      if (!isCancelled()) setUsers(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof Error ? err.message : 'Could not load users');
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) return <div>Loading users...</div>;

  if (error) {
    return (
      <div>
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load(() => false);
          }}
          className="mt-2 text-sm font-semibold text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-muted/50">
          <tr>
            <th className="px-6 py-3">User</th>
            <th className="px-6 py-3">Role</th>
            <th className="px-6 py-3">Joined</th>
            <th className="px-6 py-3">Habits</th>
            <th className="px-6 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="bg-card border-b border-border/60">
              <td className="px-6 py-4 font-medium">
                {user.name} <br/><span className="text-muted-foreground">{user.email}</span>
              </td>
              <td className="px-6 py-4"><Badge>{user.role}</Badge></td>
              <td className="px-6 py-4">{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
              <td className="px-6 py-4">{user._count?.habits || 0}</td>
              <td className="px-6 py-4 space-x-2">
                <Button size="sm" variant="outline">View</Button>
                <Button size="sm" variant="danger">Suspend</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

/**
 * Settings — Account
 * Edits the signed-in user's profile via PATCH /api/auth/update-profile and
 * updates the local auth store so the sidebar reflects changes immediately.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';

interface ProfilePatch {
  name?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

export default function AccountSettingsPage() {
  const { user, isAuthenticated, isLoading, updateUser } = useAuth();

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setDisplayName(user.displayName ?? '');
      setBio(user.bio ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: ProfilePatch = {
        name: name.trim(),
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
      };
      await apiRequest('/api/auth/update-profile', { method: 'PATCH', body: patch });
      updateUser({
        name: patch.name,
        displayName: patch.displayName ?? null,
        bio: patch.bio ?? null,
        avatarUrl: patch.avatarUrl ?? null,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
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

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Update your public profile information.
        </p>
      </div>

      <Card>
        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your full name"
            />
            <Input
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How others see you"
              helperText="Fallback to your name when empty."
            />
          </div>

          <div className="mt-4">
            <Input
              label="Avatar URL"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…"
              helperText="Accepted as-is; invalid images are ignored client-side."
            />
          </div>

          <div className="mt-4">
            <Textarea
              label="Bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="A short introduction (max 500 characters)"
            />
          </div>

          <div className="mt-4">
            <Input
              label="Email"
              value={user.email}
              readOnly
              disabled
              helperText="Email changes are managed by the authentication provider."
            />
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => void save()} isLoading={saving} disabled={name.trim().length < 2}>
              Save profile
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}
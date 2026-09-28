'use client';

/**
 * Settings — Profile
 * Edits the signed-in user's public profile via PATCH /api/auth/update-profile
 * and updates the local auth store so the sidebar reflects changes immediately.
 *
 * Emptied fields are sent as `null`, not `undefined`: `JSON.stringify` drops
 * `undefined` properties, so the old payload omitted them entirely and clearing
 * a display name, bio or avatar silently did nothing.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export default function ProfileSettingsPage() {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync profile form state on mount
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
      // `null` (not `undefined`) for cleared fields so the server actually
      // receives the key and nulls the column.
      const patch: ProfilePatch = {
        name: name.trim(),
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
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
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
              maxLength={50}
            />
            <Input
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How others see you"
              maxLength={50}
              helperText="Clear this to fall back to your name."
            />
          </div>

          <div className="mt-4">
            <Input
              label="Avatar URL"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…"
              helperText="Must be a valid URL. Clear this to remove your avatar."
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
              helperText="Clear this to remove your bio."
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
            <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} isLoading={saving} disabled={name.trim().length < 2}>
              Save profile
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Saved
              </span>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}
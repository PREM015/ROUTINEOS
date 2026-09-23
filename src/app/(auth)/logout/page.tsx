'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

/**
 * Logout confirmation page.
 *
 * Single NextAuth `signOut` call with `callbackUrl: '/login'` — no custom
 * logout endpoint, no extra router navigation (the cause of the / ↔ /login
 * loop). NextAuth performs the one redirect itself.
 */

export default function LogoutPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await signOut({ callbackUrl: '/login' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out');
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <LogOut className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-foreground mb-2">Sign out</h1>
      <p className="text-center text-muted-foreground mb-8">
        Are you sure you want to sign out of RoutineOS?
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive text-center mb-4">
          {error}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        isLoading={loading}
        onClick={handleLogout}
        className="w-full"
      >
        Sign Out
      </Button>

      <Link
        href="/dashboard"
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-card/60 px-4 text-sm font-medium text-foreground transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out-expo hover:bg-muted/60 hover:border-foreground/20 active:scale-[0.97]"
      >
        Cancel
      </Link>
    </AuthCard>
  );
}